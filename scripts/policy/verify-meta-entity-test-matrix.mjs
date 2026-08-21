import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const path = resolve(root, "config/governance/meta-entity-test-matrix.json");
const matrix = JSON.parse(readFileSync(path, "utf8"));
const failures = [];
const covered = new Set();

for (const entry of matrix.coverage ?? []) {
  if (!entry.artifact || !existsSync(resolve(root, entry.artifact))) {
    failures.push(`coverage artifact is missing: ${entry.artifact ?? "<unset>"}`);
  }
  for (const label of entry.covers ?? []) covered.add(label);
}

for (const [axis, values] of Object.entries(matrix.required ?? {})) {
  for (const value of values) {
    if (!covered.has(value)) failures.push(`${axis}: required case '${value}' has no coverage artifact`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Meta-entity test matrix covers ${covered.size} required cases across ${matrix.coverage.length} artifacts.`);
}
