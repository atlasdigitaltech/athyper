import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { KyselyLocalProjectionRepository } from "../kysely-local-projection-repository.js";
import { assertOperationProjection, compileOperationProjection } from "../shared/authorization/operation-projection.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  return { native: { entity: { entityCode: "example" }, operations: [{ id: id(1), operationKey: "read" }],
    operationPermissions: [{ id: id(2), entityOperationId: id(1), targetPlane: "neon", permissionCode: "neon.example.record.read", permissionKind: "entity_operation" }],
    operationScopeBindings: [{ id: id(3), entityOperationId: id(1), targetPlane: "neon", scopeKind: "tenant", coordinateSource: "tenant_context", missingValueBehavior: "deny", decisionMode: "entity_resource" }],
  }, descriptor: { entityCode: "example", operations: { read: { permissionCode: "neon.example.record.read", authorizationMode: "bound_operation" } } },
  plane: "neon", sourceEntityId: id(4), sourceReleaseHash: "e".repeat(64),
  permissions: [{ id: id(5), code: "neon.example.record.read", kind: "entity_operation", scopeKinds: ["tenant"] }] };
}
it("preserves source identity and resolves the target catalog ID, without modifying its source", () => {
  const f = fixture(), before = structuredClone(f);
  const compiled = compileOperationProjection(f);
  expect(compiled.source).toEqual({ entity_id: id(4), release_hash: "e".repeat(64) });
  expect(compiled.operation_scope_bindings[0]).toMatchObject({ bindingId: id(2), scopeBindingId: id(3), sourceEntityOperationId: id(1), permissionId: id(5) });
  f.permissions[0]!.id = id(6);
  expect(compileOperationProjection(f).operation_scope_bindings[0]!.permissionId).toBe(id(6));
  expect(f.native).toEqual(before.native);
});
it.each(["missing", "duplicate", "wrong-kind", "scope", "plane", "allow-missing", "orphan", "source", "id"])("rejects %s source/catalog bindings", failure => {
  const f = fixture();
  if (failure === "missing") f.native.operationScopeBindings = [];
  if (failure === "duplicate") f.native.operationPermissions.push(f.native.operationPermissions[0]!);
  if (failure === "wrong-kind") f.permissions[0]!.kind = "capability";
  if (failure === "scope") f.permissions[0]!.scopeKinds = [];
  if (failure === "plane") f.native.operationScopeBindings[0]!.targetPlane = "mesh";
  if (failure === "allow-missing") f.native.operationScopeBindings[0]!.missingValueBehavior = "allow";
  if (failure === "orphan") f.native.operationScopeBindings[0]!.entityOperationId = id(8);
  if (failure === "source") f.sourceReleaseHash = "";
  if (failure === "id") f.native.operationPermissions[0]!.id = "";
  expect(() => compileOperationProjection(f)).toThrow("PUBLICATION_OPERATION_");
});
it.each(["missing", "extra", "permission", "source", "duplicate-scope", "coordinate", "mixed-mode", "missing-operation"])("rejects %s runtime projection", failure => {
  const f = fixture();
  const descriptor: Record<string, unknown> = { ...f.descriptor, ...compileOperationProjection(f) };
  const bindings = descriptor.operation_scope_bindings as Record<string, unknown>[];
  if (failure === "missing") descriptor.operation_scope_bindings = [];
  if (failure === "extra") bindings[0]!.operationKey = "delete";
  if (failure === "permission") bindings[0]!.permissionCode = "neon.example.record.delete";
  if (failure === "source") descriptor.source = {};
  if (failure === "duplicate-scope") bindings.push({ ...bindings[0] });
  if (failure === "coordinate") bindings[0]!.coordinateKey = "caller_tenant";
  if (failure === "mixed-mode") bindings.push({ ...bindings[0], scopeKind: "module", scopeBindingId: id(7), coordinateSource: "record_field", coordinateKey: "module_id", decisionMode: "collection" });
  if (failure === "missing-operation") descriptor.operations = { ...f.descriptor.operations, list: { permissionCode: "neon.example.record.read", authorizationMode: "bound_operation" } };
  expect(() => assertOperationProjection(descriptor)).toThrow("PUBLICATION_OPERATION_");
});

it("passes the full signed descriptor to SQL and rejects incomplete resumed activations", async () => {
  const f = fixture();
  const descriptor = { ...f.descriptor, ...compileOperationProjection(f), storage: { schema: "document", object: "example", idField: "id" }, fields: [{ key: "id", writableOn: [] }] };
  const publicationKey = "metadata.compiled_entity.example";
  const payload = { entityCode: "example", generatedAt: "2026-09-27T00:00:00.000Z", release: { releaseId: id(8), releaseNo: 2 },
    artifacts: [{ artifactType: "runtime_contract", artifactHash: `sha256:${"a".repeat(64)}`, plane: "neon", content: { descriptor } }] };
  const query = vi.fn(async (text: string, _values: unknown[]) => {
    if (text.includes("fn_stage_release_projection")) return { rows: [{ id: id(9), publication_key: publicationKey,
      deployment_id: id(10), source_release_id: id(8), source_release_no: 2, artifact_hash: "a".repeat(64), status: "staged", staged_at: payload.generatedAt }] };
    if (text.includes("SELECT payload_json")) return { rows: [{ payload_json: { ...payload,
      artifacts: [{ artifactType: "runtime_contract", content: { descriptor: { ...descriptor, operation_scope_bindings: [] } } }] } }] };
    return { rows: [] };
  });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const repository = new KyselyLocalProjectionRepository(db);
  try {
    await repository.stage({ artifact: { envelope: { targetPlane: "neon", artifactKind: "compiled_entity_runtime", publicationKey, releaseId: id(8), releaseNo: 2, payload },
      manifest: { targetPlane: "neon", artifactKind: "compiled_entity_runtime", releaseId: id(8), payloadSha256: "a".repeat(64) } },
      deployment: { targetPlane: "neon", publicationKey, sourceReleaseId: id(8), sourceReleaseNo: 2, deploymentId: id(10), artifactHash: "a".repeat(64) },
    } as unknown as Parameters<typeof repository.stage>[0]);
    const stage = query.mock.calls.find(([text]) => text.includes("authz.fn_stage_entity_operation_projection"));
    expect(JSON.parse(String(stage![1].at(-1)))).toEqual(descriptor);
    await expect(repository.activate({ appliedReleaseId: id(9) })).rejects.toThrow("PUBLICATION_OPERATION_BINDING_REQUIRED");
    expect(query.mock.calls.some(([text]) => text.includes("fn_activate_release"))).toBe(false);
  } finally { await db.destroy(); }
});
