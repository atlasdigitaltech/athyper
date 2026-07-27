#!/usr/bin/env node
/**
 * Blocks new dependencies on retired runtime packages and growth of legacy
 * /api/records consumers. Existing exceptions are explicit, owned, dated,
 * and bounded by occurrence count so this is a ratchet rather than a waiver.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const policyPath = join(root, "policy", "legacy-runtime-retirement-allowlist.json");
const sourceRoots = ["apps", "packages", "server"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs"]);
const skipDirectories = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage", ".git"]);
const legacyImport = /(?:from\s*["']|import\s*\(\s*["'])@athyper\/(?:entity-runtime|document-runtime|runtime-document|runtime-record)(?:[/'"])/g;
const legacyRecords = /\/api\/(?:relay\/api\/)?records\b/g;

async function walk(directory, files) {
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (skipDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
  }
}

function count(text, pattern) {
  pattern.lastIndex = 0;
  let result = 0;
  while (pattern.exec(text)) result += 1;
  pattern.lastIndex = 0;
  return result;
}

function dateIsValid(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validatePolicy(policy) {
  const failures = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const allowance of [...(policy.legacyPackageRoots ?? []), ...(policy.legacyRecordsConsumers ?? [])]) {
    if (!allowance.path || !allowance.owner || !dateIsValid(allowance.removeBy)) {
      failures.push(`invalid allowlist entry: ${JSON.stringify(allowance)}`);
    }
    if (dateIsValid(allowance.removeBy) && allowance.removeBy < today) {
      failures.push(`${allowance.path}: removal target ${allowance.removeBy} has passed; migrate or renew the owned exception explicitly`);
    }
  }
  return failures;
}

async function main() {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const failures = validatePolicy(policy);
  const exactAllowances = new Map((policy.legacyRecordsConsumers ?? []).map((entry) => [entry.path, entry]));
  const rootAllowances = policy.legacyPackageRoots ?? [];
  const files = [];
  await Promise.all(sourceRoots.map((directory) => walk(join(root, directory), files)));

  for (const file of files) {
    const path = relative(root, file).replaceAll("\\", "/");
    const text = await readFile(file, "utf8");
    const packageRoot = rootAllowances.find((entry) => path.startsWith(entry.path));
    const imports = count(text, legacyImport);
    if (imports > 0 && !packageRoot) {
      failures.push(`${path}: imports a deprecated runtime package (${imports} occurrence(s))`);
    }
    if (packageRoot) packageRoot.actualImports = (packageRoot.actualImports ?? 0) + imports;

    const recordCalls = count(text, legacyRecords);
    if (recordCalls === 0) continue;
    if (packageRoot) {
      packageRoot.actualOccurrences = (packageRoot.actualOccurrences ?? 0) + recordCalls;
      continue;
    }
    const allowance = exactAllowances.get(path);
    if (!allowance) {
      failures.push(`${path}: legacy /api/records consumer is not allowlisted`);
    } else if (recordCalls > allowance.maxOccurrences) {
      failures.push(`${path}: has ${recordCalls} legacy /api/records occurrence(s), above allowlisted maximum ${allowance.maxOccurrences}`);
    }
    if (allowance) allowance.actualOccurrences = recordCalls;
  }

  for (const allowance of rootAllowances) {
    if ((allowance.actualOccurrences ?? 0) > allowance.maxLegacyRecordsOccurrences) {
      failures.push(`${allowance.path}: has ${allowance.actualOccurrences} legacy /api/records occurrence(s), above allowlisted maximum ${allowance.maxLegacyRecordsOccurrences}`);
    }
    if ((allowance.actualImports ?? 0) > allowance.maxDeprecatedRuntimeImports) {
      failures.push(`${allowance.path}: imports deprecated runtime packages ${allowance.actualImports} time(s), above allowlisted maximum ${allowance.maxDeprecatedRuntimeImports}`);
    }
  }
  for (const allowance of exactAllowances.values()) {
    if (!allowance.actualOccurrences) {
      failures.push(`${allowance.path}: stale legacy /api/records allowance; remove it from the retirement inventory`);
    }
  }

  if (failures.length > 0) {
    console.error("[legacy-runtime-retirement] policy violations:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log("[legacy-runtime-retirement] OK — deprecated dependencies and /api/records usage are within the owned retirement baseline.");
}

main().catch((error) => {
  console.error("[legacy-runtime-retirement] fatal", error);
  process.exit(2);
});
