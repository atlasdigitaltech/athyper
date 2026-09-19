import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("canonical S4 constraints preserve normalized alias and decision-scope authority", async () => {
  const [masterTables, masterConstraints, controlTables, controlConstraints] =
    await Promise.all([
      read("ddl/planes/neon/master/03_tables.sql"),
      read("ddl/planes/neon/master/05_constraints.sql"),
      read("ddl/planes/neon/control/03_tables.sql"),
      read("ddl/planes/neon/control/05_constraints.sql"),
    ]);
  assert.match(masterTables, /CREATE TABLE master\.business_partner_alias/);
  assert.match(masterConstraints, /business_partner_alias_no_overlap_excl/);
  assert.match(
    controlTables,
    /CREATE TABLE control\.business_partner_decision_scope/,
  );
  assert.match(controlTables, /scope_group BETWEEN 1 AND 100/);
  assert.match(
    controlConstraints,
    /business_partner_decision_scope_no_overlap_excl/,
  );
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

test("retired S4 evidence runners are not exposed by the canonical database package", async () => {
  const packageSource = await read("package.json");
  assert.doesNotMatch(packageSource, /run-business-partner-s4-certification/);
  assert.doesNotMatch(
    packageSource,
    /run-business-partner-s4-migration-evidence/,
  );
});

test("clean-build S4 authority is declared directly without an active backfill path", async () => {
  const [masterTables, controlTables, packageSource] = await Promise.all([
    read("ddl/planes/neon/master/03_tables.sql"),
    read("ddl/planes/neon/control/03_tables.sql"),
    read("package.json"),
  ]);
  assert.match(masterTables, /CREATE TABLE master\.business_partner_alias/);
  assert.match(
    controlTables,
    /CREATE TABLE control\.business_partner_decision_scope/,
  );
  assert.doesNotMatch(packageSource, /S4-DISPOSABLE|s4-migration/);
});
