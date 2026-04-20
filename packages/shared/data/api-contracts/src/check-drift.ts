/**
 * @athyper/api-contracts — Contract Drift Checker
 *
 * CI script: hashes all schema source files and compares against a committed
 * baseline. Fails if any file has changed without updating the baseline.
 *
 * Usage:
 *   pnpm --filter @athyper/api-contracts contracts:check          # CI
 *   pnpm --filter @athyper/api-contracts contracts:check --update # re-baseline
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dir, "../../../../..");

const WATCHED = [
  "packages/shared/data/api-contracts/src/schemas/common.ts",
  "packages/shared/data/api-contracts/src/schemas/metadata.ts",
  "packages/shared/data/api-contracts/src/schemas/records.ts",
  "packages/shared/data/api-contracts/src/schemas/documents.ts",
  "packages/shared/data/api-contracts/src/schemas/workflow.ts",
  "packages/shared/data/api-contracts/src/schemas/ledger.ts",
  "packages/shared/data/api-contracts/src/schemas/platform.ts",
  "packages/shared/data/api-contracts/src/schemas/entity-list.ts",
  "packages/shared/data/api-contracts/src/enums.ts",
];

const BASELINE_PATH = join(__dir, "contracts-baseline.json");

function hashFile(absPath: string): string {
  const content = readFileSync(absPath, "utf-8");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function computeHashes(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rel of WATCHED) {
    const abs = join(REPO_ROOT, rel);
    result[rel] = hashFile(abs);
  }
  return result;
}

const isUpdate = process.argv.includes("--update");
const current = computeHashes();

if (isUpdate) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`api-contracts: baseline updated (${WATCHED.length} files).`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.warn("api-contracts: no baseline found. Run with --update to create one.");
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as Record<string, string>;

const drifted: string[] = [];
for (const [file, hash] of Object.entries(current)) {
  if (baseline[file] !== hash) {
    drifted.push(file);
  }
}
for (const file of WATCHED) {
  if (!(file in baseline)) {
    drifted.push(`${file} (new — not in baseline)`);
  }
}

if (drifted.length > 0) {
  console.error("api-contracts: schema drift detected in:");
  for (const f of drifted) console.error(`  ${f}`);
  console.error("\nRun 'pnpm contracts:check --update' after verifying server types match.");
  process.exit(1);
}

console.log(`api-contracts: all ${WATCHED.length} schema files match baseline. ✓`);
process.exit(0);
