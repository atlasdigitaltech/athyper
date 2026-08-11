import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["server/packages", "server/apps/platform-host/src"];
const baselineDocument = JSON.parse(await readFile(join(root, "tools/scripts/openapi-undocumented-baseline.json"), "utf8"));
const baseline = new Set(baselineDocument.routes);
const sourceExclusions = new Map(baselineDocument.sources.map((entry) => [entry.source, entry.reason]));
const observedBaseline = new Set();
const observedSourceExclusions = new Set();
const operationIds = new Map();
const failures = [];

for (const scanRoot of scanRoots) {
  for (const file of await files(join(root, scanRoot))) {
    if (extname(file) !== ".ts" || file.includes("__tests__") || file.endsWith(".test.ts")) continue;
    const source = await readFile(file, "utf8");
    const sourcePath = relative(root, file).replaceAll("\\", "/");
    for (const match of source.matchAll(/operationId\s*:\s*["'`]([^"'`]+)["'`]/g)) {
      const operationId = match[1];
      const previous = operationIds.get(operationId);
      if (previous) failures.push(`Duplicate operationId ${operationId}: ${previous}, ${relative(root, file)}`);
      else operationIds.set(operationId, relative(root, file));
    }
    if (file.includes(join("runtime", "http"))) continue;
    for (const match of source.matchAll(/\b(?:application|app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      const key = `${match[1].toUpperCase()} ${match[2]}`;
      if (baseline.has(key)) observedBaseline.add(key);
      else if (sourceExclusions.has(sourcePath)) observedSourceExclusions.add(sourcePath);
      else failures.push(`Undocumented route ${key} at ${relative(root, file)}:${line}; use registerContractRoute or add an explicit source exclusion with a reason`);
    }
  }
}

if (operationIds.size === 0) failures.push("No OpenAPI operation contracts were found");
for (const entry of baseline) if (!observedBaseline.has(entry)) failures.push(`Stale undocumented-route baseline entry (remove it): ${entry}`);
if (typeof baselineDocument.defaultReason !== "string" || !baselineDocument.defaultReason.trim()) failures.push("Raw-route baseline requires a defaultReason");
for (const [source, reason] of sourceExclusions) {
  if (typeof reason !== "string" || !reason.trim()) failures.push(`Source exclusion requires a reason: ${source}`);
  if (!observedSourceExclusions.has(source)) failures.push(`Stale source exclusion (remove it): ${source}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Verified ${operationIds.size} unique OpenAPI operation contracts; ${baseline.size} legacy raw routes and ${observedSourceExclusions.size} raw-route sources are explicitly excluded with reasons; no unclassified public routes.`);

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else output.push(path);
  }
  return output;
}
