#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sharedRoot = join(repoRoot, "packages", "shared");
const ignoredDirs = new Set(["node_modules", ".turbo", ".vite", "dist", ".next", ".git", "docs"]);

const args = process.argv.slice(2);
const strictMode = args.includes("--strict") || args.includes("--legacy");
const legacyMode = args.includes("--legacy");
const strictGroupingMode = args.includes("--strict-group");

const reportIdx = args.indexOf("--report");
const defaultReportPath = join(sharedRoot, "..", "policy", "reports", "shared-legacy-audit.json");
const reportPath = args.includes("--report") ? (args[reportIdx + 1] ?? defaultReportPath) : legacyMode ? defaultReportPath : null;

const groupReportIdx = args.indexOf("--group-report");
const defaultGroupReportPath = join(sharedRoot, "..", "policy", "reports", "shared-grouping-audit.json");
const groupReportPath = groupReportIdx >= 0
  ? (args[groupReportIdx + 1] ?? defaultGroupReportPath)
  : strictGroupingMode
    ? defaultGroupReportPath
    : null;

const violations = [];
const tsExts = new Set([".ts", ".tsx"]);
const tsxReadThreshold = 6_000_000;
const packageGroupsPath = join(sharedRoot, "package-groups.ts");
const GROUP_VALIDATION = args.includes("--no-group-validation") ? false : true;

const groupDiff = {
  generatedAtUtc: new Date().toISOString(),
  mode: strictGroupingMode ? "strict-grouping" : "grouping",
  sharedRoot: null,
  packagesDiscovered: 0,
  packageGroups: {
    sharedPackageCatalog: {
      missingInCatalog: [],
      extraInCatalog: [],
    },
    sharedPackageGroups: {
      missingGroup: [],
      multiGroup: [],
      staleEntries: [],
    },
    sharedBusinessGroups: {
      missingGroup: [],
      multiGroup: [],
      staleEntries: [],
    },
  },
};

function toPosix(value) {
  return value.split(sep).join("/");
}

function ensureReportDirectory(path) {
  const normalized = path.split("/").join(sep).split("\\").join(sep);
  const lastSlash = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (lastSlash >= 0) {
    mkdirSync(normalized.slice(0, lastSlash), { recursive: true });
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function addViolation(path, reason, suggestion = null, scope = "naming", groupingType = null, groupName = null) {
  violations.push({ path, reason, suggestion, scope, groupingType, groupName });
}

function stripValueTypes(text) {
  return text.replace(/\s*:\s*[^=]+(?==)/g, " ");
}

function extractAssignmentBlock(source, exportConstName) {
  const marker = `export const ${exportConstName}`;
  const start = source.indexOf(marker);
  if (start < 0) {
    return "";
  }

  const equals = source.indexOf("=", start);
  if (equals < 0) {
    return "";
  }

  let i = equals + 1;
  while (i < source.length && /\s/.test(source[i])) i++;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escape = false;

  for (; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      if (depth > 0) depth--;
      else return null;

      if (depth === 0) {
        return source.slice(equals + 1, i + 1).trim();
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

function loadSharedGroupConfig() {
  const raw = readFileSync(packageGroupsPath, "utf8");
  const source = stripValueTypes(raw);
  const legacyGroupsRaw = extractAssignmentBlock(source, "sharedPackageGroups");
  const businessGroupsRaw = extractAssignmentBlock(source, "sharedBusinessGroups");
  const catalogRaw = extractAssignmentBlock(source, "sharedPackageCatalog");

  const legacyGroups = parseJsValue(legacyGroupsRaw) ?? {};
  const businessGroups = parseJsValue(businessGroupsRaw) ?? {};
  const catalog = parseJsValue(catalogRaw) ?? [];

  return { legacyGroups, businessGroups, catalog };
}

function ensureCanonicalGrouping(groupedPackages, mapName, allPackages, diffSection) {
  const assigned = new Map();

  for (const [groupName, values] of Object.entries(groupedPackages)) {
    for (const pkg of values) {
      if (!assigned.has(pkg)) assigned.set(pkg, []);
      assigned.get(pkg).push(groupName);
    }
  }

  for (const packageName of allPackages) {
    const groups = assigned.get(packageName) ?? [];
    if (groups.length === 0) {
      addViolation(packageName, `[${mapName}] package does not belong to any group`, "Assign package to exactly one canonical group", "grouping", "missing", mapName);
      diffSection.missingGroup.push({ packageName, details: "no group assignment" });
    } else if (groups.length > 1) {
      addViolation(packageName, `[${mapName}] package assigned to ${groups.length} groups (${groups.join(", ")})`, null, "grouping", "multiple", mapName);
      diffSection.multiGroup.push({ packageName, groups });
    }
  }

  for (const pkg of Object.keys(groupedPackages).flatMap((g) => groupedPackages[g] ?? [])) {
    if (!allPackages.has(pkg)) {
      addViolation(pkg, `[${mapName}] group references package that no longer exists under packages/shared`, "Remove stale package from group map", "grouping", "stale", mapName);
      diffSection.staleEntries.push({ packageName: pkg, map: mapName });
    }
  }
}

function ensureCatalogCoverage(catalog, allPackages) {
  const listed = new Set(catalog);

  for (const packageName of allPackages) {
    if (!listed.has(packageName)) {
      addViolation(packageName, "Package missing from sharedPackageCatalog", "Add package name to sharedPackageCatalog", "grouping", "catalog-missing", "sharedPackageCatalog");
      groupDiff.packageGroups.sharedPackageCatalog.missingInCatalog.push(packageName);
    }
  }

  for (const packageName of listed) {
    if (!allPackages.has(packageName)) {
      addViolation(packageName, "sharedPackageCatalog contains non-existent package", "Remove stale catalog entry", "grouping", "catalog-extra", "sharedPackageCatalog");
      groupDiff.packageGroups.sharedPackageCatalog.extraInCatalog.push(packageName);
    }
  }
}

function isKebabName(name) {
  return /^[a-z][a-z0-9-]*$/u.test(name);
}

function isPascalName(name) {
  return /^[A-Z][a-zA-Z0-9]*$/u.test(name);
}

function toPascalSuggestion(name) {
  return name
    .replace(/[-_\s]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join("");
}

function toKebabSuggestion(name) {
  return name
    .replace(/[-_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase();
}

function addTestSuffix(name) {
  if (/\.spec\.(ts|tsx)$/.test(name)) return name.replace(/\.spec\.(ts|tsx)$/, ".test.$1");
  return name.replace(/\.(ts|tsx)$/, ".test.$1");
}

function stripTsExt(name) {
  return name.endsWith(".tsx") ? name.slice(0, -4) : name.endsWith(".ts") ? name.slice(0, -3) : name;
}

function isLikelyComponent(_filePath, content) {
  const hasJsx = /<([A-Za-z][A-Za-z0-9]*)\b/.test(content);
  const hasComponentType = /\b(React\.)?(memo|forwardRef|lazy|suspense)\b/i.test(content);
  const hasReactComponentShape = /export\s+(?:default\s+)?(?:const|function)\s+[A-Z][A-Za-z0-9]*\s*[:=]?\s*[\s\S]{0,80}=>\s*\(?/.test(content);
  const hasClassComponent = /class\s+[A-Z][A-Za-z0-9]*\s+extends\s+React\.Component/.test(content);
  return hasJsx || hasComponentType || hasReactComponentShape || hasClassComponent;
}

function* walk(root) {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (tsExts.has(extname(full))) yield full;
  }
}

function writeGroupingReport(path) {
  groupDiff.sharedRoot = toPosix(relative(repoRoot, sharedRoot));
  ensureReportDirectory(path);
  writeFileSync(path, `${JSON.stringify(groupDiff, null, 2)}\n`);
  console.log(`Shared grouping report written: ${toPosix(path)}`);
}

function writeLegacyReport(path) {
  ensureReportDirectory(path);
  const reportPayload = {
    strictMode,
    legacyMode,
    sharedRoot: toPosix(relative(repoRoot, sharedRoot)),
    generatedAtUtc: new Date().toISOString(),
    totalViolations: violations.length,
    violations,
  };
  writeFileSync(path, `${JSON.stringify(reportPayload, null, 2)}\n`);
  console.log(`Legacy audit report written: ${toPosix(path)}`);
}

if (!existsSync(sharedRoot)) {
  fail("Shared root not found. Expected packages/shared.");
  process.exit(process.exitCode ?? 1);
}
if (!existsSync(packageGroupsPath)) {
  fail("Shared package group map not found. Expected packages/shared/package-groups.ts.");
  process.exit(process.exitCode ?? 1);
}

const allPackageEntries = readdirSync(sharedRoot)
  .filter((name) => !ignoredDirs.has(name))
  .filter((name) => statSync(join(sharedRoot, name)).isDirectory());
const sharedPackageFolders = new Set(allPackageEntries);
groupDiff.packagesDiscovered = sharedPackageFolders.size;

if (GROUP_VALIDATION) {
  const { legacyGroups, businessGroups, catalog } = loadSharedGroupConfig();
  ensureCatalogCoverage(catalog, sharedPackageFolders);
  ensureCanonicalGrouping(legacyGroups, "sharedPackageGroups", sharedPackageFolders, groupDiff.packageGroups.sharedPackageGroups);
  ensureCanonicalGrouping(businessGroups, "sharedBusinessGroups", sharedPackageFolders, groupDiff.packageGroups.sharedBusinessGroups);
}

if (groupReportPath) {
  writeGroupingReport(groupReportPath);
}

for (const pkgDir of allPackageEntries) {
  const pkgPath = join(sharedRoot, pkgDir);
  if (!isKebabName(pkgDir)) {
    addViolation(pkgDir, "Package folder should follow kebab-case");
  }

  for (const file of walk(pkgPath)) {
    const rel = toPosix(relative(sharedRoot, file));
    const name = file.split(sep).pop();
    const ext = extname(file);
    const base = stripTsExt(name);
    const isTestFile = /\/__tests__\//u.test(`/${rel}/`) || rel.includes("__tests__/");

    if (isTestFile && (name === ".DS_Store" || name.startsWith("."))) {
      continue;
    }

    if (isTestFile) {
      if (!/\.test\.(ts|tsx)$/u.test(name)) {
        addViolation(rel, "Use *.test.ts or *.test.tsx for files inside __tests__", addTestSuffix(name));
      }
      if (name.startsWith("_")) {
        addViolation(rel, "Avoid leading underscore prefixes in test files", `_${name}`.replace(/^_+/, ""));
      }
      continue;
    }

    if (name.startsWith("_")) {
      addViolation(rel, "Avoid leading underscore prefixes", name.replace(/^_+/, ""));
      continue;
    }

    if (/[ _]/u.test(name)) {
      addViolation(rel, "Avoid spaces/underscores in source filenames", `${toKebabSuggestion(base)}${ext}`);
      continue;
    }

    if (ext === ".ts") {
      if (base === "index" || isKebabName(base)) continue;
      addViolation(rel, "TypeScript source filenames should be kebab-case", `${toKebabSuggestion(base)}.ts`);
      continue;
    }

    if (ext === ".tsx") {
      if (base === "index") continue;

      let content = "";
      try {
        if (statSync(file).size <= tsxReadThreshold) {
          content = readFileSync(file, "utf8");
        }
      } catch {
        content = "";
      }

      if (strictMode) {
        if (isLikelyComponent(file, content)) {
          if (!isPascalName(base)) {
            const suggestion = `${toPascalSuggestion(base)}${ext}`;
            addViolation(rel, "React component files in strict mode should be PascalCase", suggestion);
          }
          continue;
        }

        if (!isKebabName(base)) {
          addViolation(rel, "Non-component TSX filenames in strict mode should be kebab-case", `${toKebabSuggestion(base)}${ext}`);
          continue;
        }
      } else if (name.includes("-") || /[A-Z]/.test(name)) {
        continue;
      }
    }
  }
}

if (reportPath) {
  writeLegacyReport(reportPath);
}

if (violations.length === 0) {
  console.log("Shared naming conventions verified.");
  process.exit(0);
}

const grouped = violations.map((violation, idx) => {
  const suggestion = violation.suggestion ? ` -> rename to ${violation.suggestion}` : "";
  return `${idx + 1}. ${violation.path}\n   - ${violation.reason}${suggestion}`;
});

fail(["Shared naming convention violations:", ...grouped].join("\n"));
process.exit(1);
