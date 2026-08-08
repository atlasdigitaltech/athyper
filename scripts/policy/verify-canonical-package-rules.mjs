#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const ignored = new Set(["node_modules", ".next", "dist", ".turbo", ".cache", ".git"]);
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const violations = [];

const posix = (value) => value.replaceAll("\\", "/");
const rel = (value) => posix(relative(root, value));
const inside = (file, directory) => {
  const result = relative(directory, file);
  return result === "" || (!result.startsWith("..") && !result.startsWith("/"));
};
const packageBoundary = (path) => {
  const normalized = posix(path);
  if (normalized.startsWith("packages/shared/")) return { kind: "shared", product: null };
  const product = normalized.match(/^packages\/product\/([^/]+)/)?.[1];
  if (product) return { kind: "product", product };
  const appPackage = normalized.match(/^packages\/apps\/([^/]+)/)?.[1];
  if (appPackage) return { kind: "app", product: appPackage };
  const app = normalized.match(/^apps\/([^/]+)/)?.[1];
  if (app) return { kind: "app", product: app };
  if (normalized.startsWith("server/")) return { kind: "server", product: null };
  if (normalized.startsWith("packages/product-deprecated/")) return { kind: "deprecated", product: null };
  return { kind: "other", product: null };
};

function* walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (sourceExtensions.has(extname(entry.name))) yield path;
  }
}

function importSpecifiers(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const result = [];
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\b(?:vi|jest)\.mock\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(withoutComments)) !== null) result.push(match[1]);
  }
  return result;
}

function resolveImport(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const manifestFiles = [...walk(root)].filter((file) => file.endsWith("package.json"));
const packages = [];
for (const manifestFile of manifestFiles) {
  const directory = dirname(manifestFile);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (typeof manifest.name !== "string") continue;
  packages.push({ name: manifest.name, directory, manifest, boundary: packageBoundary(rel(directory)) });
}

const byName = new Map();
for (const item of packages) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);

let activeDirectories = new Set();
try {
  const output = process.platform === "win32"
    ? execFileSync("powershell.exe", ["-NoProfile", "-Command", "pnpm list -r --depth -1 --json"], { cwd: root, encoding: "utf8" })
    : execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], { cwd: root, encoding: "utf8" });
  activeDirectories = new Set(JSON.parse(output).map((item) => posix(relative(root, item.path))));
} catch {
  violations.push("Unable to resolve active pnpm workspace packages.");
}

for (const [name, items] of byName) {
  const active = items.filter((item) => activeDirectories.has(posix(relative(root, item.directory))));
  if (active.length > 1) {
    violations.push(`Competing active implementations for ${name}: ${active.map((item) => rel(item.directory)).join(", ")}`);
  }
}

const packageByDirectory = packages.slice().sort((a, b) => b.directory.length - a.directory.length);
function owningPackage(file) {
  return packageByDirectory.find((item) => inside(file, item.directory));
}

function checkDependency(owner, dependency, source) {
  const allTargets = byName.get(dependency) ?? [];
  const activeTargets = allTargets.filter((target) => activeDirectories.has(posix(relative(root, target.directory))));
  const targets = activeTargets.length > 0 ? activeTargets : allTargets;
  for (const target of targets) {
    const from = owner.boundary;
    const to = target.boundary;
    if (from.kind === "shared" && ["app", "product", "deprecated"].includes(to.kind)) {
      violations.push(`${source}: shared package ${owner.name} depends on non-shared package ${dependency}`);
    }
    if (from.kind === "product" && to.kind !== "shared" && to.kind !== "other") {
      violations.push(`${source}: product package ${owner.name} depends on ${dependency}; product packages may depend only on shared packages`);
    }
    if (from.kind === "app" && to.kind === "product" && from.product !== to.product) {
      violations.push(`${source}: ${from.product} application imports ${to.product} product package ${dependency}`);
    }
    if (from.kind === "server" && (to.kind === "app" || to.kind === "deprecated" || posix(rel(target.directory)).includes("packages/shared/ui-platform/"))) {
      violations.push(`${source}: server package depends on UI/application package ${dependency}`);
    }
    if (from.kind === "shared" && owner.name.match(/(api-contracts|runtime-contracts|mesh-exchange-contracts|metadata-client)/)
      && ["app", "product", "deprecated"].includes(to.kind)) {
      violations.push(`${source}: shared contract package contains product-specific dependency ${dependency}`);
    }
  }
}

for (const item of packages) {
  const source = rel(join(item.directory, "package.json"));
  for (const section of dependencySections) {
    for (const dependency of Object.keys(item.manifest[section] ?? {})) {
      if (byName.has(dependency)) checkDependency(item, dependency, `${source} (${section})`);
    }
  }
  for (const file of walk(item.directory)) {
    const content = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(content)) {
      const targetFile = resolveImport(file, specifier);
      if (targetFile) {
        const targetPackage = owningPackage(targetFile);
        if (targetPackage) checkDependency(item, targetPackage.name, rel(file));
      } else if (specifier.startsWith("@athyper/")) {
        const targetName = specifier.split("/").slice(0, 2).join("/");
        if (byName.has(targetName)) checkDependency(item, targetName, rel(file));
      }
    }
  }
}

for (const scanRoot of ["apps", "packages", "server"]) {
  const absoluteRoot = join(root, scanRoot);
  for (const directory of walkDirectories(absoluteRoot)) {
    if (ignored.has(directory.split(/[\\/]/).pop())) continue;
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || realpathSync(directory) !== resolve(directory)) {
      violations.push(`Source junction/symlink is not allowed: ${rel(directory)} -> ${rel(realpathSync(directory))}`);
    }
  }
}

function* walkDirectories(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield path;
      yield* walkDirectories(path);
    }
  }
}

if (violations.length > 0) {
  console.error(["Canonical package rule violations:", ...[...new Set(violations)].map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
} else {
  console.log(`Canonical package rules verified (${packages.length} package manifests).`);
}
