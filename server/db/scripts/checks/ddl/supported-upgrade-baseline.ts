#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const dbRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(dbRoot, "../..");
const artifactPath = resolve(dbRoot, "migrations/baselines/2026-09-03.v1.json");
type Plane = "studio" | "neon" | "mesh";
type PlaneBaseline = { databaseName: string; foundationManifestSha256: string; includedMigrationManifestSha256: string; includedMigrationCount: number; retiredHistoricalMigrations: string[]; forwardMigrations: string[] };
type Baseline = { contractVersion: string; gitRevision: string; planes: Record<Plane, PlaneBaseline> };

const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as Baseline;
if (artifact.contractVersion !== "athyper.database-upgrade-baseline.v1" || !/^[0-9a-f]{40}$/u.test(artifact.gitRevision)) throw new Error("invalid supported upgrade baseline identity");

for (const plane of ["studio", "neon", "mesh"] as const) {
  const baseline = artifact.planes[plane];
  if (baseline.databaseName !== `athyper_${plane}`) throw new Error(`${plane} baseline database identity is invalid`);
  const foundation = await gitShow(`${artifact.gitRevision}:server/db/ddl/planes/${plane}/_manifest.txt`);
  const included = await gitShow(`${artifact.gitRevision}:server/db/migrations/manifests/${plane}.txt`);
  if (sha256(foundation) !== baseline.foundationManifestSha256) throw new Error(`${plane} baseline foundation manifest hash mismatch`);
  if (sha256(included) !== baseline.includedMigrationManifestSha256) throw new Error(`${plane} included migration manifest hash mismatch`);
  const includedEntries = entries(included);
  if (includedEntries.length !== baseline.includedMigrationCount) throw new Error(`${plane} included migration count mismatch`);
  const currentEntries = entries(await readFile(resolve(dbRoot, `migrations/manifests/${plane}.txt`), "utf8"));
  const unexpectedRemoval = includedEntries.filter((entry) => !currentEntries.includes(entry) && !baseline.retiredHistoricalMigrations.includes(entry));
  if (unexpectedRemoval.length) throw new Error(`${plane} removed non-retired historical migrations: ${unexpectedRemoval.join(", ")}`);
  const retainedRetired = baseline.retiredHistoricalMigrations.filter((entry) => currentEntries.includes(entry));
  if (retainedRetired.length) throw new Error(`${plane} still activates retired historical migrations: ${retainedRetired.join(", ")}`);
  const delta = currentEntries.filter((entry) => !includedEntries.includes(entry));
  if (JSON.stringify(delta) !== JSON.stringify(baseline.forwardMigrations)) throw new Error(`${plane} forward migration delta differs from the certified baseline`);
  for (const migration of delta) await readFile(resolve(dbRoot, "migrations", migration), "utf8");
  console.log(`${plane}: baseline=${includedEntries.length} forward=${delta.length} current=${currentEntries.length}`);
}
console.log(`Supported upgrade baseline verified at ${artifact.gitRevision}.`);

async function gitShow(specification: string) {
  return (await run("git", ["show", specification], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })).stdout;
}
function entries(source: string) { return source.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")); }
function sha256(source: string) { return createHash("sha256").update(source).digest("hex"); }
