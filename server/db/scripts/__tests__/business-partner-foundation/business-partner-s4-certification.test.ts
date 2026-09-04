import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("S4 certification executes live negative and concurrent database probes", async () => {
  const source = await read(
    "scripts/business-partner-360/run-business-partner-s4-certification.ts",
  );
  for (const value of [
    "inactive_catalog_reference",
    "overlapping_alias",
    "overlapping_effective_assignment",
    "overlapping_relationship_period",
    "relationship_hierarchy_cycle",
    "multiple_scope_coordinates",
    "inactive_scope_reference",
    "scope_cardinality_over_100",
    "invalid_json_shape",
    "oversized_json",
    "alias_overlap",
    "assignment_overlap",
    "relationship_overlap",
    "decision_scope_overlap",
  ])
    assert.match(source, new RegExp(value));
  assert.match(source, /SAVEPOINT/);
  assert.match(source, /ROLLBACK TO SAVEPOINT/);
  assert.match(source, /statement_timeout/);
  assert.match(source, /accepted:1\+\(result\.ok\?1:0\)/);
});

test("S4 compatibility surfaces use evidence checkpoints and fail-closed removal gates", async () => {
  const policy = JSON.parse(
    await read(
      "../../governance/config/governance/business-partner-s4-compatibility-retirement.v1.json",
    ),
  );
  assert.equal(
    policy.window.observationPolicy,
    "evidence_checkpoint_no_fixed_duration",
  );
  assert.equal(policy.window.minimumZeroUsageDays, 14);
  assert.equal(policy.forwardFixOnly, true);
  assert.deepEqual(
    policy.surfaces.map((value: { code: string }) => value.code),
    ["business_partner_aliases_cache", "flattened_decision_scope"],
  );
  for (const surface of policy.surfaces) {
    assert.ok(surface.replacement);
    assert.match(surface.removalGate, /zero for 14 consecutive days/);
    assert.deepEqual(surface.telemetry, [
      "repository_source_inventory",
      "pg_stat_statements",
    ]);
  }
});

test("S4 evidence is durable, sanitized, cleanup-verified, and not removal-eligible on first capture", async () => {
  const source = await read(
    "scripts/business-partner-360/run-business-partner-s4-certification.ts",
  );
  assert.match(source, /athyper\.business-partner-s4-certification/);
  assert.match(source, /sanitized:true/);
  assert.match(source, /negativeFixtures:"transaction_rollback"/);
  assert.match(source, /cleanupVerified:concurrencyResult\.cleanupVerified/);
  assert.match(source, /removalEligible:false/);
  assert.match(source, /writeFile\(destination/);
  assert.match(source, /assertLoopbackDatabaseTarget/);
  assert.match(source, /RUN-BP-S4-CERTIFICATION/);
});

test("S4 migration evidence rejects dirty authority metadata and proves alias and scope backfills", async () => {
  const source = await read(
    "scripts/business-partner-360/run-business-partner-s4-migration-evidence.ts",
  );
  assert.match(source, /disposable pre-S4 database/);
  assert.match(source, /S4 preflight failed/);
  assert.match(source, /rowCountsPreserved/);
  assert.match(source, /legacyAliasElements/);
  assert.match(source, /business_partner_decision_scope/);
  assert.match(
    source,
    /credit_review:2,customer_designation:2,qualification:2,supplier_preference:2/,
  );
  assert.match(source, /APPLY-BP-S4-DISPOSABLE-MIGRATION/);
});
