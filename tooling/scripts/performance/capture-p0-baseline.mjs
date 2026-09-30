import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outDir = resolve(process.env.PERF_OUTPUT_DIR || "tooling/performance/artifacts/p0");
const baseUrl = required("PERF_BASE_URL");
const k6 = process.env.K6_BIN || "k6";
const repetitions = positiveInt(process.env.PERF_REPETITIONS || "3", "PERF_REPETITIONS");
const scenarios = [
  { name: "framework", script: "tooling/performance/k6/p0-meta-entity-baseline.k6.js" },
  { name: "mutation", script: "tooling/performance/k6/p6-mutation-kernel.k6.js", optional: true },
  { name: "resilience", script: "tooling/performance/k6/meta-entity-resilience.k6.js", optional: true },
  { name: "lifecycle", script: process.env.PERF_LIFECYCLE_SCRIPT || "", optional: true },
  { name: "pool-pressure", envKey: "POOL_PRESSURE", script: process.env.PERF_POOL_PRESSURE_SCRIPT || "", optional: true },
];

mkdirSync(outDir, { recursive: true });
const metadata = {
  schemaVersion: 1,
  kind: "athyper.performance.p0",
  capturedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  baseUrl,
  repetitions,
  node: process.version,
  datasetProfile: process.env.PERF_DATASET_PROFILE || "unspecified",
  topology: {
    apiReplicas: process.env.PERF_API_REPLICAS || "unspecified",
    postgres: process.env.PERF_POSTGRES_TOPOLOGY || "unspecified",
    redis: process.env.PERF_REDIS_TOPOLOGY || "unspecified",
  },
  scenarios: [],
};

for (const scenario of scenarios) {
  const scenarioKey = scenario.envKey || scenario.name.toUpperCase();
  if (scenario.optional && process.env[`PERF_SKIP_${scenarioKey}`] === "true") continue;
  if (scenario.name === "mutation" && process.env.P6_WRITE_MODE?.toLowerCase() !== "enabled") {
    metadata.scenarios.push({ name: scenario.name, status: "not_configured" });
    continue;
  }
  if (!scenario.script) {
    metadata.scenarios.push({ name: scenario.name, status: "not_configured" });
    continue;
  }
  for (let run = 1; run <= repetitions; run += 1) {
    const prefix = `${scenario.name}-run-${run}`;
    const before = `${outDir}/${prefix}-metrics-before.txt`;
    const after = `${outDir}/${prefix}-metrics-after.txt`;
    const summary = `${outDir}/${prefix}-k6-summary.json`;
    captureMetrics(baseUrl, before);
    const result = spawnSync(k6, ["run", "--summary-export", summary, scenario.script], {
      cwd: root,
      env: { ...process.env, BASE_URL: baseUrl },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    captureMetrics(baseUrl, after);
    captureTopSql(`${outDir}/${prefix}-top-sql.txt`);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${scenario.name} run ${run} failed with exit code ${result.status}`);
    metadata.scenarios.push({ name: scenario.name, run, script: scenario.script, summary, before, after });
  }
}

writeFileSync(`${outDir}/capture-manifest.json`, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Performance artifacts written to ${outDir}`);

function captureMetrics(url, destination) {
  const endpoint = `${url.replace(/\/$/, "")}/metrics`;
  const result = spawnSync(process.env.CURL_BIN || "curl", ["--fail", "--silent", "--show-error", endpoint], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`Unable to capture ${endpoint}: ${result.stderr || "curl failed"}`);
  writeFileSync(destination, result.stdout);
}

function captureTopSql(destination) {
  const command = process.env.PERF_PG_TOP_SQL_COMMAND?.trim();
  if (!command) {
    writeFileSync(destination, "Top SQL capture not configured. Set PERF_PG_TOP_SQL_COMMAND in the performance environment.\n");
    return;
  }
  const [commandName, ...commandArgs] = splitCommand(command);
  const result = spawnSync(commandName, commandArgs, { cwd: root, encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`Top SQL capture failed: ${result.stderr || command}`);
  writeFileSync(destination, result.stdout);
}

function splitCommand(value) {
  const parts = [];
  let current = "";
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") {
        const next = value[index + 1];
        if (next === quote || next === "\\") {
          current += next;
          index += 1;
          continue;
        }
      }
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    if (char === "\\") {
      const next = value[index + 1];
      if (next !== undefined) {
        current += next;
        index += 1;
      }
      continue;
    }

    current += char;
  }

  if (quote) throw new Error(`Unable to parse PERF_PG_TOP_SQL_COMMAND: unmatched quote.`);
  if (current.length > 0) parts.push(current);
  if (parts.length === 0) throw new Error("PERF_PG_TOP_SQL_COMMAND is empty.");
  return parts;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; refusing to create a synthetic performance report.`);
  return value;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
