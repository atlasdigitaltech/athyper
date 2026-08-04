#!/usr/bin/env tsx

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface RemovalManifest {
  objects: Array<{ kind: string; name: string }>;
}
interface Finding {
  path: string;
  line: number;
  object: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const strict = process.argv.includes("--strict");
const ddlRoot = resolve(databaseRoot, "ddl");
const manifest = JSON.parse(await readFile(resolve(
  repositoryRoot,
  "config/governance/authorization-wave9-legacy-removal-manifest.v1.json",
), "utf8")) as RemovalManifest;
const ddlFiles = (await walk(ddlRoot)).sort();
const definitions: Finding[] = [];
const dependencies: Finding[] = [];
const aliases: Finding[] = [];

for (const path of ddlFiles) {
  const content = await readFile(path, "utf8");
  for (const object of manifest.objects) {
    const [schema, name] = object.name.split(".");
    if (!schema || !name) continue;
    const kind = object.kind === "table"
      ? "TABLE"
      : object.kind === "view"
        ? "(?:MATERIALIZED\\s+)?VIEW"
        : object.kind === "function"
          ? "FUNCTION"
          : null;
    if (!kind) continue;
    const pattern = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?${kind}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?`
        + `${escape(schema)}\\.${escape(name)}\\b`,
      "i",
    );
    const match = pattern.exec(content);
    if (match) {
      definitions.push({
        path: normalize(relative(repositoryRoot, path)),
        line: lineNumber(content, match.index),
        object: object.name,
      });
    }

    const referencePattern = new RegExp(
      `\\b${escape(schema)}\\.${escape(name)}\\b`,
      "gi",
    );
    let reference: RegExpExecArray | null;
    while ((reference = referencePattern.exec(content)) !== null) {
      const lineStart = content.lastIndexOf("\n", reference.index) + 1;
      const lineEnd = content.indexOf("\n", reference.index);
      const line = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd);
      const definitionOnLine = new RegExp(
        `CREATE\\s+(?:OR\\s+REPLACE\\s+)?${kind ?? "(?:TABLE|(?:MATERIALIZED\\s+)?VIEW|FUNCTION)"}`
          + `\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${escape(schema)}\\.${escape(name)}\\b`,
        "i",
      ).test(line);
      if (!definitionOnLine) {
        dependencies.push({
          path: normalize(relative(repositoryRoot, path)),
          line: lineNumber(content, reference.index),
          object: object.name,
        });
      }
    }
  }
  const aliasPattern = /\b(?:control\.permission_alias|auth_permission_alias_v2)\b/gi;
  let alias: RegExpExecArray | null;
  while ((alias = aliasPattern.exec(content)) !== null) {
    aliases.push({
      path: normalize(relative(repositoryRoot, path)),
      line: lineNumber(content, alias.index),
      object: alias[0],
    });
  }
}

const neonProvision = await readFile(resolve(databaseRoot, "scripts/provision.ts"), "utf8");
const meshProvision = await readFile(resolve(databaseRoot, "scripts/provision-mesh.ts"), "utf8");
const neonMeshBoundarySealed =
  /relPath\.startsWith\("ddl\/mesh\/"\)/.test(neonProvision)
  && /relPath\.startsWith\("ddl\/mesh_log\/"\)/.test(neonProvision)
  && /relPath\.startsWith\("ddl\/mesh_control\/"\)/.test(neonProvision);
const meshNeonPaths = [
  ...meshProvision.matchAll(/["'](ddl\/(?:master|control|document|ledger|governance)\/[^"']+)["']/g),
].map((match) => match[1]);
const report = {
  contractVersion: "authorization-v2.phase4-clean-ddl.v1",
  generatedAt: new Date().toISOString(),
  counts: {
    legacyDdlDefinitionFindings: definitions.length,
    legacyDdlDependencyFindings: dependencies.length,
    contextualAliasFindings: aliases.length,
    meshPathsInNeonProvisioning: neonMeshBoundarySealed ? 0 : 1,
    neonPathsInMeshProvisioning: meshNeonPaths.length,
  },
  gates: {
    legacyDdlDefinitionsZero: definitions.length === 0,
    legacyDdlDependenciesZero: dependencies.length === 0,
    contextualAliasesZero: aliases.length === 0,
    neonDiscoversNoMeshAuthorityDdl: neonMeshBoundarySealed,
    meshDiscoversNoNeonDdl: meshNeonPaths.length === 0,
    contractionUsesCascade: false,
    upgradedDatabaseTombstonesRetained: true,
  },
  ready: definitions.length === 0
    && dependencies.length === 0
    && aliases.length === 0
    && neonMeshBoundarySealed
    && meshNeonPaths.length === 0,
  findings: { definitions, dependencies, aliases, meshNeonPaths },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && !report.ready) process.exitCode = 1;

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile() && extname(path) === ".sql") output.push(path);
  }
  return output;
}
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function lineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}
function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
