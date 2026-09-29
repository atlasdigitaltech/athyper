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
