/**
 * Plan v5 amendment 10 Ã¢â‚¬â€ content-ui import + dependency boundary check.
 *
 * Enforces the rule from cleanup plan v5 Ã‚Â§3:
 *
 *   content-ui (and its document-components/ subtree) is PRESENTATIONAL.
 *   It MUST NOT import:
 *     Ã¢â‚¬Â¢ @athyper/runtime-canvas      (orchestration; one-way dep)
 *     Ã¢â‚¬Â¢ @athyper/runtime-contracts   (descriptor contract types)
 *     Ã¢â‚¬Â¢ @tanstack/react-query        (queries/mutations live in runtime-canvas)
 *
 *   content-ui MAY import @athyper/api-contracts (types) and the usual peers
 *   (@athyper/platform-theme, @athyper/ui, lucide-react, react).
 *
 * Two checks:
 *   1. package.json Ã¢â‚¬â€ content-ui's dependencies/peerDependencies/devDependencies
 *      must not list any forbidden code package.
 *   2. Source scan Ã¢â‚¬â€ content-ui/src/** files must not `from "@athyper/runtime-canvas"`
 *      or similar.
 *
 * Run via:  pnpm policy:content-ui-boundaries
 *           (also rolled up into `pnpm policy`)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repoRoot = process.cwd();
const contentUiRoot = join(repoRoot, "packages", "shared", "content-ui");

// Ã¢â€â‚¬Ã¢â€â‚¬ Forbidden imports Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const forbiddenImports = [
  {
    pattern: /from\s+["']@athyper\/runtime-canvas(\/[^"']+)?["']/,
    label:   "@athyper/runtime-canvas",
    why:     "content-ui is presentational; runtime-canvas owns orchestration. One-way dep.",
  },
  {
    pattern: /from\s+["']@athyper\/runtime-contracts(\/[^"']+)?["']/,
    label:   "@athyper/runtime-contracts",
    why:     "content-ui must not depend on descriptor contracts.",
  },
  {
    pattern: /from\s+["']@tanstack\/react-query["']/,
    label:   "@tanstack/react-query",
    why:     "useQuery / useMutation belong in runtime-canvas/document-runtime/.",
  },
];

const forbiddenDeps = new Set([
  "@athyper/runtime-canvas",
  "@athyper/runtime-contracts",
  "@tanstack/react-query",
]);

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirectories = new Set(["node_modules", ".next", "dist", ".turbo", ".cache", "coverage", "__tests__"]);

// Ã¢â€â‚¬Ã¢â€â‚¬ Walk + check Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function walkSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirectories.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (sourceExtensions.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function checkSourceImports() {
  const violations = [];
  const srcDir = join(contentUiRoot, "src");
  for (const file of walkSourceFiles(srcDir)) {
    const text = readFileSync(file, "utf8");
    for (const rule of forbiddenImports) {
      const match = text.match(rule.pattern);
      if (match) {
        const lineNumber = text.slice(0, match.index ?? 0).split("\n").length;
        violations.push({
          file:        relative(repoRoot, file).replaceAll("\\", "/"),
          line:        lineNumber,
          forbidden:   rule.label,
          rule:        rule.why,
          excerpt:     match[0],
        });
      }
    }
  }
  return violations;
}

function checkPackageJsonDeps() {
  const pkgPath = join(contentUiRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const violations = [];
  for (const section of ["dependencies", "peerDependencies", "devDependencies"]) {
    const deps = pkg[section] ?? {};
    for (const name of Object.keys(deps)) {
      if (forbiddenDeps.has(name)) {
        violations.push({
          file:       relative(repoRoot, pkgPath).replaceAll("\\", "/"),
          section,
          forbidden:  name,
          rule:       "content-ui must not list this package as a dependency.",
        });
      }
    }
  }
  return violations;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Report Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const importViolations = checkSourceImports();
const depViolations = checkPackageJsonDeps();

if (importViolations.length === 0 && depViolations.length === 0) {
  console.log("[verify-content-ui-boundaries] OK");
  console.log("  Ã¢â‚¬Â¢ content-ui sources scanned: no forbidden imports");
  console.log("  Ã¢â‚¬Â¢ content-ui package.json: no forbidden deps");
  process.exit(0);
}

console.error("[verify-content-ui-boundaries] FAILED");
console.error("");

if (importViolations.length > 0) {
  console.error(`Forbidden imports (${importViolations.length}):`);
  for (const v of importViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    imports: ${v.forbidden}`);
    console.error(`    rule:    ${v.rule}`);
  }
  console.error("");
}

if (depViolations.length > 0) {
  console.error(`Forbidden package.json dependencies (${depViolations.length}):`);
  for (const v of depViolations) {
    console.error(`  ${v.file} > ${v.section}`);
    console.error(`    forbidden: ${v.forbidden}`);
    console.error(`    rule:      ${v.rule}`);
  }
  console.error("");
}

console.error("See packages/shared/ui-platform/content-ui plan v5 Ã‚Â§3 (Package boundaries).");
process.exit(1);
