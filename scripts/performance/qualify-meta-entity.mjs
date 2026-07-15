import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function qualifyMetaEntity({ inventory, budgets, baseline, current, exceptions, now = new Date() }) {
  const failures = [];
  const warnings = [];
  const minimumSamples = baseline.minimumSamples ?? 100;
  const approvals = new Map((exceptions.exceptions ?? []).map((entry) => [`${entry.routeId}:${entry.metric}`, entry]));
  for (const check of ["tenantIsolation", "permissionRevocation", "descriptorInvalidation", "durableMutation", "securityParity", "cacheParity"]) {
    if (current.checks?.[check] !== true) failures.push(`release check '${check}' did not pass`);
  }
  for (const contract of inventory.routes) {
    const canonical = budgets?.operations?.[contract.budgetId];
    const measured = current.routes?.[contract.id];
    const reference = baseline.routes?.[contract.id];
    if (!measured) { failures.push(`${contract.id}: current measurement is missing`); continue; }
    if (!reference) { failures.push(`${contract.id}: stored baseline is missing`); continue; }
    if (!Number.isInteger(measured.samples) || measured.samples < minimumSamples) {
      failures.push(`${contract.id}: ${measured.samples ?? 0} samples is below ${minimumSamples}`);
    }
    budget(contract.id, "sqlP95", measured.sqlP95, canonical?.sql.max ?? contract.sqlBudget.max, "SQL statements", failures);
    budget(contract.id, "p95Ms", measured.p95Ms, canonical?.p95Ms ?? contract.sloP95Ms, "route p95 ms", failures);
    const transactionP95Ms = canonical?.transactionP95Ms ?? contract.transactionP95Ms;
    if (transactionP95Ms !== undefined) {
      budget(contract.id, "transactionP95Ms", measured.transactionP95Ms, transactionP95Ms, "transaction p95 ms", failures);
    }
    regression(contract.id, "p95Ms", measured.p95Ms, reference.p95Ms, approvals, now, failures, warnings);
    if (transactionP95Ms !== undefined) {
      regression(contract.id, "transactionP95Ms", measured.transactionP95Ms, reference.transactionP95Ms, approvals, now, failures, warnings);
    }
    if ((measured.compatibilityTraffic ?? 0) > 0) warnings.push(`${contract.id}: compatibility traffic is ${measured.compatibilityTraffic}`);
  }
  return { passed: failures.length === 0, failures, warnings };
}

function budget(route, metric, value, maximum, label, failures) {
  if (!Number.isFinite(value)) failures.push(`${route}: ${metric} is missing`);
  else if (value > maximum) failures.push(`${route}: ${label} ${value} exceeds budget ${maximum}`);
}

function regression(route, metric, value, reference, approvals, now, failures, warnings) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) return;
  const percentage = ((value - reference) / reference) * 100;
  if (percentage <= 15) return;
  const exception = approvals.get(`${route}:${metric}`);
  const valid = exception && exception.approvedBy && exception.reason
    && /^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn)
    && new Date(`${exception.expiresOn}T23:59:59.999Z`) >= now;
  const message = `${route}: ${metric} regressed ${percentage.toFixed(1)}% (${reference} -> ${value})`;
  if (valid) warnings.push(`${message}; approved by ${exception.approvedBy} until ${exception.expiresOn}`);
  else failures.push(`${message} without a valid exception`);
}

function cli() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }));
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const load = (name, fallback) => JSON.parse(readFileSync(resolve(root, args[name] || fallback), "utf8"));
  const result = qualifyMetaEntity({
    inventory: load("inventory", "config/governance/meta-entity-routes.json"),
    budgets: load("budgets", "config/governance/meta-entity-performance-budgets.json"),
    baseline: load("baseline", "perf/baselines/meta-entity-qualification.v1.json"),
    current: load("current", "perf/qualification/current-report.json"),
    exceptions: load("exceptions", "config/governance/meta-entity-performance-exceptions.json"),
  });
  if (args.output) writeFileSync(resolve(root, args.output), JSON.stringify(result, null, 2) + "\n");
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  if (!result.passed) {
    console.error(result.failures.map((failure) => `FAIL: ${failure}`).join("\n"));
    process.exitCode = 1;
  } else console.log("Meta-entity release qualification passed.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
