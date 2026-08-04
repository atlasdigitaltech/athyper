#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface JsonReport {
  ready?: boolean;
  counts?: Record<string, number>;
  findings?: Record<string, unknown[]>;
  legacyAuthoritySeedWrites?: unknown[];
}

const databaseRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const tsxCli = resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const strict = process.argv.includes("--strict");

const runtime = run("runtime", resolve(repositoryRoot,
  "server/scripts/verify-authorization-v2-phase2-runtime.ts"));
const persona = run("persona", resolve(databaseRoot,
  "scripts/verify/verify-authorization-v2-phase3.ts"));
const ddl = run("ddl", resolve(databaseRoot,
  "scripts/verify/verify-authorization-v2-phase4-clean-ddl.ts"));
const seeds = run("seeds", resolve(databaseRoot,
  "scripts/verify/verify-authorization-v2-phase5-seeds.ts"));

const counts = {
  legacyRuntimeReaderWriterFindings:
    runtime.counts?.legacy_authority ?? missing("runtime legacy_authority"),
  activePersonaFindings:
    persona.counts?.activePersonaFindings ?? missing("active Persona"),
  legacyDdlDefinitions:
    ddl.counts?.legacyDdlDefinitionFindings ?? missing("legacy DDL"),
  legacyDdlDependencies:
    ddl.counts?.legacyDdlDependencyFindings ?? missing("legacy DDL dependencies"),
  contextualAliases:
    ddl.counts?.contextualAliasFindings ?? missing("contextual aliases"),
  neonMeshAuthorityFindings:
    ddl.counts?.meshPathsInNeonProvisioning ?? missing("Neon Mesh authority"),
  staleSeedFindings:
    seeds.legacyAuthoritySeedWrites?.length ?? missing("stale seeds"),
};
const ready = Object.values(counts).every((count) => count === 0);
const report = {
  contractVersion: "authorization-v2.repository-zero-scans.v1",
  generatedAt: new Date().toISOString(),
  counts,
  gates: {
    legacyRuntimeReaderWritersZero: counts.legacyRuntimeReaderWriterFindings === 0,
    activePersonaZero: counts.activePersonaFindings === 0,
    legacyDdlDefinitionsZero: counts.legacyDdlDefinitions === 0,
    legacyDdlDependenciesZero: counts.legacyDdlDependencies === 0,
    contextualAliasesZero: counts.contextualAliases === 0,
    neonContainsNoMeshAuthority: counts.neonMeshAuthorityFindings === 0,
    staleAuthorizationSeedsZero: counts.staleSeedFindings === 0,
  },
  resetAuthorized: ready,
  ready,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && !ready) process.exitCode = 1;

function run(name: string, script: string): JsonReport {
  const child = spawnSync(process.execPath, [tsxCli, script], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (child.status !== 0) {
    throw new Error(`${name} zero-scan failed to execute: ${child.stderr || child.stdout}`);
  }
  try {
    return JSON.parse(child.stdout) as JsonReport;
  } catch {
    throw new Error(`${name} zero-scan did not return JSON`);
  }
}

function missing(name: string): never {
  throw new Error(`zero-scan report missing ${name} count`);
}
