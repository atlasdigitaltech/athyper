import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "config/governance/meta-entity-dependencies.json"), "utf8"));
const failures = [];
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.dependencies)) failures.push("dependency manifest must use schemaVersion 1");
const ids = new Set();
for (const dependency of manifest.dependencies ?? []) {
  if (!dependency.id || ids.has(dependency.id)) failures.push(`dependency id is missing or duplicated: ${dependency.id ?? "<unset>"}`);
  ids.add(dependency.id);
  if (!Array.isArray(dependency.artifacts) || dependency.artifacts.length === 0) failures.push(`${dependency.id}: artifacts are required`);
  for (const artifact of dependency.artifacts ?? []) if (!existsSync(resolve(root, artifact))) failures.push(`${dependency.id}: missing artifact ${artifact}`);
}
const requiredExclusions = ["object-storage-attachment-transfer", "sse-shared-fanout-redesign", "global-redis-deployment-separation", "domain-specific-query-mutation-optimization", "arbitrary-mutable-record-caching"];
for (const exclusion of requiredExclusions) if (!manifest.exclusions?.includes(exclusion)) failures.push(`required exclusion is missing: ${exclusion}`);
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exitCode = 1;
} else console.log(`Meta-entity dependency contract passed (${manifest.dependencies.length} dependencies, ${manifest.exclusions.length} exclusions).`);
