import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || true];
}));
const config = load("governance/config/governance/release-gate.json");
const failures = [];
const checked = [];

function load(path) { return JSON.parse(readFileSync(resolve(root, path), "utf8")); }

function check(name, path, options = {}) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) { failures.push(`${name}: missing ${path}`); return null; }
  let artifact;
  try { artifact = load(path); }
  catch (error) { failures.push(`${name}: invalid JSON (${error.message})`); return null; }
  checked.push({ name, path });
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    failures.push(`${name}: artifact must be a JSON object`);
    return artifact;
  }
  if (artifact.schemaVersion !== 1) failures.push(`${name}: schemaVersion must be 1`);
  if (options.passed && artifact.passed !== true) failures.push(`${name}: passed must be true`);
  return artifact;
}

const reportPath = config.requiredEvidence.performanceReport;
if (reportPath.endsWith("current-report.example.json")) failures.push("performanceReport: example report is prohibited");
const report = check("performanceReport", reportPath);
if (report && (!report.routes || !report.checks)) failures.push("performanceReport: routes and checks are required");
check("qualification", args.qualification || "tooling/performance/qualification/result.json", { passed: true });

for (const [name, path] of Object.entries(config.requiredEvidence)) {
  if (name === "performanceReport" || name === "queryCountBudget" || name === "latencyBudget" || name === "transactionDurationBudget") continue;
  check(name, path, { passed: true });
}

const result = {
  schemaVersion: 1,
  kind: "athyper.release.qualification-artifact-validation",
  passed: failures.length === 0,
  checked,
  failures,
  validatedAt: new Date().toISOString(),
};
const output = args.output || "tooling/performance/qualification/artifact-validation.json";
writeFileSync(resolve(root, output), `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Validated ${checked.length} qualification artifacts.`);
