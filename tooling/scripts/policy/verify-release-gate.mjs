import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || true];
}));
const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const config = load("governance/config/governance/release-gate.json");
const failures = [];
const warnings = [];
// The repository policy is now blocking. Keep the flag parsing for callers
// that still pass it, but never allow CI to downgrade a blocking policy.
const advisory = config.mode !== "blocking" && (args.advisory === true || args.advisory === "true");
const qualificationPath = args.qualification || "tooling/performance/qualification/result.json";
const requireEvidence = Boolean(args.qualification || args["require-evidence"]);

const evidence = (name, path) => {
  if (!existsSync(resolve(root, path))) {
    (requireEvidence ? failures : warnings).push(`${name}: missing evidence artifact ${path}`);
    return null;
  }
  const artifact = load(path);
  if (artifact?.schemaVersion !== 1) failures.push(`${name}: schemaVersion must be 1`);
  return artifact;
};

const report = evidence("performanceReport", config.requiredEvidence.performanceReport);
const qualification = existsSync(resolve(root, qualificationPath)) ? load(qualificationPath) : null;
if (!qualification) (requireEvidence ? failures : warnings).push(`qualification: missing result artifact ${qualificationPath}`);
else {
  if (qualification.schemaVersion !== 1) failures.push("qualification: schemaVersion must be 1");
  if (qualification.passed !== true) failures.push("qualification: performance qualification did not pass");
}
if (report && !qualification) {
  for (const field of ["queryCountBudget", "latencyBudget", "transactionDurationBudget"]) {
    if (report[field]?.passed !== true && report.budgets?.[field]?.passed !== true) {
      failures.push(`${field}: budget was not explicitly passed`);
    }
  }
}
for (const [name, path] of Object.entries(config.requiredEvidence)) {
  if (name !== "performanceReport" && name !== "queryCountBudget" && name !== "latencyBudget" && name !== "transactionDurationBudget") {
    const artifact = evidence(name, path);
    if (artifact && artifact.passed !== true) failures.push(`${name}: evidence artifact did not pass`);
  }
}

const compatibilityPath = config.requiredEvidence.compatibilityTraffic;
if (existsSync(resolve(root, compatibilityPath))) {
  const compatibility = load(compatibilityPath);
  if ((compatibility.compatibilityTraffic ?? compatibility.total ?? 1) !== 0) {
    warnings.push("compatibility traffic is non-zero; legacy retirement is not eligible");
  }
  if (config.retirement.requireNoShadowDifferences && (compatibility.shadowDifferences ?? 0) !== 0) {
    warnings.push("shadow differences remain; legacy retirement is not eligible");
  }
}

for (const flag of config.rollbackFlags) {
  if (!flag || typeof flag !== "string") failures.push("rollback flag configuration is invalid");
}
for (const runbook of config.runbooks) if (!existsSync(resolve(root, runbook))) failures.push(`runbook missing: ${runbook}`);

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
if (failures.length && !advisory) process.exit(1);
console.log(`Release gate ${failures.length ? "failed" : requireEvidence ? "passed" : "readiness passed"}: ${failures.length} blocking checks, ${warnings.length} readiness/retirement warnings.`);
