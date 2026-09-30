import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const path = process.argv.find((arg) => arg.startsWith("--artifact="))?.split("=").slice(1).join("=")
  || "tooling/performance/qualification/evidence/tenant-size-load.json";
const absolute = resolve(root, path);
if (!existsSync(absolute)) throw new Error(`tenant-size load evidence is missing: ${path}`);
const artifact = JSON.parse(readFileSync(absolute, "utf8"));
const failures = [];
if (artifact.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (artifact.passed !== true) failures.push("passed must be true");
const fixtures = artifact.tenantFixtures ?? artifact.fixtures;
if (!Number.isFinite(fixtures?.smallRows) || fixtures.smallRows < 1) failures.push("tenantFixtures.smallRows is required");
if (!Number.isFinite(fixtures?.largeRows) || fixtures.largeRows < fixtures.smallRows) failures.push("tenantFixtures.largeRows must be >= smallRows");
if (!Number.isFinite(artifact.latency?.p95Ms)) failures.push("latency.p95Ms is required");
if (!Number.isFinite(artifact.latency?.p99Ms)) failures.push("latency.p99Ms is required");
if (artifact.queryPlans?.keyset !== true) failures.push("queryPlans.keyset must be true");
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: tenant-size-load: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Tenant-size load evidence validated (${fixtures.smallRows} small rows, ${fixtures.largeRows} large rows).`);
