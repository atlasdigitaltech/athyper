import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageReport, requiredCoverageFailures } from "./coverage-report.mjs";
import { assessRegistry, inventoryQuery } from "./inventory-module-identities.mjs";

const source = (entityCode, required = [], recommended = []) => ({ entityCode, descriptor: { entityClass: null, ownershipModel: null, targets: { declared: ["neon"], required, recommended } } });
test("coverage distinguishes required, recommended and unresolved classification", () => {
  const report = coverageReport(new Map([["one", source("one", ["neon", "mesh"])], ["two", source("two", [], ["studio"])]]));
  assert.equal(report.publicationVerified, false);
  assert.deepEqual(report.counts, { entities: 2, missingRequiredPlanes: 1, missingRecommendedPlanes: 1, unresolvedClassifications: 2 });
  assert.deepEqual(requiredCoverageFailures(report, ["two"]), []);
  assert.deepEqual(requiredCoverageFailures(report, ["one"]), ["one: required planes not declared: mesh"]);
  assert.deepEqual(requiredCoverageFailures(report, ["missing"]), ["missing: classified target metadata unavailable"]);
});

test("registry conflict is conditional on observed rows and target modules", () => {
  const product = { entityCode: "example", moduleCode: "new_module", entityClass: "reference", ownershipModel: "system" };
  const row = { entityCode: "example", moduleCode: "old_module", entityClass: "reference", ownershipModel: "system", status: "active", releases: [] };
  const modules = [{ code: "new_module", status: "active" }];
  const disposition = entities => assessRegistry([product], { entities, modules })[0].disposition;
  assert.equal(disposition([]), "unregistered");
  assert.equal(disposition([row]), "module_correction_required");
  assert.equal(disposition([{ ...row, moduleCode: "new_module" }]), "module_matches");
  assert.equal(disposition([row, row]), "ambiguous_identity_blocked");
  assert.equal(disposition([{ ...row, ownershipModel: "tenant" }]), "identity_conflict_blocked");
  assert.equal(assessRegistry([product], { entities: [row], modules: [] })[0].disposition, "module_correction_target_unavailable");
  assert.throws(() => assessRegistry([product], {}), /snapshot incomplete/);
});

test("inventory SQL is read-only, source-parameterized and skips unhosted authoring tables", () => {
  assert.match(inventoryQuery(), /REPEATABLE READ READ ONLY/);
  assert.match(inventoryQuery(), /:'entity_codes'/);
  assert.match(inventoryQuery(), /ROLLBACK/);
  assert.doesNotMatch(inventoryQuery(false), /FROM metadata\.entity/);
  assert.doesNotMatch(inventoryQuery(), /INSERT|UPDATE|DELETE/);
});
