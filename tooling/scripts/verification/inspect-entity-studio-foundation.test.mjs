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
