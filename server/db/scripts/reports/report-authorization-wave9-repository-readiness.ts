#!/usr/bin/env tsx

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface ScanContract {
  roots: string[];
  excludedPathFragments: string[];
  executableExtensions: string[];
  personaPattern: string;
  contextualAliasPattern: string;
  neonMeshAuthorityPattern: string;
  legacyAuthorityPattern: string;
  legacyDefinitionPattern: string;
}

interface RemovalManifest {
  repositoryScan: ScanContract;
}

interface Finding {
  path: string;
  line: number;
  match: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const manifestPath = resolve(
  repositoryRoot,
  "config/governance/authorization-wave9-legacy-removal-manifest.v1.json",
);
const manifest = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as RemovalManifest;
const contract = manifest.repositoryScan;
const files = (
  await Promise.all(contract.roots.map((root) => walk(resolve(repositoryRoot, root))))
).flat().sort();

const persona = await scan(files, contract.personaPattern);
const contextualAliases = await scan(files, contract.contextualAliasPattern);
const legacyBuildDefinitions = await scan(
  files.filter((path) => normalized(path).includes("/server/db/ddl/")),
  contract.legacyDefinitionPattern,
);
const neonMeshAuthority = await scan(
  files.filter(isNeonRuntimeOrProvisionInput),
  contract.neonMeshAuthorityPattern,
);
const applicationReaderWriters = await scan(
  files.filter(isApplicationRuntimeInput),
  contract.legacyAuthorityPattern,
);
const generatedClientLegacySymbols = await scan(
  files.filter((path) => /(?:^|\/)(?:generated|prisma)(?:\/|$)/i.test(normalized(path))),
  contract.legacyAuthorityPattern,
);

const report = {
  contractVersion: "wave9.repository-readiness.v1",
  generatedAt: new Date().toISOString(),
  counts: {
    applicationReaderWriterFindings: applicationReaderWriters.length,
    personaFindings: persona.length,
    neonMeshAuthorityFindings: neonMeshAuthority.length,
    generatedClientLegacySymbols: generatedClientLegacySymbols.length,
    contextualAliasFindings: contextualAliases.length,
    legacyBuildDefinitionFindings: legacyBuildDefinitions.length,
  },
  ready: false,
  findings: {
    applicationReaderWriters,
    persona,
    neonMeshAuthority,
    generatedClientLegacySymbols,
    contextualAliases,
    legacyBuildDefinitions,
  },
};
report.ready = Object.values(report.counts).every((count) => count === 0);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    const repoPath = normalized(relative(repositoryRoot, path));
    if (excluded(repoPath)) continue;
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (
      entry.isFile()
      && contract.executableExtensions.includes(extname(entry.name).toLowerCase())
    ) output.push(path);
  }
  return output;
}

function excluded(repoPath: string): boolean {
  const withSlashes = `/${repoPath}/`;
  return contract.excludedPathFragments.some((fragment) =>
    withSlashes.toLowerCase().includes(fragment.toLowerCase())
  );
}

async function scan(
  paths: string[],
  pattern: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const path of paths) {
    const content = await readFile(path, "utf8");
    const regex = new RegExp(pattern, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      findings.push({
        path: normalized(relative(repositoryRoot, path)),
        line: lineNumber(content, match.index),
        match: match[0].replace(/\s+/g, " ").slice(0, 180),
      });
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }
  return findings;
}

function isApplicationRuntimeInput(path: string): boolean {
  const value = normalized(relative(repositoryRoot, path));
  return !value.startsWith("server/db/")
    && !value.includes("/__tests__/")
    && !value.includes(".test.")
    && !value.includes(".spec.")
    && !value.startsWith("config/governance/")
    && !value.startsWith("scripts/policy/");
}

function isNeonRuntimeOrProvisionInput(path: string): boolean {
  const value = normalized(relative(repositoryRoot, path));
  if (
    value.startsWith("server/db/ddl/mesh/")
    || value.startsWith("server/db/ddl/mesh_control/")
    || value.startsWith("server/db/ddl/mesh_log/")
    || value.startsWith("server/db/seed/tenants/mesh/")
    || value.includes("provision-mesh")
  ) return false;
  return value.startsWith("server/")
    || value.startsWith("stack/")
    || value.startsWith("apps/");
}

function lineNumber(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function normalized(path: string): string {
  return path.replace(/\\/g, "/");
}
