import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const required = [
  "perf(phase-0):",
  "perf(phase-1):",
  "perf(phase-2):",
  "perf(phase-3):",
  "perf(phase-4):",
  "perf(phase-5):",
];
const history = execFileSync("git", ["log", "--format=%s", "--all"], { cwd: root, encoding: "utf8" });
const failures = required.filter((marker) => !history.includes(marker));
const route = readFileSync(resolve(root, "server/packages/services/records/routes/entity-mutation.route.ts"), "utf8");
for (const marker of ["legacy.create", "legacy.patch", "legacy.delete"]) {
  if (!route.includes(marker)) failures.push(`legacy mutation fallback '${marker}' is missing`);
}
const descriptorRoute = readFileSync(resolve(root, "server/packages/services/metadata/routes/compiled-entity.route.ts"), "utf8");
if (descriptorRoute.includes("ALLOW_LEGACY_DESCRIPTOR_FINGERPRINT_CACHE")) {
  failures.push("legacy descriptor fingerprint environment path is still present");
}
if (descriptorRoute.includes("!executionResolution")) {
  failures.push("descriptor route still has an execution-resolution bypass");
}
const scanInventory = JSON.parse(readFileSync(resolve(root, "config/governance/redis-scan-inventory.json"), "utf8"));
for (const entry of scanInventory.entries ?? []) {
  try { readFileSync(resolve(root, entry.path), "utf8"); }
  catch { failures.push(`Redis SCAN inventory path is missing: ${entry.path}`); }
  if (!entry.classification || entry.requestPath !== false) {
    failures.push(`Redis SCAN inventory entry is not bounded/non-request: ${entry.path}`);
  }
}
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Performance phase history and legacy-retirement boundary verified.");
