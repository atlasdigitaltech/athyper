import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const contractsOnly = args.has("--contracts-only");
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const budgets = readJson(resolve(root, "governance/config/production-experience-budgets.json"));

assert(budgets.schemaVersion === 1, "unsupported production budget schema");
assertPositive(budgets.webVitals?.lcpP75Ms, "LCP p75 budget");
assertPositive(budgets.webVitals?.inpP75Ms, "INP p75 budget");
assertPositive(budgets.requestBudgets?.dashboardBootstrapMax, "dashboard request budget");
assertPositive(budgets.requestBudgets?.settingsBootstrapMax, "settings request budget");
assertPositive(budgets.requestBudgets?.maxListPageSize, "list page-size budget");
assertPositive(budgets.bundleBudgets?.sharedShellGzipBytes, "shared shell bundle budget");

if (!contractsOnly) {
  const evidencePath = process.env.ATHYPER_EXPERIENCE_GATE_EVIDENCE;
  assert(evidencePath, "ATHYPER_EXPERIENCE_GATE_EVIDENCE is required");
  const evidence = readJson(resolve(root, evidencePath));
  assertNonNegative(evidence.lcpP75Ms, "LCP p75 evidence");
  assertNonNegative(evidence.inpP75Ms, "INP p75 evidence");
  assertNonNegative(evidence.dashboardBootstrapRequests, "dashboard request evidence");
  assertNonNegative(evidence.settingsBootstrapRequests, "settings request evidence");
  assertNonNegative(evidence.maxObservedListPageSize, "list page-size evidence");
  assertNonNegative(evidence.sharedShellGzipBytes, "shared shell bundle evidence");
  assert(evidence.lcpP75Ms <= budgets.webVitals.lcpP75Ms,
    `LCP p75 ${evidence.lcpP75Ms}ms exceeds ${budgets.webVitals.lcpP75Ms}ms`);
  assert(evidence.inpP75Ms <= budgets.webVitals.inpP75Ms,
    `INP p75 ${evidence.inpP75Ms}ms exceeds ${budgets.webVitals.inpP75Ms}ms`);
  assert(evidence.dashboardBootstrapRequests <= budgets.requestBudgets.dashboardBootstrapMax,
    "dashboard bootstrap has a request waterfall");
  assert(evidence.settingsBootstrapRequests <= budgets.requestBudgets.settingsBootstrapMax,
    "settings bootstrap has a request waterfall");
  assert(evidence.maxObservedListPageSize <= budgets.requestBudgets.maxListPageSize,
    "an unbounded list request was observed");
  assert(evidence.sharedShellGzipBytes <= budgets.bundleBudgets.sharedShellGzipBytes,
    "shared shell bundle exceeds its gzip budget");
}

process.stdout.write(`Experience production gates verified (${contractsOnly ? "contracts" : "evidence"}).\n`);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertPositive(value, label) {
  assert(Number.isFinite(value) && value > 0, `${label} must be positive`);
}

function assertNonNegative(value, label) {
  assert(Number.isFinite(value) && value >= 0, `${label} must be a non-negative finite number`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
