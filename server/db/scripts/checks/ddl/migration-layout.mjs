import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const inventory = JSON.parse(
  readFileSync(resolve(root, "migrations/inventory.json"), "utf8"),
);
const errors = [];
const entries = new Map();
const active = new Map();
const safePath = (path) => {
  const full = resolve(root, path);
  if (relative(root, full).startsWith(".."))
    throw new Error(`Path escapes database root: ${path}`);
  return full;
};
if (inventory.schemaVersion !== 1)
  throw new Error("Unsupported migration inventory version");
for (const entry of inventory.entries) {
  if (entries.has(entry.originalPath))
    errors.push(`Duplicate entry: ${entry.originalPath}`);
  entries.set(entry.originalPath, entry);
  for (const path of entry.canonicalPaths ?? []) {
    if (!existsSync(safePath(path)))
      errors.push(`Missing canonical SQL: ${path}`);
  }
  if (entry.disposition === "canonical") {
    if (existsSync(safePath(entry.originalPath)))
      errors.push(`Retired patch still exists: ${entry.originalPath}`);
    if (!entry.canonicalPaths?.length)
      errors.push(`Missing canonical mapping: ${entry.originalPath}`);
    for (const path of entry.canonicalPaths ?? []) {
      if (!existsSync(safePath(path)))
        errors.push(`Missing canonical SQL: ${path}`);
    }
  } else {
    if (
      ![
        "forward-upgrade",
        "operational-upgrade",
        "historical-fixture",
        "legacy-upgrade",
        "operational-repair",
      ].includes(entry.disposition)
    ) {
      errors.push(`Unknown disposition: ${entry.disposition}`);
      continue;
    }
    if (
      entry.path !== entry.originalPath &&
      existsSync(safePath(entry.originalPath))
    ) {
      errors.push(
        `Obsolete migration copy still exists: ${entry.originalPath}`,
      );
    }
    const path = safePath(entry.path);
    if (!existsSync(path)) errors.push(`Missing retained SQL: ${entry.path}`);
    else if (
      createHash("sha256").update(readFileSync(path)).digest("hex") !==
      entry.sha256
    ) {
      errors.push(
        `Retained SQL changed; preserve installed migration bytes: ${entry.path}`,
      );
    }
    active.set(entry.path, entry);
    for (const caller of entry.callers ?? []) {
      if (!existsSync(resolve(root, "../..", caller)))
        errors.push(`Missing caller: ${caller}`);
    }
  }
}
const manifested = new Map();
for (const plane of ["neon", "studio", "mesh"]) {
  const lines = readFileSync(
    resolve(root, `migrations/manifests/${plane}.txt`),
    "utf8",
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (new Set(lines).size !== lines.length)
    errors.push(`Duplicate ${plane} manifest entry`);
  for (const name of lines) {
    const path = `migrations/${name}`;
    const entry = active.get(path);
    if (
      !entry ||
      entry.disposition !== "forward-upgrade" ||
      !entry.planes.includes(plane)
    ) {
      errors.push(`Unregistered ${plane} upgrade: ${name}`);
    }
    const planes = manifested.get(path) ?? [];
    planes.push(plane);
    manifested.set(path, planes);
  }
}
for (const [path, entry] of active) {
  if (
    JSON.stringify([...(manifested.get(path) ?? [])].sort()) !==
    JSON.stringify([...entry.planes].sort())
  ) {
    errors.push(`Manifest planes disagree with inventory: ${path}`);
  }
}
for (const name of readdirSync(resolve(root, "migrations"))) {
  if (name.endsWith(".sql") && !active.has(`migrations/${name}`))
    errors.push(`Unclassified SQL: ${name}`);
}
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  `Migration layout verified: ${inventory.entries.length} classified files, ${active.size} retained SQL files.`,
);
