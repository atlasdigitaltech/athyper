import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const profilesPath = join(root, "config", "deployment", "profiles.json");
const matrixPath = join(root, "docs", "architecture", "package-ownership-matrix.json");
const errors = [];
const rel = (path) => relative(root, path).replaceAll("\\", "/");

function workspaceRows() {
  const output = process.platform === "win32"
    ? execFileSync("powershell.exe", ["-NoProfile", "-Command", "pnpm list -r --depth -1 --json"], { cwd: root, encoding: "utf8" })
    : execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], { cwd: root, encoding: "utf8" });
  return JSON.parse(output);
}

function packageManifest(directory) {
  const path = join(directory, "package.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function dependencyNames(manifest) {
  return [manifest?.dependencies, manifest?.devDependencies, manifest?.optionalDependencies, manifest?.peerDependencies]
    .filter(Boolean).flatMap((group) => Object.keys(group));
}

const rows = workspaceRows();
const byName = new Map(rows.map((row) => [row.name, row]));
const manifests = rows.map((row) => ({ ...row, manifest: packageManifest(row.path) })).filter((row) => row.manifest);
const ownership = existsSync(matrixPath) ? JSON.parse(readFileSync(matrixPath, "utf8")).rows ?? [] : [];
const ownershipPaths = new Set(ownership.map((row) => row.physicalPath.replaceAll("\\", "/")));

const profiles = JSON.parse(readFileSync(profilesPath, "utf8")).profiles;
for (const [profileName, profile] of Object.entries(profiles)) {
  const required = [profile.entryApplication, ...profile.requiredProductPackages, ...profile.requiredSharedPackages, ...profile.requiredServerServices];
  for (const packageName of required) {
    if (!byName.has(packageName)) errors.push(`${profileName}: package ${packageName} is not an active workspace package`);
  }

  const entry = byName.get(profile.entryApplication);
  if (!entry) continue;
  if (!profile.buildCommand.startsWith("pnpm --filter ") || !profile.buildCommand.endsWith("... build")) {
    errors.push(`${profileName}: buildCommand must build through a pnpm recursive filter`);
  }
  if (!profile.runtimeCommand.startsWith("pnpm --filter ")) errors.push(`${profileName}: runtimeCommand must use a pnpm package filter`);
  for (const variable of profile.environmentVariables) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(variable)) errors.push(`${profileName}: invalid environment variable ${variable}`);
  }
  for (const check of profile.healthChecks) {
    if (!check.path.startsWith("/")) errors.push(`${profileName}: health check path must be absolute: ${check.path}`);
  }
}

for (const row of manifests) {
  const packagePath = `${rel(join(row.path, "package.json"))}`;
  if (!ownershipPaths.has(packagePath)) errors.push(`Missing ownership metadata for ${packagePath}`);
}

const activeByName = new Map();
const activePaths = new Set();
for (const row of manifests) activeByName.set(row.name, [...(activeByName.get(row.name) ?? []), realpathSync(row.path)]);
for (const row of manifests) {
  const path = realpathSync(row.path);
  if (activePaths.has(path)) errors.push(`Duplicate active package path ${rel(path)}`);
  activePaths.add(path);
  if (row.name !== "athyper" && row.manifest.private !== true && !row.manifest.exports) {
    errors.push(`Missing package exports for public package ${row.name} (${rel(row.path)})`);
  }
}
for (const [name, paths] of activeByName) {
  if (new Set(paths).size > 1) errors.push(`Duplicate active package name ${name}: ${paths.map(rel).join(", ")}`);
}

if (errors.length) {
  console.error(["Deployment profile validation failed:", ...[...new Set(errors)].map((error) => `- ${error}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Deployment profiles verified (${Object.keys(profiles).length} profiles, ${manifests.length} active packages with ownership metadata).`);
}
