import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

export const BACKUP_ROOTS = Object.freeze(["apps-backup", "packages-backup", "server-backup"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED = new Set(["node_modules", ".next", "dist", ".turbo", ".git", "coverage"]);
const SPECIFIER_PATTERNS = [
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
  /(?:import\s*\(|require\s*\()\s*["']([^"']+)["']/g,
];

export function importSpecifiers(source) {
  const result = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) result.push(match[1]);
  }
  return result;
}

export function referencesBackupRoot(specifier) {
  const normalized = specifier.replaceAll("\\", "/");
  return BACKUP_ROOTS.some((root) => normalized === root
    || normalized.startsWith(`${root}/`)
    || normalized.includes(`/${root}/`)
    || normalized.endsWith(`/${root}`));
}

export function packageDependencyCounts(manifest) {
  const runtime = { ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}) };
  return {
    runtime: Object.keys(runtime).length,
    workspace: Object.values(runtime).filter((value) => typeof value === "string" && value.startsWith("workspace:")).length,
  };
}

function* walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) yield path;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

export function verifyFrontendSpine(root) {
  const violations = [];
  const governancePath = join(root, "governance", "config", "governance", "frontend-spine-packages.json");
  const governance = readJson(governancePath);
  const seenPaths = new Set();
  const seenNames = new Set();

  for (const entry of governance.packages) {
    if (seenPaths.has(entry.path)) violations.push(`Duplicate spine path: ${entry.path}`);
    if (seenNames.has(entry.name)) violations.push(`Duplicate spine package name: ${entry.name}`);
    seenPaths.add(entry.path);
    seenNames.add(entry.name);
    const manifestPath = join(root, entry.path, "package.json");
    if (!existsSync(manifestPath)) { violations.push(`Missing spine package manifest: ${entry.path}`); continue; }
    const manifest = readJson(manifestPath);
    if (manifest.name !== entry.name) violations.push(`${entry.path}: expected package name ${entry.name}, found ${manifest.name ?? "<missing>"}`);
    const counts = packageDependencyCounts(manifest);
    if (counts.runtime > entry.dependencyBudget.runtime) violations.push(`${entry.path}: runtime dependencies ${counts.runtime} exceed budget ${entry.dependencyBudget.runtime}`);
    if (counts.workspace > entry.dependencyBudget.workspace) violations.push(`${entry.path}: workspace runtime dependencies ${counts.workspace} exceed budget ${entry.dependencyBudget.workspace}`);
  }

  const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").replaceAll("\\", "/");
  for (const backupRoot of BACKUP_ROOTS) {
    if (workspace.split(/\r?\n/).some((line) => /^\s*-\s*["']?/.test(line) && line.includes(backupRoot))) {
      violations.push(`Backup root is included by pnpm workspace: ${backupRoot}`);
    }
  }

  for (const scanRoot of ["apps", "packages", "server", "tooling", "tests"]) {
    for (const file of walk(join(root, scanRoot))) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (referencesBackupRoot(specifier)) violations.push(`${relative(root, file).replaceAll("\\", "/")}: imports reference tree ${specifier}`);
      }
    }
  }

  const forbiddenContractImports = /^(?:node:|react(?:\/|$)|react-dom(?:\/|$)|next(?:\/|$)|@prisma\/|kysely$|pg$|@athyper\/server-)/;
  for (const entry of governance.packages.filter((item) => item.classification === "Shared contract")) {
    const manifest = readJson(join(root, entry.path, "package.json"));
    if (Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}), ...(manifest.peerDependencies ?? {}) }).length > 0) {
      violations.push(`${entry.path}: contract package must have no runtime or peer dependencies`);
    }
    for (const file of walk(join(root, entry.path, "src"))) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        if (forbiddenContractImports.test(specifier)) violations.push(`${relative(root, file).replaceAll("\\", "/")}: forbidden contract import ${specifier}`);
      }
    }
  }

  for (const packagePath of ["packages/platform/iam/auth-bff", "packages/platform/iam/session-store"]) {
    const exports = readJson(join(root, packagePath, "package.json")).exports?.["."];
    if (!exports || typeof exports !== "object" || exports.node !== "./src/index.ts" || exports.browser !== "./src/browser-denied.ts") {
      violations.push(`${packagePath}: server-only conditional exports are not explicit`);
    }
  }
  const identityExports = readJson(join(root, "packages/platform/iam/identity-gate/package.json")).exports?.["."];
  if (!identityExports || typeof identityExports !== "object" || identityExports.browser !== "./src/index.tsx") {
    violations.push("packages/platform/iam/identity-gate: browser-safe conditional export is missing");
  }

  return violations;
}

export function repositoryRoot(metaUrl) {
  return resolve(new URL("../../..", metaUrl).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
}
