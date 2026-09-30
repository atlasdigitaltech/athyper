import { describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { compileRecordCollectionScopeCondition, searchCondition } from "../kysely-record-repository.js";

const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" }, fields: [], operations: {},
} satisfies EntityRuntimeDescriptor;

it("pins request rows to Business Partner, tenant, current snapshot and authorized organization",()=>{
  const database=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{} as never})});
  const requests={...descriptor,entityCode:"business_partner_request",collectionRelationship:{schemaVersion:1 as const,sourceRef:"entity_case" as const,subject:{fieldRef:"subject_entity" as const,value:"master.business_partner"},scope:{fieldRef:"current_snapshot.organization" as const,contextRef:"operatingOrganizationId" as const}},storage:{schema:"document",object:"entity_case",idField:"id",tenantField:"tenant_id"}};
  const constraint={kind:"platform.document_relationship.v1" as const,operatingOrganizationId:"33333333-3333-4333-8333-333333333333"};
  const compiled=compileRecordCollectionScopeCondition(requests,"11111111-1111-4111-8111-111111111111",constraint).compile(database);
  expect(compiled.sql).toContain('"entity_case"."entity_code" = $1');
  expect(compiled.sql).toContain('"list_scope_related"."snapshot_id" = "entity_case"."current_snapshot_id"');
  expect(compiled.sql).toContain('"list_scope_related"."tenant_id" = "entity_case"."tenant_id"');
  expect(compiled.parameters).toEqual(["master.business_partner","11111111-1111-4111-8111-111111111111","operatingOrganizationId",constraint.operatingOrganizationId]);
  expect(()=>compileRecordCollectionScopeCondition(descriptor,"tenant",constraint)).toThrow();
  const alternate={...requests,entityCode:"purchase_request",collectionRelationship:{...requests.collectionRelationship,subject:{...requests.collectionRelationship.subject,value:"procurement.purchase_order"}}};
  const other=compileRecordCollectionScopeCondition(alternate,"tenant",constraint).compile(database);
  expect(other.sql).toEqual(compiled.sql);
  expect(other.parameters[0]).toBe("procurement.purchase_order");
});

describe("list search SQL", () => {
  it("binds the search term with LIKE wildcards escaped", () => {
    const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {} as never }) });
    const searchable = { ...descriptor, fields: [{ key: "name", storagePath: "name", searchable: true }] } as unknown as EntityRuntimeDescriptor;
    const compiled = searchCondition(searchable, "50%_off\\").compile(database);
    expect(compiled.sql).toContain("ESCAPE");
    expect(compiled.parameters).toEqual(["%50\\%\\_off\\\\%"]);
  });
});
