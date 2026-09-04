import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qualifyMetaEntity } from "./qualify-meta-entity.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

export function evaluateRetirement({ route, inventory, policy, current, baseline, budgets, exceptions, evidence, root }) {
  const failures = [...qualifyMetaEntity({ inventory, budgets, baseline, current, exceptions }).failures];
  if (current.schemaVersion !== 1) failures.push(`${route.id}: current report schemaVersion must be 1`);
  if (String(current.source ?? "").includes("current-report.example.json")) failures.push(`${route.id}: example report is prohibited`);
  if (route.rolloutState !== "full_rollout") failures.push(`${route.id}: rollout is '${route.rolloutState}', not full_rollout`);
  if ((current.routes?.[route.id]?.compatibilityTraffic ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`${route.id}: compatibility traffic is not zero`);
  }

  const record = evidence.schemaVersion === 1 && evidence.routes?.[route.id];
  if (!record) {
    failures.push(`${route.id}: complete retirement evidence is missing`);
    return failures;
  }

  if (record.owner !== route.owner) failures.push(`${route.id}: evidence owner must be '${route.owner}'`);
  for (const field of ["releaseId", "observationReleaseId", "approvedBy", "qualificationArtifact"]) {
    if (typeof record[field] !== "string" || record[field].trim() === "") failures.push(`${route.id}: ${field} is required`);
  }
  if (record.releaseCompleted !== true) failures.push(`${route.id}: a complete release observation is required`);
  if (!Number.isInteger(record.releasesObserved) || record.releasesObserved < (policy.retirement.requiredZeroCompatibilityReleases ?? 1)) {
    failures.push(`${route.id}: fewer than the required complete releases were observed`);
  }
  if (record.compatibilityTraffic !== 0) failures.push(`${route.id}: evidence compatibility traffic must be exactly zero`);
  if (record.shadowValidationPassed !== true || record.shadowDifferences !== 0) {
    failures.push(`${route.id}: shadow validation must pass with zero differences`);
  }

  const qualificationPath = resolve(root, record.qualificationArtifact);
  if (!existsSync(qualificationPath)) failures.push(`${route.id}: qualification artifact is missing: ${record.qualificationArtifact}`);
  else {
    try {
      const qualification = JSON.parse(readFileSync(qualificationPath, "utf8"));
      if (qualification.schemaVersion !== 1 || qualification.passed !== true) {
        failures.push(`${route.id}: qualification artifact must be schemaVersion 1 with passed=true`);
      }
    } catch (error) {
      failures.push(`${route.id}: qualification artifact is invalid JSON (${error.message})`);
    }
  }

  const started = Date.parse(record.zeroTrafficSince);
  const ended = Date.parse(record.observedThrough);
  const elapsedDays = (ended - started) / 86_400_000;
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    failures.push(`${route.id}: zero-traffic evidence dates are invalid`);
  } else if (elapsedDays < inventory.releaseWindowDays) {
    failures.push(`${route.id}: zero-traffic window ${elapsedDays.toFixed(1)}d is below ${inventory.releaseWindowDays}d`);
  }

  const rollback = record.rollback;
  if (policy.retirement.requireRollbackFlag) {
    if (!policy.rollbackFlags.includes(rollback?.flag) || rollback?.retained !== true) {
      failures.push(`${route.id}: configured rollback flag must remain retained`);
    }
    const rollbackThrough = Date.parse(rollback?.availableThrough ?? "");
    if (!Number.isFinite(rollbackThrough) || rollbackThrough <= ended) {
      failures.push(`${route.id}: rollback flag must remain available after the observation release`);
    }
  }

  if (record.runbookCoverage !== "complete" || !Array.isArray(record.runbooks) || record.runbooks.length === 0) {
    failures.push(`${route.id}: complete runbook coverage is required`);
  } else {
    for (const runbook of record.runbooks) {
      if (!existsSync(resolve(root, runbook))) failures.push(`${route.id}: runbook missing: ${runbook}`);
    }
  }
  return failures;
}

export function main() {
  if (!args.route) throw new Error("--route=<inventory id> is required");
  const inventory = load("governance/config/governance/meta-entity-routes.json");
  const currentPath = args.current || "tooling/performance/qualification/current-report.json";
  if (currentPath.endsWith("current-report.example.json")) throw new Error("example performance report is prohibited");
  const baseline = load(args.baseline || "tooling/performance/baselines/meta-entity-qualification.v1.json");
  const budgets = load("governance/config/governance/meta-entity-performance-budgets.json");
  const exceptions = load("governance/config/governance/meta-entity-performance-exceptions.json");
  const policy = load("governance/config/governance/release-gate.json");
  const current = load(currentPath);
  const evidence = load(args.evidence || "governance/config/governance/meta-entity-retirement-evidence.json");
  const route = inventory.routes.find((entry) => entry.id === args.route);
  if (!route) throw new Error(`unknown route '${args.route}'`);
  const failures = evaluateRetirement({ route, inventory, policy, current, baseline, budgets, exceptions, evidence, root });
  if (failures.length) {
    console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log(`${route.id}: compatibility path is eligible for removal.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
