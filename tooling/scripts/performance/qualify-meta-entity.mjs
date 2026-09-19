import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function qualifyMetaEntity({ inventory, budgets, baseline, current, exceptions, now = new Date() }) {
  const failures = [];
  const warnings = [];
  const minimumSamples = baseline.minimumSamples ?? 100;
  if (!Number.isSafeInteger(minimumSamples) || minimumSamples <= 0) {
    failures.push("baseline minimumSamples must be a positive integer");
  }
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
  const companyCode = qualifyCompanyCodeSlices(current);
  failures.push(...companyCode.failures);
  warnings.push(...companyCode.warnings);
  return { passed: failures.length === 0, failures, warnings };
}

/**
 * Promotion contract for the first converged read and mutation entity.
 * The values are deliberately supplied by staging/load-test capture; this
 * function never invents evidence and therefore fails closed when fields are
 * absent from the real report.
 */
export function qualifyCompanyCodeSlices(current) {
  const failures = [];
  const warnings = [];
  const read = current.companyCodeRead;
  const mutation = current.companyCodeMutation;
  const requireTrue = (object, key, label) => {
    if (object?.[key] !== true) failures.push(`company_code: ${label} was not proven`);
  };

  if (!read) failures.push("company_code: read qualification is missing");
  else {
    if ((read.stableRuns ?? 0) < 2) failures.push("company_code: read slice has fewer than two stable runs");
    for (const key of ["ordering", "counts", "securityFiltering", "referenceLabels", "nullDefaultBehavior"]) {
      requireTrue(read.shadowComparison, key, `shadow comparison ${key}`);
    }
    for (const key of ["small", "large"]) requireTrue(read.tenantFixtures, key, `tenant fixture ${key}`);
    for (const key of ["keyset", "tenantLeadingIndex", "sortCompatibleIndex"]) {
      requireTrue(read.queryPlans, key, `query plan ${key}`);
    }
    if (read.queryPlans?.unboundedRelationNPlusOne !== false) {
      failures.push("company_code: unbounded relation N+1 was not disproven");
    }
    budget("company_code.list", "p95Ms", read.p95Ms, 150, "cached list p95 ms", failures);
    budget("company_code.list", "p99Ms", read.p99Ms, 350, "cached list p99 ms", failures);
    if ((read.shadowComparison?.differences ?? 1) !== 0) {
      failures.push("company_code: shadow read differences remain");
    }
  }

  if (!mutation) failures.push("company_code: mutation qualification is missing");
  else {
    requireTrue(mutation, "postgresIntegration", "PostgreSQL integration");
    for (const key of ["record", "audit", "idempotency", "outbox"]) {
      requireTrue(mutation.atomicCommit, key, `atomic ${key} commit`);
    }
    for (const key of ["auditFailure", "outboxFailure"]) {
      requireTrue(mutation.rollback, key, `rollback on ${key}`);
    }
    requireTrue(mutation, "duplicateReplay", "duplicate replay");
    requireTrue(mutation, "stableEventKey", "stable event key");
    for (const operation of ["patch", "create", "delete"]) {
      const measured = mutation.operations?.[operation];
      if (!measured) { failures.push(`company_code.${operation}: mutation latency is missing`); continue; }
      budget(`company_code.${operation}`, "p95Ms", measured.p95Ms, 400, "mutation p95 ms", failures);
      budget(`company_code.${operation}`, "p99Ms", measured.p99Ms, 800, "mutation p99 ms", failures);
    }
    for (const [operation, maximum] of [["patch", 50], ["create", 100], ["delete", 100]]) {
      budget(`company_code.${operation}`, "transactionP95Ms", mutation.operations?.[operation]?.transactionP95Ms, maximum, "transaction p95 ms", failures);
    }
  }
  return { passed: failures.length === 0, failures, warnings };
}

function budget(route, metric, value, maximum, label, failures) {
  if (!Number.isFinite(value)) failures.push(`${route}: ${metric} is missing`);
  else if (!Number.isFinite(maximum) || maximum < 0) failures.push(`${route}: ${metric} budget is missing or invalid`);
  else if (value > maximum) failures.push(`${route}: ${label} ${value} exceeds budget ${maximum}`);
}

function regression(route, metric, value, reference, approvals, now, failures, warnings) {
  if (!Number.isFinite(value)) return;
  if (!Number.isFinite(reference) || reference <= 0) {
    failures.push(`${route}: ${metric} stored baseline is missing or invalid`);
    return;
  }
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
  const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const load = (name, fallback) => JSON.parse(readFileSync(resolve(root, args[name] || fallback), "utf8"));
  const result = qualifyMetaEntity({
    inventory: load("inventory", "governance/config/governance/meta-entity-routes.json"),
    budgets: load("budgets", "governance/config/governance/meta-entity-performance-budgets.json"),
    baseline: load("baseline", "tooling/performance/baselines/meta-entity-qualification.v1.json"),
    current: load("current", "tooling/performance/qualification/current-report.json"),
    exceptions: load("exceptions", "governance/config/governance/meta-entity-performance-exceptions.json"),
  });
  if (args.readOutput) {
    const slice = qualifyCompanyCodeSlices(load("current", "tooling/performance/qualification/current-report.json"));
    writeFileSync(resolve(root, args.readOutput), JSON.stringify({ schemaVersion: 1, kind: "athyper.performance.slice-qualification", ...slice, entity: "company_code", slice: "read", generatedAt: new Date().toISOString() }, null, 2) + "\n");
  }
  if (args.mutationOutput) {
    const slice = qualifyCompanyCodeSlices(load("current", "tooling/performance/qualification/current-report.json"));
    writeFileSync(resolve(root, args.mutationOutput), JSON.stringify({ schemaVersion: 1, kind: "athyper.performance.slice-qualification", ...slice, entity: "company_code", slice: "mutation", generatedAt: new Date().toISOString() }, null, 2) + "\n");
  }
  if (args.output) writeFileSync(resolve(root, args.output), JSON.stringify({ schemaVersion: 1, kind: "athyper.performance.qualification", ...result }, null, 2) + "\n");
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  if (!result.passed) {
    console.error(result.failures.map((failure) => `FAIL: ${failure}`).join("\n"));
    process.exitCode = 1;
  } else console.log("Meta-entity release qualification passed.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
