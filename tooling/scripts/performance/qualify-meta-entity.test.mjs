import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { qualifyMetaEntity } from "./qualify-meta-entity.mjs";

const root = resolve(import.meta.dirname, "../../..");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const inventory = json("governance/config/governance/meta-entity-routes.json");
const budgets = json("governance/config/governance/meta-entity-performance-budgets.json");
const baseline = json("tooling/performance/baselines/meta-entity-qualification.v1.json");
const current = {
  ...json("tooling/performance/qualification/current-report.example.json"),
  // Unit-test-only proof fixture. The CLI never uses the example report for
  // release decisions; staging must provide these fields in current-report.
  companyCodeRead: {
    stableRuns: 2,
    p95Ms: 100,
    p99Ms: 200,
    shadowComparison: { ordering: true, counts: true, securityFiltering: true, referenceLabels: true, nullDefaultBehavior: true, differences: 0 },
    tenantFixtures: { small: true, large: true },
    queryPlans: { keyset: true, tenantLeadingIndex: true, sortCompatibleIndex: true, unboundedRelationNPlusOne: false },
  },
  companyCodeMutation: {
    postgresIntegration: true,
    atomicCommit: { record: true, audit: true, idempotency: true, outbox: true },
    rollback: { auditFailure: true, outboxFailure: true },
    duplicateReplay: true,
    stableEventKey: true,
    operations: {
      patch: { p95Ms: 200, p99Ms: 400, transactionP95Ms: 40 },
      create: { p95Ms: 200, p99Ms: 400, transactionP95Ms: 80 },
      delete: { p95Ms: 200, p99Ms: 400, transactionP95Ms: 80 },
    },
  },
};

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
