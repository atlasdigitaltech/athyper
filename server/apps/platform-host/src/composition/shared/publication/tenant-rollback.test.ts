import { afterEach, expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { KyselyLocalProjectionRepository } from "@athyper/server-service-publication";
import { createTenantRollbackExecutor } from "./tenant-rollback.js";
import { assertRollbackEntityReadiness } from "./rollback-readiness.js";

afterEach(() => vi.restoreAllMocks());
const input = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000002",
  targetAppliedReleaseId: "00000000-0000-4000-8000-000000000003",
  publicationKey: "metadata.entity.country",
  targetPlane: "neon" as const,
  reason: "recover",
  operationId: "rollback-job",
};
function database(rows: (query: string) => readonly unknown[]) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          release() {},
          query: async (query: { text?: string } | string) => {
            const result = rows(
              typeof query === "string" ? query : (query.text ?? ""),
            );
            return { rows: result, rowCount: result.length, command: "SELECT" };
          },
        }),
        end: async () => {},
      } as never,
    }),
  });
}
it.each([false, true])(
  "rollback checks current readiness before mutation, including an exact retry (retry: %s)",
  async (retry) => {
    const events: string[] = [];
    const local = database((query) =>
      query.includes("current_id")
        ? [
            {
              current_id: retry ? input.targetAppliedReleaseId : "current",
              current_source: "source",
              current_hash: "hash",
              target_source: "target",
              target_hash: "target-hash",
            },
          ]
        : [],
    );
    const authority = database((query) =>
      query.includes("deployment_acknowledgement") ? [{}] : [],
    );
    const rollback = vi
      .spyOn(KyselyLocalProjectionRepository.prototype, "rollback")
      .mockImplementation(async () => {
        events.push("mutation");
        return {} as never;
      });
    let ready = false;
    const guard = vi.fn(async (transaction, id, plane) => {
      expect(transaction.isTransaction).toBe(true);
      expect(id).toBe(input.targetAppliedReleaseId);
      expect(plane).toBe("neon");
      events.push("readiness");
      if (!ready) throw Error("ENTITY_DEPLOYMENT_NOT_READY");
    });
    const executor = createTenantRollbackExecutor(
      local,
      authority,
      "neon",
      guard,
    );
    await expect(executor.rollback(input)).rejects.toThrow(
      "ENTITY_DEPLOYMENT_NOT_READY",
    );
    expect(rollback).not.toHaveBeenCalled();
    ready = true;
    await executor.rollback(input);
    expect(events).toEqual(["readiness", "readiness", "mutation"]);
    await Promise.all([local.destroy(), authority.destroy()]);
  },
);
it("rollback cannot treat an invisible target or missing compiled payload as readiness", async () => {
  let target: unknown[] = [];
  const local = database((query) =>
    query.includes("artifact_kind") ? target : [],
  );
  const readiness = { assertActivationDescriptors: vi.fn(async () => {}) };
  await expect(
    assertRollbackEntityReadiness(
      local,
      input.targetAppliedReleaseId,
      "neon",
      readiness,
    ),
  ).rejects.toThrow("PUBLICATION_ROLLBACK_READINESS_TARGET_REQUIRED");
  target = [
    {
      artifact_kind: "compiled_entity_runtime",
      source_release_id: "source",
      source_release_no: 1,
      payload: null,
      descriptor: null,
      descriptor_kind: null,
    },
  ];
  await expect(
    assertRollbackEntityReadiness(
      local,
      input.targetAppliedReleaseId,
      "neon",
      readiness,
    ),
  ).rejects.toThrow("ENTITY_READINESS_INVENTORY_INCOMPLETE");
  expect(readiness.assertActivationDescriptors).not.toHaveBeenCalled();
  await local.destroy();
});
