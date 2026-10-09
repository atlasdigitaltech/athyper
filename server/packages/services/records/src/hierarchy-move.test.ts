import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepository } from "@athyper/server-contract-records";
import { createInMemoryCommandExecutionStore } from "./in-memory-command-execution-store.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordMutationService } from "./mutation-service.js";

// Moving a node (Entity list Tree blueprint B4, sections 5.6 and 7.5).
const tenantId = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const descriptor = (hierarchy: Partial<NonNullable<EntityRuntimeDescriptor["hierarchy"]>> = {}) =>
  ({
    schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "gl_account", planeKey: "neon", releaseId: "r", releaseNo: 1,
    contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
    storage: { schema: "app", object: "gl_account", idField: "id", tenantField: "tenant_id", versionField: "version" },
    fields: [
      { key: "code", storagePath: "code", type: "string", required: true, writableOn: [] },
      { key: "parent", storagePath: "parent_id", type: "reference", required: false, writableOn: ["patch"], referenceTargetEntity: "gl_account" },
      { key: "chart", storagePath: "chart_id", type: "reference", required: true, writableOn: [] },
      { key: "kind", storagePath: "kind", type: "enum", required: true, writableOn: [], validation: { options: ["summary", "posting"] } },
    ],
    operations: { patch: { code: "patch", permissionCode: "gl_account.patch" } },
    authorization: { schemaVersion: 1 },
    hierarchy: { parentField: "parent", scopeField: "chart", nodeKind: { kind: "choice", field: "kind", branchValues: ["summary"] }, maxDepth: 3, movable: true, ...hierarchy },
  }) as unknown as EntityRuntimeDescriptor;
const context = {
  planeKey: "neon", realmKey: "athyper", tenantId, principalId: "principal", authEpoch: 1, profileHash: "p", requestId: "r",
  permissions: { planeKey: "neon", tenantId, principalId: "principal", principalFingerprint: "f", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
} as unknown as VerifiedRequestContext;
const row = (n: number, code: string, parent: number | null, kind: string, chart = "chart-a") => ({ id: id(n), tenant_id: tenantId, version: 1, code, parent_id: parent ? id(parent) : null, chart_id: chart, kind });

function fixture(described = descriptor(), wrap: (repository: RecordRepository<unknown>) => RecordRepository<unknown> = (repository) => repository) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(described, tenantId, [
    row(1, "1000", null, "summary"), row(2, "1100", 1, "summary"), row(3, "1110", 2, "posting"),
    row(4, "2000", null, "summary"), row(5, "2100", 4, "summary"), row(6, "2110", 5, "summary"),
    row(7, "9000", null, "summary", "chart-b"),
  ]);
  const mutations = createRecordMutationService({
    metadata: { getEntityDescriptor: async () => described },
    authorizer: { entityDescriptorSupported: () => true, authorize: async () => ({ allowed: true }) },
    repository: wrap(persistence.repository as RecordRepository<unknown>),
    transactions: persistence.transactions,
    commandExecutions: createInMemoryCommandExecutionStore(),
    audit: { record: async (input) => ({ ...input, id: "event", createdAt: new Date(), tenantId, eventCode: "t", action: "t", outcome: "success", actor: { kind: "user", principalId: "principal" } }) as never },
    outbox: { append: vi.fn(async () => undefined) },
  } as never);
  let sequence = 0;
  const move = (record: number, parent: number | null | string) =>
    mutations.patch({ context, entityCode: "gl_account", recordId: id(record), input: { parent: typeof parent === "number" ? id(parent) : parent }, expectedVersion: 1, idempotencyKey: `move-command-${String(sequence++).padStart(6, "0")}`, origin: "classic", validationMode: "strict" });
  return { move };
}

describe("moving a node", () => {
  it("moves a node under a branch of the same scope, or to the top level, through the ordinary patch", async () => {
    await expect(fixture().move(3, 4)).resolves.toMatchObject({ kind: "Committed", action: "patch" });
    await expect(fixture().move(2, null)).resolves.toMatchObject({ kind: "Committed" });
  });

  it("refuses a parent in another scope or one that does not exist", async () => {
    await expect(fixture().move(3, 7)).rejects.toMatchObject({ code: "HIERARCHY_PARENT_OUTSIDE_SCOPE", statusCode: 409 });
    await expect(fixture().move(3, 99)).rejects.toMatchObject({ code: "HIERARCHY_PARENT_OUTSIDE_SCOPE" });
  });

  it("refuses a parent whose node kind is a leaf", async () => {
    await expect(fixture().move(5, 3)).rejects.toMatchObject({ code: "HIERARCHY_LEAF_PARENT" });
  });

  it("refuses a move deeper than the maximum depth, counting the moved subtree", async () => {
    // 1100 carries 1110 below it (height 2); 2100 sits at depth 2: 2 + 2 > 3.
    await expect(fixture().move(2, 5)).rejects.toMatchObject({ code: "HIERARCHY_DEPTH_EXCEEDED" });
    // 1110 alone (height 1) fits under 2100: 2 + 1 = 3.
    await expect(fixture().move(3, 5)).resolves.toMatchObject({ kind: "Committed" });
  });

  it("refuses any parent change when the hierarchy is not movable", async () => {
    await expect(fixture(descriptor({ movable: undefined })).move(3, 4)).rejects.toMatchObject({ code: "HIERARCHY_MOVE_UNAVAILABLE" });
  });

  it("maps the database's own refusals without its message text", async () => {
    const failing = (code: string) => (repository: RecordRepository<unknown>) => ({ ...repository, patch: async () => { throw Object.assign(new Error("database text"), { code }); } }) as RecordRepository<unknown>;
    await expect(fixture(descriptor(), failing("23514")).move(3, 4)).rejects.toMatchObject({ code: "HIERARCHY_REJECTED", message: "This move breaks the hierarchy's rules." });
    await expect(fixture(descriptor(), failing("23503")).move(3, 4)).rejects.toMatchObject({ code: "HIERARCHY_PARENT_OUTSIDE_SCOPE" });
  });
});
