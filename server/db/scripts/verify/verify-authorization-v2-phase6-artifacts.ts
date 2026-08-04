#!/usr/bin/env tsx

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface Finding {
  path: string;
  line: number;
  match: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const strict = process.argv.includes("--strict");
const generatedRoots = [
  resolve(repositoryRoot, "server/packages/adapters/db/src/prisma"),
];
const contractRoots = [
  resolve(repositoryRoot, "apps"),
  resolve(repositoryRoot, "packages"),
  resolve(repositoryRoot, "server/src"),
  resolve(repositoryRoot, "server/packages/services"),
];
const legacy = /\b(?:persona(?:_id|Id|_code|Code|_key|Key|_permission)?|principal_persona|persona_permission|permission_alias|auth_permission_alias_v2|mesh_account_grant_ids)\b/gi;
const generatedLegacySymbols = await scan(
  (await Promise.all(generatedRoots.map(walk))).flat(),
  legacy,
);
const staleContractFields = await scan(
  (await Promise.all(contractRoots.map(walk))).flat(),
  legacy,
);
const aliasArtifacts = (await walk(resolve(databaseRoot, "catalog")))
  .filter((path) => /contextual-aliases\..*\.json$/i.test(path))
  .map((path) => normalize(relative(repositoryRoot, path)));
const legacyMapperTools = (await walk(resolve(
  repositoryRoot,
  "stack/config/iam/protocol-mappers",
))).filter((path) => /\.(?:json|md)$/i.test(path))
  .map((path) => normalize(relative(repositoryRoot, path)));
const activeCleanupDocuments = (await walk(resolve(repositoryRoot, "docs/cleanup-plan")))
  .map((path) => normalize(relative(repositoryRoot, path)));
const inventory = JSON.parse(await readFile(resolve(
  repositoryRoot,
  "config/governance/authorization-inventory.v1.json",
), "utf8")) as {
  gates?: { unknownSources?: unknown[]; unknownWriters?: unknown[] };
};
const unknownSources = inventory.gates?.unknownSources ?? [];
const unknownWriters = inventory.gates?.unknownWriters ?? [];
const prismaSchemas = await Promise.all(generatedRoots.flatMap((root) => [
  readFile(resolve(root, "schema.prisma"), "utf8"),
  readFile(resolve(root, "schema.mesh.prisma"), "utf8"),
]));
const canonicalModelsPresent = prismaSchemas.every((schema) =>
  /\bmodel\s+auth_permission\b/.test(schema)
  && /\bmodel\s+auth_plane_membership\b/.test(schema)
);
const report = {
  contractVersion: "authorization-v2.phase6-artifact-gate.v1",
  generatedAt: new Date().toISOString(),
  counts: {
    generatedLegacySymbols: generatedLegacySymbols.length,
    staleUiApiContractFields: staleContractFields.length,
    migrationOnlyAliasArtifacts: aliasArtifacts.length,
    legacyKeycloakMapperTools: legacyMapperTools.length,
    activeCleanupDocuments: activeCleanupDocuments.length,
    unknownAuthorizationSources: unknownSources.length,
    unknownAuthorizationWriters: unknownWriters.length,
  },
  gates: {
    generatedLegacySymbolsZero: generatedLegacySymbols.length === 0,
    generatedClientsCanonicalTargetsOnly:
      generatedLegacySymbols.length === 0 && canonicalModelsPresent,
    staleUiApiFieldsZero: staleContractFields.length === 0,
    migrationOnlyAliasesRemoved: aliasArtifacts.length === 0,
    legacyKeycloakMapperToolsRemoved: legacyMapperTools.length === 0,
    cleanupDocumentsOutsideActiveInputs: activeCleanupDocuments.length === 0,
    authorizationInventoryUnknownSourcesAndWritersZero:
      unknownSources.length === 0 && unknownWriters.length === 0,
  },
  ready:
    generatedLegacySymbols.length === 0
    && staleContractFields.length === 0
    && aliasArtifacts.length === 0
    && legacyMapperTools.length === 0
    && activeCleanupDocuments.length === 0
    && canonicalModelsPresent
    && unknownSources.length === 0
    && unknownWriters.length === 0,
  findings: {
    generatedLegacySymbols,
    staleContractFields,
    aliasArtifacts,
    legacyMapperTools,
    activeCleanupDocuments,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && !report.ready) process.exitCode = 1;

async function scan(paths: string[], pattern: RegExp): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const path of paths) {
    if (![".ts", ".tsx", ".js", ".mjs", ".json", ".prisma"].includes(extname(path))) continue;
    const content = await readFile(path, "utf8");
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      findings.push({
        path: normalize(relative(repositoryRoot, path)),
        line: content.slice(0, match.index).split("\n").length,
        match: match[0],
      });
    }
  }
  return findings;
}
async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    const repoPath = normalize(relative(repositoryRoot, path));
    if (
      repoPath.includes("/node_modules/")
      || repoPath.includes("/dist/")
      || repoPath.includes("/.next/")
      || repoPath.includes("/__tests__/")
      || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repoPath)
    ) continue;
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
