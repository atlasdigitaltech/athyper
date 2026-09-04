import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifactPath = resolve(process.cwd(), process.argv[2] || required("PERF_ROLLOUT_ARTIFACT"));
  const coldMaxMs = positiveNumber(process.env.PERF_COLD_MAX_MS || "3000", "PERF_COLD_MAX_MS");
  const warmMaxMs = positiveNumber(process.env.PERF_WARM_MAX_MS || "500", "PERF_WARM_MAX_MS");
  const descriptorMaxMs = positiveNumber(
    process.env.PERF_WARM_DESCRIPTOR_MAX_MS || "100",
    "PERF_WARM_DESCRIPTOR_MAX_MS",
  );
  const report = JSON.parse(readFileSync(artifactPath, "utf8"));
  const failures = verifyRolloutReport(report, { coldMaxMs, warmMaxMs, descriptorMaxMs });

  if (failures.length > 0) {
    console.error(`Runtime-list cache rollout gate failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    const cold = median(scenarioValues(report, "first_visit", "rowsVisibleMs"));
    const warm = median(scenarioValues(report, "immediate_revisit", "rowsVisibleMs"));
    console.log(`Runtime-list cache rollout gate passed: cold median ${cold}ms; warm median ${warm}ms.`);
  }
}

export function verifyRolloutReport(report, thresholds) {
  const failures = [];
  if (report?.kind !== "athyper.runtime-list-cache-rollout" || report?.schemaVersion !== 2) {
    failures.push("Artifact must be a schemaVersion 2 athyper.runtime-list-cache-rollout report.");
    return failures;
  }
  if (!Array.isArray(report.runs) || report.runs.length < 1) {
    failures.push("Artifact contains no rollout runs.");
    return failures;
  }

  const requiredScenarios = [
    "first_visit",
    "immediate_revisit",
    "different_query",
    "context_switch",
    "mutation_revisit",
  ];
  for (const [index, run] of report.runs.entries()) {
    for (const name of requiredScenarios) {
      if (!scenario(run, name)) failures.push(`Run ${index + 1} is missing ${name}.`);
    }
  }
  if (failures.length > 0) return failures;

  const cold = median(scenarioValues(report, "first_visit", "rowsVisibleMs"));
  const warm = median(scenarioValues(report, "immediate_revisit", "rowsVisibleMs"));
  if (cold >= thresholds.coldMaxMs) {
    failures.push(`Cold rows-visible median ${cold}ms must be under ${thresholds.coldMaxMs}ms.`);
  }
  if (warm > thresholds.warmMaxMs) {
    failures.push(`Warm rows-visible median ${warm}ms must be at most ${thresholds.warmMaxMs}ms.`);
  }

  for (const [index, run] of report.runs.entries()) {
    const warmVisit = scenario(run, "immediate_revisit");
    if (warmVisit.navigationKind !== "client") {
      failures.push(`Run ${index + 1} warm revisit was not a shell-preserving client navigation.`);
    }
    if ((warmVisit.documentRequests?.length ?? 0) > 0) {
      failures.push(`Run ${index + 1} warm revisit issued a new HTML document request.`);
    }
    if (warmVisit.skeletonSeen === true) {
      failures.push(`Run ${index + 1} showed a skeleton during the warm revisit.`);
    }
    if (!hasBrowserCacheState(warmVisit, ["hit", "stale"])) {
      failures.push(`Run ${index + 1} warm revisit did not consume a usable browser-cache entry.`);
    }

    const descriptor = operation(warmVisit, "descriptor");
    if (!descriptor || descriptor.cacheState !== "hit") {
      failures.push(`Run ${index + 1} warm revisit did not reuse the valid descriptor window.`);
    }
    if (descriptor && Number(descriptor.durationMs) >= (thresholds.descriptorMaxMs ?? 100)) {
      failures.push(
        `Run ${index + 1} warm descriptor resolution ${descriptor.durationMs}ms must be under ${thresholds.descriptorMaxMs ?? 100}ms.`,
      );
    }
    if (warmVisit.apiProbe?.recordCache !== "hit") {
      failures.push(
        `Run ${index + 1} warm authoritative records probe did not hit the security-scoped projection cache.`,
      );
    }
    const recordOperation = operation(warmVisit, "records");
    if (recordOperation && recordOperation.cacheState !== "hit") {
      failures.push(`Run ${index + 1} warm RSC records operation was not served from projection cache.`);
    }
    for (const name of ["first_visit", "immediate_revisit"]) {
      if (scenario(run, name).page2RequestedBeforeIntent === true) {
        failures.push(`Run ${index + 1} ${name} prefetched page 2 before idle or user intent.`);
      }
    }
    for (const name of ["session_config", "saved_views"]) {
      const entry = operation(warmVisit, name);
      if (entry && entry.count > 1) {
        failures.push(`Run ${index + 1} repeated ${name} ${entry.count} times during one warm route.`);
      }
    }

    for (const name of ["different_query", "context_switch", "mutation_revisit"]) {
      if (hasBrowserCacheState(scenario(run, name), ["hit"])) {
        failures.push(`Run ${index + 1} ${name} incorrectly reused an incompatible browser-cache entry.`);
      }
    }
  }
  return failures;
}

function scenario(run, name) {
  return run?.scenarios?.find((candidate) => candidate.name === name);
}

function operation(visit, name) {
  return visit?.rscDiagnostics?.operations?.find((entry) => entry.operation === name);
}

function hasBrowserCacheState(visit, states) {
  return Boolean(visit?.browserCache?.some((entry) => states.includes(entry.cache)));
}

function scenarioValues(report, scenarioName, field) {
  return report.runs
    .map((run) => Number(scenario(run, scenarioName)?.[field]))
    .filter(Number.isFinite);
}

function median(values) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} or an artifact path argument is required.`);
  return value;
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}
