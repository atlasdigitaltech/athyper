import { describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { compileRecordCollectionScopeCondition } from "../kysely-record-repository.js";

const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" }, fields: [], operations: {},
} satisfies EntityRuntimeDescriptor;

describe("business-partner collection-scope SQL", () => {
  it("compiles a correlated, tenant-bound effective assignment predicate with bound coordinates", () => {
    const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {} as never }) });
    const compiled = compileRecordCollectionScopeCondition(descriptor, "11111111-1111-4111-8111-111111111111", { kind: "neon.business_partner.operating_organization.v1", operatingOrganizationId: "33333333-3333-4333-8333-333333333333" }).compile(database);
    expect(compiled.sql).toContain("master.business_partner_operating_organization_assignment");
    expect(compiled.sql).toContain('list_scope_assignment.business_partner_id = "business_partner"."id"');
    expect(compiled.sql).toContain("list_scope_assignment.status = 'active'");
    expect(compiled.sql).toContain("list_scope_assignment.effective_from <= CURRENT_DATE");
    expect(compiled.parameters).toEqual(["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"]);
  });

  it("refuses to apply the resolver kind to a different storage descriptor", () => {
    expect(() => compileRecordCollectionScopeCondition({ ...descriptor, storage: { ...descriptor.storage, object: "supplier" } }, "tenant", { kind: "neon.business_partner.operating_organization.v1", operatingOrganizationId: "org" })).toThrow(/cannot be applied/);
  });
});

describe("three-plane collection-scope SQL", () => {
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {} as never }) });
  it("binds Mesh relationship visibility to either participant coordinate in the current tenant", () => {
    const mesh = { ...descriptor, entityCode: "network_relationship", planeKey: "mesh" as const, storage: { schema: "mesh", object: "network_relationship", idField: "id", statusField: "status" } };
    const compiled = compileRecordCollectionScopeCondition(mesh, "11111111-1111-4111-8111-111111111111", { kind: "mesh.network_relationship.actor_account.v1", networkAccountId: "44444444-4444-4444-8444-444444444444" }).compile(database);
    expect(compiled.sql).toContain('"network_relationship"."buyer_account_id"');
    expect(compiled.sql).toContain('"network_relationship"."supplier_account_id"');
    expect(compiled.parameters).toEqual(["11111111-1111-4111-8111-111111111111", "44444444-4444-4444-8444-444444444444", "11111111-1111-4111-8111-111111111111", "44444444-4444-4444-8444-444444444444"]);
  });
  it("normalizes Studio metadata visibility to global plus current-tenant identities", () => {
    const studio = { ...descriptor, entityCode: "metadata_entity", planeKey: "studio" as const, storage: { schema: "metadata", object: "entity", idField: "id", statusField: "status" } };
    const compiled = compileRecordCollectionScopeCondition(studio, "11111111-1111-4111-8111-111111111111", { kind: "studio.metadata_entity.catalog.v1", tenantId: "11111111-1111-4111-8111-111111111111" }).compile(database);
    expect(compiled.sql).toContain('"entity"."tenant_id" IS NULL');
    expect(compiled.parameters).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});
