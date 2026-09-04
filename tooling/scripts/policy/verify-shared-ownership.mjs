#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const sharedRoot = join(repoRoot, "packages", "shared");
const packageGroupsPath = join(sharedRoot, "package-groups.ts");
const allowedExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".md", ".mdx", ".sql", ".sql.d.ts", ".prisma", ".env", ".toml", ".css", ".scss", ".html", ".txt", ".tsx", ".ts"]);
const groupNames = new Set([
  "platform-auth",
  "data-integration",
  "ui-platform",
  "runtime-domain",
  "business-domain",
  "shared-infrastructure",
]);

const args = new Set(process.argv.slice(2));
const reportPath = args.has("--report") ? [...args].at([...args].indexOf("--report") + 1) : null;
const strictGroups = args.has("--strict");
const strictOnly = args.has("--strict-only");
const skipScan = args.has("--skip-scan");
const skipGroups = args.has("--skip-groups");

const violations = [];
const groupMembershipViolations = [];
const pathViolations = [];
const packageOwnershipMap = new Map();
const packageGroupsCatalog = new Map();

const driftReport = {
  generatedAtUtc: new Date().toISOString(),
  repoRoot: relative(repoRoot, sharedRoot).replace(/\\/gu, "/"),
  mode: strictGroups ? "strict" : "default",
  strictOnly,
  summary: {
    sharedPackagesDiscovered: 0,
    packageGroupsDiscovered: 0,
    pathReferencesScanned: 0,
    groupMembershipViolations: 0,
    pathViolations: 0,
  },
  violations: [],
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function ensureReportDirectory(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function pushGroupViolation(scope, detail, suggestion = null) {
  const violation = {
    type: "group-membership",
    scope,
    detail,
    suggestion,
  };
  violations.push(violation);
  groupMembershipViolations.push(violation);
}

function pushPathViolation(scope, detail, suggestion = null) {
  const violation = {
    type: "path-drift",
    scope,
    detail,
    suggestion,
  };
  violations.push(violation);
  pathViolations.push(violation);
}

function stripTypeAnnotations(text) {
  return text
    .replace(/export type\s+[\s\S]*?;\r?\n/gu, "")
    .replace(/export const\s+([A-Za-z0-9_]+)\s*:\s*[^=;]+?=\s*/gu, "export const $1 = ");
}

function extractAssignmentBlock(source, exportConstName) {
  const marker = `export const ${exportConstName}`;
  const start = source.indexOf(marker);
  if (start < 0) return "";

  const equals = source.indexOf("=", start);
  if (equals < 0) return "";

  let i = equals + 1;
  while (i < source.length && /\s/gu.test(source[i])) i++;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  const opening = source[i];
  if (opening !== "{" && opening !== "[") return "";

  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      if (depth > 0) {
        depth--;
        if (depth === 0) {
          return source.slice(equals + 1, i + 1).trim();
        }
      } else {
        return null;
      }
    }
  }

  return null;
}

function parseJsValue(value) {
  try {
    return Function(`return (${value});`)();
  } catch {
    return null;
  }
}

function loadSharedBusinessGroups() {
  const raw = readFileSync(packageGroupsPath, "utf8");
  const source = stripTypeAnnotations(raw);
  const groupsRaw = extractAssignmentBlock(source, "sharedBusinessGroups");
  const parsed = parseJsValue(groupsRaw);
  if (!parsed || typeof parsed !== "object") {
    fail("Unable to parse sharedBusinessGroups from packages/shared/package-groups.ts");
    process.exit(process.exitCode ?? 1);
  }
  return parsed;
}

function buildGroupCatalog(groups) {
  const catalog = new Set();
  for (const [group, packages] of Object.entries(groups)) {
    if (!Array.isArray(packages)) {
      pushGroupViolation("package-group-config", `[${group}] is not an array`);
      continue;
    }
    for (const pkg of packages) {
      const existing = packageGroupsCatalog.get(pkg);
      if (existing && existing !== group) {
        pushGroupViolation("package-group-config", `package "${pkg}" assigned to multiple groups: ${existing}, ${group}`);
      }
      packageGroupsCatalog.set(pkg, group);
      catalog.add(pkg);
      packageOwnershipMap.set(pkg, group);
    }
  }
  return [...catalog].sort((a, b) => a.localeCompare(b));
}

function walk(root, handler) {
  for (const name of readdirSync(root)) {
    if (name === ".git" || name === "node_modules" || name === ".turbo" || name === "dist" || name === ".next") {
      continue;
    }

    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, handler);
      continue;
    }

    if (!allowedExts.has(extname(full).toLowerCase())) continue;
    handler(full);
  }
}

function lineInfoForMatch(content, index) {
  const head = content.slice(0, index);
  const line = head.split(/\r?\n/).length;
  const lastNl = Math.max(head.lastIndexOf("\n"), head.lastIndexOf("\r"));
  const column = index - lastNl;
  return { line, column };
}

function scanForPathDrift(file) {
  const relativePath = toPosix(relative(repoRoot, file));
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (!text) return;

  const pathRegex = /packages[\\/](?:shared)[\\/][A-Za-z0-9_-]+(?:[\\/][^"'`\s\])>}]+)?/gu;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    driftReport.summary.pathReferencesScanned += 1;
    const matchText = match[0];
    const start = match.index;

    const afterShared = matchText.slice("packages/shared/".length);
    const tokens = afterShared.split(/[\\/]/).filter(Boolean);
    if (tokens.length === 0) continue;

    const first = tokens[0];
    const mappedGroup = packageOwnershipMap.get(first);
    if (mappedGroup) {
      const expectedPrefix = `packages/shared/${mappedGroup}/${first}`;
      if (!matchText.startsWith(expectedPrefix)) {
        const { line, column } = lineInfoForMatch(text, start);
        pushPathViolation(relativePath, {
          file: relativePath,
          line,
          column,
          importPath: matchText,
          canonicalPath: expectedPrefix,
        }, `packages/shared/${mappedGroup}/${first}`);
      }
      continue;
    }

    if (groupNames.has(first) && tokens.length > 1) {
      const pkg = tokens[1];
      const owningGroup = packageOwnershipMap.get(pkg);
      if (owningGroup && owningGroup !== first) {
        const { line, column } = lineInfoForMatch(text, start);
        pushPathViolation(relativePath, {
          file: relativePath,
          line,
          column,
          importPath: matchText,
          canonicalPath: `packages/shared/${owningGroup}/${pkg}`,
        }, `packages/shared/${owningGroup}/${pkg}`);
      }
    }
  }
}

if (!existsSync(sharedRoot)) {
  fail(`Shared root not found: ${toPosix(sharedRoot)}`);
  process.exit(process.exitCode ?? 1);
}

if (!existsSync(packageGroupsPath)) {
  fail(`Package group map not found: ${toPosix(packageGroupsPath)}`);
  process.exit(process.exitCode ?? 1);
}

const packageDirectories = [];
const topLevel = readdirSync(sharedRoot);
for (const top of topLevel) {
  if (top === "docs" || top === "policy" || top === "runtime") {
    continue;
  }
  const topPath = join(sharedRoot, top);
  if (!statSync(topPath).isDirectory()) {
    continue;
  }

  const topManifest = join(topPath, "package.json");
  if (existsSync(topManifest)) {
    packageDirectories.push(topPath);
    continue;
  }

  for (const child of readdirSync(topPath)) {
    const childPath = join(topPath, child);
    const childManifest = join(childPath, "package.json");
    if (statSync(childPath).isDirectory() && existsSync(childManifest)) {
      packageDirectories.push(childPath);
    }
  }
}

const packageEntries = packageDirectories.map((entry) => {
  const rel = relative(sharedRoot, entry);
  const normalized = rel.split(sep).join("/");
  return { path: entry, rel, name: normalized.split("/").pop() ?? normalized };
});
const packageNames = packageEntries.map((entry) => entry.name);
const discoveredPackages = new Set(packageNames);
driftReport.summary.sharedPackagesDiscovered = discoveredPackages.size;

if (!skipGroups) {
  const groups = loadSharedBusinessGroups();
  const catalog = buildGroupCatalog(groups);
  driftReport.summary.packageGroupsDiscovered = catalog.length;

  for (const pkg of packageEntries) {
    const owned = packageGroupsCatalog.get(pkg.name);
    if (!owned) {
      pushGroupViolation("shared-package-directory", `package "${pkg.name}" is not assigned to sharedBusinessGroups`);
    }
  }

  if (strictGroups && groupMembershipViolations.length > 0) {
    driftReport.summary.groupMembershipViolations = groupMembershipViolations.length;
    driftReport.summary.pathViolations = pathViolations.length;
    if (reportPath) {
      ensureReportDirectory(reportPath);
      writeFileSync(reportPath, `${JSON.stringify(driftReport, null, 2)}\n`);
      console.log(`Shared ownership report written: ${toPosix(reportPath)}`);
    }
    fail("Shared ownership group validation failed.");
    process.exit(1);
  }
}

if (!skipScan) {
  for (const pkg of packageEntries) {
    walk(pkg.path, scanForPathDrift);
  }
}

driftReport.summary.groupMembershipViolations = groupMembershipViolations.length;
driftReport.summary.pathViolations = pathViolations.length;
driftReport.violations = violations;

if (reportPath) {
  ensureReportDirectory(reportPath);
  driftReport.summary.packageGroupsDiscovered = packageGroupsCatalog.size;
  writeFileSync(reportPath, `${JSON.stringify(driftReport, null, 2)}\n`);
  console.log(`Shared ownership report written: ${toPosix(reportPath)}`);
}

if (violations.length > 0) {
  fail("Shared ownership strict check failed.");
  const firstTen = violations.slice(0, 20);
  console.log("Top shared ownership violations:");
  for (const violation of firstTen) {
    console.log(`- ${violation.type}: ${JSON.stringify(violation.detail)}`);
  }
  process.exit(1);
}

console.log("Shared ownership is aligned with strict grouping.");
process.exit(0);
