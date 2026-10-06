import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import type { CompiledEntityResolvedRelease } from "./artifact-resolution.js";
import { createRuntimeMetaCompiledEntityReleaseSource } from "./runtime-descriptor-repository.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Synthetic persisted-source adapter fixture, not an activation/authority receipt.
const input = {
  coordinate: { tenantId: id(1), principalId: id(2), planeKey: "studio", entityCode: "fixture_reference" },
  release: { releaseId: "logical-release", releaseHash: `sha256:${"b".repeat(64)}` },
} as CompiledEntityResolvedRelease;
function fixture(rows: readonly object[]) {
  const query = vi.fn(async (_statement: string, _parameters: unknown[]) => ({ rows }));
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({
    pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never,
  }) });
  const withTenantTransaction = vi.fn((_plane: string, _actor: unknown, _work: unknown) => {});
  const source = createRuntimeMetaCompiledEntityReleaseSource({ databases: { studio: database }, withTenantTransaction: async (plane, actor, work) => {
    withTenantTransaction(plane, actor, work);
    return work(database);
  } });
  return { query, source, withTenantTransaction };
}
it("loads native provenance from the persisted signed manifest under the request tenant transaction", async () => {
  const f = fixture([{ release_id: id(3), release_no: 4, entity_id: id(5),
    contract_hash: `sha256:${"a".repeat(64)}`, tenant_id: null }]);
  expect(await f.source.findPublicationCoordinate!(input)).toEqual({
    releaseId: id(3), releaseNo: 4, entityId: id(5), contractHash: "a".repeat(64), tenantId: null,
  });
  expect(f.withTenantTransaction).toHaveBeenCalledWith("studio", input.coordinate, expect.any(Function));
  const statement = String(f.query.mock.calls[0]?.[0]);
  expect(statement).toContain("applied.manifest->'evidence'->>'sourceContractHash'");
  expect(statement).toContain("applied.status='active'");
  expect(statement).toContain("payload.tenant_id IS NULL OR payload.tenant_id=");
  expect(statement).toContain("payload.payload_json->'release'->>'releaseHash'");
});
it("preserves missing historical provenance without deriving it from compiled content", async () => {
  const f = fixture([{ release_id: id(3), release_no: 4, entity_id: null, contract_hash: null, tenant_id: id(1) }]);
  expect(await f.source.findPublicationCoordinate!(input)).toEqual({ releaseId: id(3), releaseNo: 4, tenantId: id(1) });
});
it("does not manufacture publication coordinates when the exact activation is absent", async () => {
  const f = fixture([]);
  expect(await f.source.findPublicationCoordinate!(input)).toBeNull();
});
