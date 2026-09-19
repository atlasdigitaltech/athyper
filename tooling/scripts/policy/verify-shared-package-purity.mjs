import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const sharedRoots = [
  join(root, "packages", "contracts"),
  join(root, "packages", "domain"),
  join(root, "packages", "platform"),
  join(root, "packages", "shared"),
];
const ignored = new Set(["node_modules", "dist", "build", ".next", "coverage"]);

function walk(dir) {
  const result = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

function packageDirsFromWorkspace() {
  const output = process.platform === "win32"
    ? execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd list -r --depth -1 --json"], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    : execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const rows = JSON.parse(output);
  return new Set(rows.map((row) => realpathSync(row.path)));
}

function packageManifests() {
  return sharedRoots.flatMap((directory) => walk(directory))
    .filter((path) => path.endsWith("package.json"));
}

function packageRoot(manifest) {
  return resolve(manifest, "..");
}

function dependencyNames(pkg) {
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies, pkg.optionalDependencies]
    .filter(Boolean)
    .flatMap((group) => Object.keys(group));
}

function moduleSpecifiers(text) {
  const values = [];
  const patterns = [
    /\b(?:from|import|export)\s*["']([^"']+)["']/gu,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

function forbiddenImplementationImport(source, specifier) {
  if (!specifier || (!specifier.startsWith(".") && !isAbsolute(specifier))) return false;
  const target = resolve(dirname(source), specifier);
  const relTarget = relative(root, target).replaceAll("\\", "/");
  return relTarget === "apps" || relTarget.startsWith("apps/")
    || relTarget === "packages/planes" || relTarget.startsWith("packages/planes/")
    || relTarget === "server" || relTarget.startsWith("server/");
}

const active = packageDirsFromWorkspace();
const manifests = packageManifests();
const sharedCanonicalRoots = sharedRoots.filter(existsSync).map((directory) => realpathSync(directory));
const errors = [];
const duplicateNames = new Map();
if (sharedCanonicalRoots.length === 0) errors.push("No shared package roots exist; shared purity cannot be verified");

for (const manifest of manifests) {
  const dir = packageRoot(manifest);
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  if (!duplicateNames.has(pkg.name)) duplicateNames.set(pkg.name, []);
  duplicateNames.get(pkg.name).push(relative(root, dir).replaceAll("\\", "/"));

  if (!active.has(realpathSync(dir))) continue;

  for (const dependency of dependencyNames(pkg)) {
    if (dependency.startsWith("@athyper/app-") || dependency.startsWith("@athyper/product-")) {
      errors.push(`${relative(root, manifest)} depends on application/product package ${dependency}`);
    }
  }

  for (const source of walk(dir).filter((path) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path))) {
    const text = readFileSync(source, "utf8");
    for (const specifier of moduleSpecifiers(text)) {
      if (forbiddenImplementationImport(source, specifier)) {
        errors.push(`${relative(root, source)} imports an application/product/server implementation`);
      }
    }
  }
}

const duplicateReport = [...duplicateNames.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([name, paths]) => `${name}: ${paths.join(", ")}`);

if (duplicateReport.length) {
  console.warn(`Shared duplicate source manifests remain outside the active workspace (${duplicateReport.length}); review via the Phase 3 cleanup manifest.`);
  for (const row of duplicateReport) console.warn(`  ${row}`);
}

if (errors.length) {
  console.error("Shared package purity check failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  const activeShared = [...active].filter((path) =>
    sharedCanonicalRoots.some((sharedRoot) => path === sharedRoot || path.startsWith(`${sharedRoot}/`))
  );
  console.log(`Shared package purity verified (${activeShared.length} active shared packages).`);
}
