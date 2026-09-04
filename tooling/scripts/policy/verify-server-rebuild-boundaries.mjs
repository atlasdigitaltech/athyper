#!/usr/bin/env node
import { builtinModules } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const IGNORED_SEGMENTS = new Set(["node_modules", "dist", ".turbo", "coverage", "__tests__", "fixtures"]);
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const SERVER_PREFIX = "@athyper/server-";
const ROOT_ORCHESTRATOR = "@athyper/server-workspace";
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function posix(value) { return value.split(sep).join("/"); }
function inside(child, parent) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function segments(path) { return posix(path).split("/"); }
function ignored(path) { return segments(path).some((part) => IGNORED_SEGMENTS.has(part)); }

function* walk(root, includePackageJson = false) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (!IGNORED_SEGMENTS.has(entry)) yield* walk(absolute, includePackageJson);
      continue;
    }
    if (includePackageJson && entry === "package.json") yield absolute;
    const dot = entry.lastIndexOf(".");
    if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.slice(dot))) yield absolute;
  }
}

function discoverPackages(repoRoot) {
  const serverRoot = join(repoRoot, "server");
  const manifests = [join(serverRoot, "package.json")];
  for (const searchRoot of [join(serverRoot, "apps"), join(serverRoot, "packages"), join(serverRoot, "db")]) {
    for (const path of walk(searchRoot, true)) {
      if (path.endsWith(`${sep}package.json`) && !ignored(relative(serverRoot, path))) manifests.push(path);
    }
  }
  return [...new Set(manifests.filter(existsSync))].map((manifestPath) => {
    const manifest = readJson(manifestPath);
    return { manifestPath, root: dirname(manifestPath), manifest, name: manifest.name };
  });
}

function imports(source) {
  const values = [];
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\b(?:vi|jest)\.mock\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) values.push(match[1]);
  return values;
}

function dependencyNames(manifest) {
  const names = new Set();
  for (const section of DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(manifest[section] ?? {})) names.add(name);
  }
  return names;
}

function layer(pkg, repoRoot) {
  const path = posix(relative(join(repoRoot, "server"), pkg.root));
  if (path === "package.json" || pkg.name === ROOT_ORCHESTRATOR) return "orchestrator";
  if (path.startsWith("apps/platform-host")) return "host";
  if (path === "packages/foundation") return "foundation";
  for (const value of ["contracts", "adapters", "runtime", "platform", "services", "planes"]) {
    if (path.startsWith(`packages/${value}/`)) return value;
  }
  if (path === "packages/test-utils") return "test-utils";
  if (path === "db") return "db";
  return "unknown";
}

const RANK = new Map([
  ["foundation", 0], ["contracts", 1], ["adapters", 2], ["runtime", 2],
  ["platform", 3], ["services", 3], ["planes", 3], ["test-utils", 3],
  ["db", 3], ["host", 4], ["orchestrator", 5],
]);

function packageForFile(path, packages) {
  return packages.filter((pkg) => inside(path, pkg.root)).sort((a, b) => b.root.length - a.root.length)[0];
}

function packageForSpecifier(specifier, packages) {
  return packages.filter((pkg) => typeof pkg.name === "string"
    && (specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

function exportedSubpaths(manifest) {
  if (typeof manifest.exports === "string") return new Set(["."]);
  return new Set(Object.keys(manifest.exports ?? {}));
}

function externalPackage(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function add(violations, code, message) { violations.push({ code, message }); }

export function analyzeServerRebuild(repoRoot) {
  const root = resolve(repoRoot);
  const serverRoot = join(root, "server");
  const packages = discoverPackages(root);
  const violations = [];
  const byName = new Map();

  for (const pkg of packages) {
    const rel = posix(relative(root, pkg.manifestPath));
    if (typeof pkg.name !== "string" || !pkg.name.startsWith(SERVER_PREFIX)) {
      add(violations, "PACKAGE_NAME", `${rel} must use an ${SERVER_PREFIX}* name`);
      continue;
    }
    if (byName.has(pkg.name)) add(violations, "DUPLICATE_PACKAGE", `${pkg.name} is declared by ${byName.get(pkg.name)} and ${rel}`);
    else byName.set(pkg.name, rel);
  }

  const orchestrator = packages.find((pkg) => pkg.root === serverRoot);
  if (!orchestrator || orchestrator.name !== ROOT_ORCHESTRATOR || orchestrator.manifest.private !== true
    || orchestrator.manifest.exports !== undefined || orchestrator.manifest.dependencies !== undefined) {
    add(violations, "ROOT_ORCHESTRATOR", "server/package.json must be private @athyper/server-workspace with no exports or runtime dependencies");
  }
  for (const pkg of packages) {
    if (pkg !== orchestrator && dependencyNames(pkg.manifest).has(ROOT_ORCHESTRATOR)) {
      add(violations, "ROOT_ORCHESTRATOR", `${pkg.name} must not depend on ${ROOT_ORCHESTRATOR}`);
    }
  }

  const sourceFiles = [];
  for (const pkg of packages) {
    if (pkg === orchestrator) continue;
    const sourceRoot = existsSync(join(pkg.root, "src")) ? join(pkg.root, "src") : pkg.root;
    for (const file of walk(sourceRoot)) {
      if (!ignored(relative(pkg.root, file))) sourceFiles.push(file);
    }
  }

  for (const file of sourceFiles) {
    const owner = packageForFile(file, packages);
    if (!owner) continue;
    const relFile = posix(relative(root, file));
    const source = readFileSync(file, "utf8");
    if (segments(relative(owner.root, file)).some((part) => /^kernel(?:\.|$)/i.test(part))) {
      add(violations, "KERNEL", `${relFile} uses a kernel path`);
    }
    for (const specifier of imports(source)) {
      if (/(^|\/)kernel(\/|$)/i.test(specifier) || /foundation-kernel/i.test(specifier)) {
        add(violations, "KERNEL", `${relFile} imports forbidden kernel namespace ${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier.replace(/\.(js|mjs|cjs)$/, ".ts"));
        const targetOwner = packageForFile(target, packages);
        if (targetOwner && targetOwner !== owner) add(violations, "CROSS_PACKAGE_RELATIVE", `${relFile} crosses into ${targetOwner.name} through ${specifier}`);
        continue;
      }
      if (NODE_BUILTINS.has(specifier)) continue;
      const target = packageForSpecifier(specifier, packages);
      const importedName = target?.name ?? externalPackage(specifier);
      if (!dependencyNames(owner.manifest).has(importedName) && importedName !== owner.name) {
        add(violations, "UNDECLARED_DEPENDENCY", `${relFile} imports undeclared dependency ${importedName}`);
      }
      if (!target) {
        if (specifier.startsWith(SERVER_PREFIX)) add(violations, "UNRESOLVED_SERVER_PACKAGE", `${relFile} imports unknown server package ${specifier}`);
        continue;
      }
      if (specifier !== target.name) {
        const subpath = `.${specifier.slice(target.name.length)}`;
        if (!exportedSubpaths(target.manifest).has(subpath)) add(violations, "DEEP_IMPORT", `${relFile} imports unexported subpath ${specifier}`);
      }
      const ownerLayer = layer(owner, root);
      const targetLayer = layer(target, root);
      if (targetLayer === "host" && ownerLayer !== "host") add(violations, "HOST_DIRECTION", `${owner.name} must not import the platform host`);
      if ((RANK.get(ownerLayer) ?? -1) < (RANK.get(targetLayer) ?? -1)) {
        add(violations, "LAYER_DIRECTION", `${owner.name} (${ownerLayer}) must not depend on ${target.name} (${targetLayer})`);
      }
      if (ownerLayer === "foundation" && target !== owner) add(violations, "FOUNDATION_ISOLATION", `Foundation must not import ${target.name}`);
    }
  }

  if (orchestrator) {
    for (const name of dependencyNames(orchestrator.manifest)) {
      if (!NODE_BUILTINS.has(name) && name.startsWith(SERVER_PREFIX)) add(violations, "ROOT_ORCHESTRATOR", `Root orchestrator must not depend on ${name}`);
    }
  }

  const foundation = packages.find((pkg) => layer(pkg, root) === "foundation");
  if (foundation) {
    for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys(foundation.manifest[section] ?? {})) add(violations, "FOUNDATION_ISOLATION", `Foundation manifest declares ${section}.${name}`);
    }
  }

  const ownershipPath = join(serverRoot, "architecture", "contract-ownership.json");
  if (!existsSync(ownershipPath)) add(violations, "CONTRACT_OWNERSHIP", "Missing server/architecture/contract-ownership.json");
  else {
    const registry = readJson(ownershipPath);
    const contractPackages = packages.filter((pkg) => layer(pkg, root) === "contracts");
    const owners = Object.values(registry.domains ?? {});
    for (const pkg of contractPackages) if (!owners.includes(pkg.name)) add(violations, "CONTRACT_OWNERSHIP", `${pkg.name} has no canonical domain registration`);
    for (const owner of owners) if (!contractPackages.some((pkg) => pkg.name === owner)) add(violations, "CONTRACT_OWNERSHIP", `${owner} is registered but is not an active contract package`);
    if (new Set(owners).size !== owners.length) add(violations, "CONTRACT_OWNERSHIP", "A contract package owns more than one canonical domain");

    const symbols = new Map();
    const allow = new Set(registry.duplicateSymbolAllowlist ?? []);
    const declaration = /\bexport\s+(?:declare\s+)?(?:interface|type|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/g;
    for (const pkg of contractPackages) for (const file of walk(join(pkg.root, "src"))) {
      for (const match of readFileSync(file, "utf8").matchAll(declaration)) {
        const name = match[1];
        if (allow.has(name)) continue;
        const prior = symbols.get(name);
        if (prior && prior !== pkg.name) add(violations, "DUPLICATE_CONTRACT", `${name} is exported by both ${prior} and ${pkg.name}`);
        else symbols.set(name, pkg.name);
      }
    }
  }

  const dockerIgnore = join(root, ".dockerignore");
  const ignoreText = existsSync(dockerIgnore) ? readFileSync(dockerIgnore, "utf8") : "";
  if (!/^\/?server-backup\/?$/m.test(ignoreText)) add(violations, "BACKUP_ISOLATION", ".dockerignore must exclude server-backup");
  const workspacePath = join(root, "pnpm-workspace.yaml");
  if (existsSync(workspacePath) && /server-backup/.test(readFileSync(workspacePath, "utf8"))) add(violations, "BACKUP_ISOLATION", "pnpm-workspace.yaml must not reference server-backup");
  for (const file of sourceFiles) {
    if (/server-backup/.test(readFileSync(file, "utf8"))) add(violations, "BACKUP_ISOLATION", `${posix(relative(root, file))} references server-backup`);
  }

  return { packages: packages.length, sourceFiles: sourceFiles.length, violations };
}

function run() {
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const result = analyzeServerRebuild(repoRoot);
  if (result.violations.length) {
    console.error("Server rebuild architecture violations:");
    for (const violation of result.violations) console.error(`- [${violation.code}] ${violation.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Server rebuild boundaries verified (${result.packages} packages, ${result.sourceFiles} source files).`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) run();
