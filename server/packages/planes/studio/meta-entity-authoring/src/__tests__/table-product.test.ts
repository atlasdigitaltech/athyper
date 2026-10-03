import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileTableEntityProduct, parseTableEntityProduct } from "../authoring/table-product.js";
import { parseEntityRelationships, qualifyEntityRelationship } from "@athyper/contract-platform-entity-runtime";
const source = (entity: string) => JSON.parse(readFileSync(new URL(`../../../../../../../metadata/entities/${entity}/definition.json`, import.meta.url), "utf8"));
for (const entity of ["principal", "principal_profile", "principal_notification_preference", "principal_ui_profile"]) it(`compiles ${entity} through standard entity graphs on all three planes`, () => {
  const product = parseTableEntityProduct(source(entity));
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const { graph, artifact } = compileTableEntityProduct(product, plane);
    expect(graph.runtimeProfiles?.[0]?.storagePlane).toBe(plane);
    expect(graph.runtimeProfiles?.[0]?.tenantFieldKey).toBe("tenant_id");
    expect(artifact.descriptor.entity.entityCode).toBe(entity);
    expect(graph.operationPermissions?.every(binding => binding.targetPlane === plane)).toBe(true);
  }
});
it("rejects writable products without optimistic concurrency or tenant boundaries", () => {
  const product = source("principal_profile");
  delete product.definition.runtimeProfiles[0].recordVersionFieldKey;
  expect(() => parseTableEntityProduct(product)).toThrow("WRITE_CONCURRENCY_REQUIRED");
  product.definition.runtimeProfiles[0].tenantFieldKey = "missing";
  expect(() => parseTableEntityProduct(product)).toThrow("TENANT_STORAGE_REQUIRED");
});
it("qualifies exact parent and child field contracts, cardinality and plane", () => {
  const relation = parseEntityRelationships([{key:"profile",targetEntity:"principal_profile",cardinality:"zero_or_one",fields:[{source:"id",target:"principal_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"}])[0]!;
  const owner = {entityCode:"principal",plane:"neon",tenantField:"tenant_id",fields:{id:"uuid",tenant_id:"uuid"},operations:["list","read"],uniqueKeys:[["id"]]};
  const child = {entityCode:"principal_profile",plane:"neon",tenantField:"tenant_id",fields:{id:"uuid",tenant_id:"uuid",principal_id:"uuid"},operations:["list","read"],uniqueKeys:[["tenant_id","principal_id"]]};
  expect(() => qualifyEntityRelationship(owner, child, relation)).not.toThrow();
  expect(() => qualifyEntityRelationship(owner, {...child,uniqueKeys:[["id"]]}, relation)).toThrow("not unique");
  expect(() => qualifyEntityRelationship(owner, {...child,plane:"mesh"}, relation)).toThrow("dependency mismatch");
  expect(() => qualifyEntityRelationship(owner, {...child,fields:{...child.fields,principal_id:"string"}}, relation)).toThrow("field mismatch");
});

it("declares editable UI preferences with locked ownership, bounded week start and authorized reference metadata", () => {
 const {graph}=compileTableEntityProduct(parseTableEntityProduct(source("principal_ui_profile")),"neon");
 const mutable=graph.fields.filter(f=>f.writeMode==="mutable").map(f=>f.fieldKey);
 expect(mutable).toEqual(["locale_code","language_code","timezone_code","date_format","number_format","week_start","appearance_mode","density_code"]);
 for (const field of ["locale_code","language_code","timezone_code"]) expect(graph.fields.find(f=>f.fieldKey===field)?.typeConfig.keyReference).toMatchObject({targetEntity:field.replace("_code","")});
 expect(graph.fields.find(f=>f.fieldKey==="week_start")?.typeConfig).toMatchObject({minimum:0,maximum:6});
 expect(graph.operations.find(o=>o.operationKey==="patch")?.fieldKeys).not.toContain("principal_id");
});
