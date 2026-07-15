import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { qualifyMetaEntity } from "./qualify-meta-entity.mjs";

const root = resolve(import.meta.dirname, "../..");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const inventory = json("config/governance/meta-entity-routes.json");
const budgets = json("config/governance/meta-entity-performance-budgets.json");
const baseline = json("perf/baselines/meta-entity-qualification.v1.json");
const current = json("perf/qualification/current-report.example.json");

test("accepts a report within route, SQL, transaction, and parity gates", () => {
  assert.equal(qualifyMetaEntity({ inventory, budgets, baseline, current, exceptions: { exceptions: [] } }).passed, true);
});

test("rejects query budget and unapproved p95 regression", () => {
  const broken = structuredClone(current);
  broken.routes.patch.sqlP95 = 9;
  broken.routes.patch.p95Ms = 500;
  const result = qualifyMetaEntity({ inventory, budgets, baseline, current: broken, exceptions: { exceptions: [] } });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("SQL statements")));
  assert.ok(result.failures.some((failure) => failure.includes("without a valid exception")));
});

test("requires every security and durability parity check", () => {
  const broken = structuredClone(current);
  broken.checks.permissionRevocation = false;
  assert.ok(qualifyMetaEntity({ inventory, budgets, baseline, current: broken, exceptions: { exceptions: [] } })
    .failures.includes("release check 'permissionRevocation' did not pass"));
});
