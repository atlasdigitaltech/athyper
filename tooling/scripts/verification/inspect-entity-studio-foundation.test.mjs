import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessFoundationSchema,
  requiredReferenceTables,
} from "./inspect-entity-studio-foundation.mjs";
test("missing tables and guards remain explicit qualification blockers", () => {
  const report = assessFoundationSchema({
    database: "isolated_fixture",
    tables: [{ name: "entity", present: true, rls: true, forced: false }],
  });
  assert.ok(report.missingTables.includes("entity_field_identity"));
  assert.deepEqual(report.tablesWithoutForcedRls, ["entity"]);
  assert.equal(report.qualification, "not-established");
});
test("complete DDL inspection cannot qualify authorization or production", () => {
  const report = assessFoundationSchema({
    database: "isolated_fixture",
    tables: requiredReferenceTables.map((name) => ({
      name,
      present: true,
      rls: true,
      forced: true,
    })),
  });
  assert.deepEqual(report.missingTables, []);
  assert.equal(report.qualification, "not-established");
  assert.equal(report.productionEnabled, false);
  assert.ok(report.outstandingEvidence.length > 0);
});
test("selected-column inspection rejects type and nullability drift despite table presence", async () => {
  const { assessReferenceColumns } =
    await import("./inspect-entity-studio-foundation.mjs");
  const columns = [
    { name: "target_plane", type: "text", nullable: false },
    { name: "requirement", type: "text", nullable: false },
    { name: "position", type: "text", nullable: false },
  ];
  assert.ok(
    assessReferenceColumns([
      { name: "entity_target", columns },
    ]).missing.includes("entity_target.position"),
  );
  columns[2] = { name: "position", type: "integer", nullable: true };
  assert.ok(
    assessReferenceColumns([
      { name: "entity_target", columns },
    ]).missing.includes("entity_target.position"),
  );
  columns[2] = { name: "position", type: "integer", nullable: false };
  assert.ok(
    !assessReferenceColumns([
      { name: "entity_target", columns },
    ]).missing.includes("entity_target.position"),
  );
});
test("core/layout target columns are inventoried without claiming cutover", async () => {
  const { assessCoreLayoutColumns } = await import("./inspect-entity-studio-foundation.mjs");
  const partial = assessCoreLayoutColumns([{ name: "entity_surface_section", columns: [{ name: "entity_surface_id" }] }]);
  assert.ok(partial.missingColumnCount > 0);
  assert.equal(partial.columnsPresent, false);
  assert.equal(partial.cutoverQualified, false);
  const tables = partial.families.map(f => ({ name: f.table.replace(/^metadata\./, ""), columns: f.missing.map(name => ({ name })) }));
  tables.find(t => t.name === "entity_surface_section").columns.push({ name: "entity_surface_id" });
  const complete = assessCoreLayoutColumns(tables);
  assert.equal(complete.columnsPresent, true);
  assert.equal(complete.missingColumnCount, 0);
  assert.equal(complete.cutoverQualified, false);
  assert.ok(complete.requiredEvidence.includes("sealed-history and source-provenance preservation"));
});

test("AI target inventory distinguishes table, type, NULL and RLS evidence from cutover", async () => {
 const {assessAiColumns} = await import("./inspect-entity-studio-foundation.mjs");
 const {readFileSync} = await import("node:fs");
 const contract=JSON.parse(readFileSync(new URL("../../../server/packages/contracts/meta-entity-authoring/src/native-ai.generated.json",import.meta.url),"utf8"));
 const tables=Object.values(contract.members).map(d=>({name:d.table,present:true,rls:true,forced:true,columns:Object.values(d.columns).map(c=>({name:c.column,type:c.sqlType,nullable:c.nullable}))}));
 assert.equal(assessAiColumns([]).missingColumnCount,32);
 assert.equal(assessAiColumns(tables).columnsPresent,true);
 assert.equal(assessAiColumns(tables).cutoverQualified,false);
 tables[0].columns[0].nullable=true;
 tables[0].forced=false;
 const changed=assessAiColumns(tables);
 assert.equal(changed.columnsPresent,false);
 assert.equal(changed.families[0].forcedRls,false);
 assert.deepEqual(changed.families[0].missing,["enabled"]);
});

test("operation target presence/type evidence cannot qualify cutover",async()=>{
 const {assessOperationColumns}=await import("./inspect-entity-studio-foundation.mjs");
 const {readFileSync}=await import("node:fs");
 const descriptor=JSON.parse(readFileSync(new URL("../../../server/packages/contracts/meta-entity-authoring/src/native-operation.generated.json",import.meta.url),"utf8"));
 const columns=Object.values(descriptor.columns).map(c=>({name:c.column,type:c.sqlType}));
 assert.equal(assessOperationColumns([]).missing.length,21);
 const complete=assessOperationColumns([{name:"entity_operation",present:true,columns}]);
 assert.equal(complete.columnsPresent,true);assert.equal(complete.cutoverQualified,false);
 const drift=assessOperationColumns([{name:"entity_operation",present:true,columns:columns.map(c=>c.name==="handler_version"?{...c,type:"text"}:c)}]);
 assert.deepEqual(drift.mismatched,["handler_version"]);
});

test('installed snapshot guard signatures remain presence evidence only', () => {
  const absent = assessFoundationSchema({database: 'fixture',tables: []});
  assert.deepEqual(absent.nativeSnapshotGuards,{coreLayout: false,expanded: false,qualified: false});
  const present = assessFoundationSchema({database: 'fixture',tables: [],nativeSnapshotGuards: {coreLayout: true,expanded: true}});
  assert.deepEqual(present.nativeSnapshotGuards,{coreLayout: true,expanded: true,qualified: false});
  assert.equal(present.productionEnabled,false);
});
