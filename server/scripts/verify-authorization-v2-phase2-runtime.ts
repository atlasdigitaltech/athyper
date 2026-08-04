#!/usr/bin/env tsx

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

type Category =
  | "legacy_authority"
  | "permission_inference"
  | "plane_database_fallback"
  | "local_shadow_routing";

interface Finding {
  category: Category;
  path: string;
  line: number;
  match: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(serverRoot, "..");
const strict = process.argv.includes("--strict");

const patterns: ReadonlyArray<{ category: Category; pattern: RegExp }> = [
  {
    category: "legacy_authority",
    pattern: /\b(?:shared\.(?:persona|persona_permission|role|permission|permission_category|permission_scope_policy)|master\.(?:principal_persona|access_grant|company_code_access|group_feature_grant|principal_feature_grant|tenant_admin_grant|delegation_grant|attachment_acl|content_item_access_grant|business_network(?:_membership(?:_role)?)?)|mesh\.(?:account_grant|attachment_acl|content_item_access_grant))\b/gi,
  },
  {
    category: "permission_inference",
    pattern: /(?:permission(?:_code|Code)?|operation(?:_code|Code)?)(?:\s*\.\s*(?:toLowerCase|toUpperCase)\s*\(\s*\))*\s*\.(?:endsWith|startsWith|includes|split|substring|slice)\s*\(|(?:endsWith|startsWith)\s*\(\s*["'`](?:\.|:|\/)?(?:read|write|create|update|delete|manage|approve|post|share|export)["'`]/gi,
  },
  {
    category: "plane_database_fallback",
    pattern: /meshDb\s*(?:\?\?|\|\|)\s*(?:db|deps\.db)|deriveLocalMeshDatabaseUrl/gi,
  },
  {
    category: "local_shadow_routing",
    pattern: /AUTHORIZATION_(?:DECISION_)?MODE\s*=\s*["'`](?:legacy|shadow)["'`]|authorizationMode\s*:\s*["'`](?:legacy|shadow)["'`]/gi,
  },
];

const roots = [
  resolve(serverRoot, "src"),
  resolve(serverRoot, "packages", "services"),
];
const files = (await Promise.all(roots.map(walk))).flat().sort();
const findings: Finding[] = [];

for (const path of files) {
  const content = await readFile(path, "utf8");
  const executableContent = stripCommentsPreservingLines(content);
  for (const { category, pattern } of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(executableContent)) !== null) {
      findings.push({
        category,
        path: normalize(relative(repositoryRoot, path)),
        line: lineNumber(content, match.index),
        match: match[0].replace(/\s+/g, " ").slice(0, 180),
      });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
}

function stripCommentsPreservingLines(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
}

const counts = Object.fromEntries(
  patterns.map(({ category }) => [
    category,
    findings.filter((finding) => finding.category === category).length,
  ]),
) as Record<Category, number>;
const report = {
  contractVersion: "authorization-v2.phase2-runtime-gate.v1",
  generatedAt: new Date().toISOString(),
  roots: roots.map((root) => normalize(relative(repositoryRoot, root))),
  counts,
  totalFindings: findings.length,
  ready: findings.length === 0,
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
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    const repoPath = normalize(relative(repositoryRoot, path));
    if (
      repoPath.includes("/node_modules/")
      || repoPath.includes("/dist/")
      || repoPath.includes("/__tests__/")
      || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repoPath)
    ) continue;
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile() && [".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(extname(path))) {
      output.push(path);
    }
  }
  return output;
}

function lineNumber(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
