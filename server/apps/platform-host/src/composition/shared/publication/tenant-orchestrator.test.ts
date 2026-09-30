import { afterEach, expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import {
  KyselyPublicationAuthorityRepository,
  PublicationOrchestrator,
  PublicationOrchestrationError,
} from "@athyper/server-service-publication";
import { TenantPublicationOrchestrator } from "./tenant-orchestrator.js";

afterEach(() => vi.restoreAllMocks());
it("records permanent failure only after both apply transactions roll back", async () => {
  const events: string[] = [];
  const database = (name: string) =>
    new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({
            release() {},
            query: async (query: { text?: string } | string) => {
              events.push(
                `${name}:${typeof query === "string" ? query : query.text}`,
              );
              return { rows: [], rowCount: 0, command: "SELECT" };
            },
          }),
          end: async () => {},
        } as never,
      }),
    });
  const authority = database("authority"),
    local = database("local");
  const failure = new PublicationOrchestrationError(
    "permanent",
    "23514",
    "stage",
  );
  vi.spyOn(PublicationOrchestrator.prototype, "deploy").mockRejectedValue(
    failure,
  );
  vi.spyOn(
    KyselyPublicationAuthorityRepository.prototype,
    "getDeployment",
  ).mockResolvedValue({ deploymentStatus: "pending" } as never);
  vi.spyOn(
    KyselyPublicationAuthorityRepository.prototype,
    "transitionDeployment",
  ).mockImplementation(async (input) => {
    expect(input.status).toBe("failed");
    expect(input.evidence?.code).toBe("23514");
    events.push("failure-written");
  });
  const orchestrator = new TenantPublicationOrchestrator(
    authority,
    local,
    {} as never,
  );
  await expect(
    runWithRequestContext(
      {
        tenantId: "tenant-a",
        principalId: "worker",
        planeKey: "neon",
        requestId: "test",
      },
      () => orchestrator.deploy("deployment"),
    ),
  ).rejects.toBe(failure);
  expect(events.indexOf("local:rollback")).toBeLessThan(
    events.indexOf("failure-written"),
  );
  expect(events.indexOf("authority:rollback")).toBeLessThan(
    events.indexOf("failure-written"),
  );
  expect(events.at(-1)).toBe("authority:commit");
  await Promise.all([authority.destroy(), local.destroy()]);
});

it.each([true, false])("checks approval inside the authority transaction (same database: %s)", async sameDatabase => {
  const events: string[] = [];
  let authorityInUse = false;
  const database = (name: string) => new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool: {
      connect: async () => {
        if (name === "authority") {
          if (authorityInUse) throw Error("pool exhausted");
          authorityInUse = true;
        }
        events.push(`${name}:acquire`);
        return {
          release() { if (name === "authority") authorityInUse = false; },
          query: async (query: {text?: string} | string) => {
            events.push(`${name}:${typeof query === "string" ? query : query.text}`);
            return {rows: [], rowCount: 0, command: "SELECT"};
          },
        };
      }, end: async () => {},
    } as never }),
  });
  const authority = database("authority"), local = sameDatabase ? authority : database("local");
  const guard = vi.fn(async (_deployment, _loaded, transaction) => {
    expect(authorityInUse).toBe(true);
    expect(transaction.isTransaction).toBe(true);
    // A revoked approval must still fail and roll back the whole apply.
    throw new PublicationOrchestrationError("transient", "APPROVAL_REVOKED", "verify");
  });
  vi.spyOn(PublicationOrchestrator.prototype, "deploy").mockImplementation(async function () {
    await Reflect.get(this, "authorizeActivation")({}, {});
    throw Error("unreachable");
  });
  const orchestrator = new TenantPublicationOrchestrator(authority, local, {} as never, guard);
  await expect(runWithRequestContext({tenantId:"tenant-a",principalId:"worker",planeKey:"studio",requestId:"test"},
    () => orchestrator.deploy("deployment"))).rejects.toMatchObject({code:"APPROVAL_REVOKED"});
  expect(guard).toHaveBeenCalledOnce();
  expect(events.filter(event => event === "authority:acquire")).toHaveLength(1);
  expect(events).toContain("authority:rollback");
  if (!sameDatabase) expect(events).toContain("local:rollback");
  await authority.destroy();
  if (!sameDatabase) await local.destroy();
});
