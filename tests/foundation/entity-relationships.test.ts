import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parseEntityRecordPresentation,
  readableRecordPresentation,
  validateRecordPresentationReferences,
} from "../../packages/contracts/platform/entity-runtime/src/record-presentation";
import {
  parseEntityRelationships,
  qualifyEntityRelationship,
} from "../../packages/contracts/platform/entity-runtime/src/entity-relationship";
const product = JSON.parse(
  readFileSync(
    new URL(
      "../../metadata/products/shared/entities/principal/definition.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const graph = product.definition;
const raw = graph.surfaces.find((s: any) => s.layoutConfig.recordPresentation)
  .layoutConfig.recordPresentation;
const presentation = parseEntityRecordPresentation(raw);
test("independent child tabs are metadata-driven and filtered by relationship authorization", () => {
  const fields = graph.fields.map((f: any) => f.fieldKey);
  validateRecordPresentationReferences(presentation, fields, []);
  const without = readableRecordPresentation(
    presentation,
    fields,
    [],
    "name",
    [],
  );
  assert.equal(without.entityRelationships?.length, 0);
  assert.ok(without.sections.every((s) => !s.relationshipKey));
  const withProfile = readableRecordPresentation(
    presentation,
    fields,
    [],
    "name",
    ["profile"],
  );
  assert.deepEqual(
    withProfile.entityRelationships?.map((r) => r.key),
    ["profile"],
  );
  assert.ok(withProfile.sections.some((s) => s.relationshipKey === "profile"));
  assert.ok(
    withProfile.sections.every((s) => s.relationshipKey !== "notifications"),
  );
});
test("relationship parsing rejects unsupported operations and client-shaped tenant joins", () => {
  const relation = presentation.entityRelationships![0]!;
  for (const changed of [
    { ...relation, readOperation: "custom" },
    { ...relation, tenant: undefined },
    { ...relation, fields: [relation.tenant] },
    { ...relation, sql: "select *" },
  ])
    assert.throws(() => parseEntityRelationships([changed]));
});
test("one-to-one requires matching plane, tenant fields, readable target and a qualified unique key", () => {
  const relation = presentation.entityRelationships![0]!;
  const owner = {
    entityCode: "principal",
    plane: "neon",
    tenantField: "tenant_id",
    fields: { id: "uuid", tenant_id: "uuid" },
    operations: ["read", "list"],
    uniqueKeys: [["tenant_id", "id"]],
  };
  const child = {
    entityCode: relation.targetEntity,
    plane: "neon",
    tenantField: "tenant_id",
    fields: { principal_id: "uuid", tenant_id: "uuid" },
    operations: ["read", "list"],
    uniqueKeys: [["tenant_id", "principal_id"]],
  };
  qualifyEntityRelationship(owner, child, relation);
  for (const changed of [
    { ...child, plane: "mesh" },
    { ...child, tenantField: "other" },
    { ...child, uniqueKeys: [] },
    { ...child, operations: ["list"] },
  ])
    assert.throws(() => qualifyEntityRelationship(owner, changed, relation));
});
