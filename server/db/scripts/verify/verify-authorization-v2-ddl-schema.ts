#!/usr/bin/env tsx

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface UserManifest {
  unmanagedKeycloakUsers: string;
  enabledSubjectCount: number;
  mappedSubjectCount: number;
  emptyScopeBehavior: string;
  subjectMappings: Record<string, {
    keycloakSubject: string;
    tenantCodes: string[];
    planes: Array<{
      group: { zeroGrant: boolean };
      scopedRoleAssignments: unknown[];
    }>;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const strict = process.argv.includes("--strict");
const scanRoots = [
  "server/src",
  "server/packages/services",
  "server/db/seed",
  "apps",
  "packages",
  "stack/config/iam",
].map((path) => resolve(repositoryRoot, path));
const files = (await Promise.all(scanRoots.map(walk))).flat().sort();
const findings: Array<{ path: string; line: number; match: string }> = [];
const forbidden = /\bpersona(?:s|_id|Id|_code|Code|_name|Name|_permission)?\b|principal_persona|persona_permission/gi;

for (const path of files) {
  const content = await readFile(path, "utf8");
  const scanned = extname(path) === ".json"
    ? content
    : stripCommentsPreservingLines(content);
  let match: RegExpExecArray | null;
  forbidden.lastIndex = 0;
  while ((match = forbidden.exec(scanned)) !== null) {
    findings.push({
      path: normalize(relative(repositoryRoot, path)),
      line: lineNumber(content, match.index),
      match: match[0],
    });
  }
}
function stripCommentsPreservingLines(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
}

const manifest = JSON.parse(await readFile(resolve(
  databaseRoot,
  "seed/contracts/authorization/authority/neon-admin/compiled/development-existing-user-group-manifest.v1.json",
), "utf8")) as UserManifest;
const mappings = Object.values(manifest.subjectMappings);
const mappingComplete =
  manifest.enabledSubjectCount === manifest.mappedSubjectCount
  && manifest.mappedSubjectCount === mappings.length
  && mappings.every((mapping) =>
    mapping.keycloakSubject
    && mapping.tenantCodes.length > 0
    && mapping.planes.length > 0
  );
const emptyScopeSafe = manifest.emptyScopeBehavior === "deny"
  && mappings.every((mapping) => mapping.planes.every((plane) =>
    plane.group.zeroGrant || plane.scopedRoleAssignments.length > 0
  ));
const unmanagedUsersPreserved = manifest.unmanagedKeycloakUsers === "unchanged";
const report = {
  contractVersion: "authorization-v2.phase3-gate.v1",
  generatedAt: new Date().toISOString(),
  counts: {
    activePersonaFindings: findings.length,
    enabledManagedSubjects: manifest.enabledSubjectCount,
    deliberatelyMappedSubjects: manifest.mappedSubjectCount,
  },
  gates: {
    activePersonaScanZero: findings.length === 0,
    everyEnabledManagedSubjectMapped: mappingComplete,
    unmanagedKeycloakUsersUnchanged: unmanagedUsersPreserved,
    emptyScopeNeverGrantsTenantWide: emptyScopeSafe,
  },
  ready: findings.length === 0
    && mappingComplete
    && unmanagedUsersPreserved
    && emptyScopeSafe,
  findings,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && !report.ready) process.exitCode = 1;

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
      || repoPath.includes("/product-deprecated/")
      || repoPath.includes("/__tests__/")
      || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repoPath)
    ) continue;
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (
      entry.isFile()
      && [".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".json"].includes(extname(path))
    ) output.push(path);
  }
  return output;
}
function lineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}
function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
