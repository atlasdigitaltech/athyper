import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readdirSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const normalize = (value) => value.replaceAll("\\", "/");
const relPath = (value) => normalize(relative(root, value));
const frontendSpine = JSON.parse(readFileSync(resolve(root, "config/governance/frontend-spine-packages.json"), "utf8"));

const tracked = execFileSync("git", ["ls-files", "**/package.json", "package.json"], {
  cwd: root,
  encoding: "utf8",
}).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);

function discoverPackageFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...discoverPackageFiles(path));
    else if (entry.name === "package.json") result.push(relPath(path));
  }
  return result;
}

const packageFiles = [...new Set([
  ...tracked.filter((file) => existsSync(resolve(root, file))),
  // Include new, not-yet-tracked workspace packages in every active ownership
  // area. Ownership validation must not depend on a package's first commit.
  ...["apps", "packages", "server/apps", "server/db", "server/packages", "tooling"]
    .flatMap((directory) => discoverPackageFiles(resolve(root, directory))),
])];
const manifests = packageFiles.map((file) => {
  const path = resolve(root, file);
  const canonicalPath = relPath(realpathSync(path));
  return {
    path: file,
    canonicalPath,
    isSourceAlias: canonicalPath !== file,
    directory: dirname(file),
    manifest: JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")),
  };
});

let active = [];
try {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm.cmd list -r --depth -1 --json"]
    : ["list", "-r", "--depth", "-1", "--json"];
  const listed = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  // pnpm can return a non-zero status for duplicate-name diagnostics while
  // still emitting a complete JSON workspace inventory.
  const output = listed.stdout;
  active = JSON.parse(output).map((item) => relPath(item.path));
} catch {
  active = [];
}
const activeSet = new Set(active.flatMap((path) => [path, `${path}/package.json`, path === "" ? "package.json" : path]));

const byName = new Map();
for (const item of manifests) {
  const name = item.manifest.name ?? item.path;
  const list = byName.get(name) ?? [];
  list.push(item);
  byName.set(name, list);
}

const appNames = ["neon", "studio", "mesh"];
const categoryValues = [
  "Shared contract",
  "Shared platform",
  "Shared domain",
  "Product-specific",
  "Application composition",
  "Server-only",
  "Deprecated",
];

function appFromPath(path) {
  const match = path.match(/^(?:apps|packages\/(?:products|planes))\/(neon|studio|mesh)(?:\/|$)/);
  return match?.[1] ?? null;
}

function classify(path, manifest) {
  if (path.startsWith("packages/product-deprecated/")
    || path.startsWith("server-backup/")
    || path.startsWith("apps-backup/")
    || path.startsWith("packages-backup/")
    || path.startsWith(".local-backups/")) return "Deprecated";
  if (path.startsWith("server/")) return "Server-only";
  if (path.startsWith("apps/")) return "Application composition";
  if (path.startsWith("packages/planes/")) return "Product-specific";
  if (path.startsWith("packages/contracts/")) return "Shared contract";
  if (path.startsWith("packages/platform/")) return "Shared platform";
  if (path.startsWith("packages/domain/")) return "Shared domain";
  if (path.startsWith("tooling/") || path === "package.json") return "Shared platform";

  if (path.includes("api-contracts") || path.includes("runtime-contracts")
    || path.includes("mesh-exchange-contracts") || path.includes("metadata-client")) {
    return "Shared contract";
  }
  if (path.startsWith("packages/shared/platform-auth/")) return "Shared platform";
  if (path.startsWith("packages/shared/ui-platform/")) return "Shared platform";
  if (path.startsWith("packages/shared/data-integration/")) return "Shared platform";
  if (path.startsWith("packages/shared/runtime-domain/")) return "Shared domain";
  if (path.startsWith("packages/shared/business-domain/")) return "Shared domain";
  if (path.startsWith("packages/shared/")) return "Shared platform";
  return manifest.private ? "Shared platform" : "Shared domain";
}

function owner(path, category) {
  const app = appFromPath(path);
  if (app) return app[0].toUpperCase() + app.slice(1);
  if (category === "Server-only") return "Runtime Server";
  if (path.startsWith("packages/contracts/")) return "Contract Platform";
  if (path.startsWith("packages/platform/")) return "Shared Platform";
  if (path.startsWith("packages/shared/data-integration/")) return "Data Integration";
  if (path.startsWith("packages/shared/platform-auth/")) return "Platform Auth";
  if (path.startsWith("packages/shared/runtime-domain/")) return "Runtime Domain";
  if (path.startsWith("packages/shared/ui-platform/")) return "UI Platform";
  if (path.startsWith("packages/shared/business-domain/")) return "Business Domain";
  if (path.startsWith("packages/domain/")) return "Business Domain";
  if (path.startsWith("packages/shared/")) return "Shared Platform";
  if (path.startsWith("deploy/") || path.startsWith("tooling/") || path.startsWith("packages/tooling/") || path === "package.json") return "Build Platform";
  if (category === "Deprecated") return "Retirement";
  return "Unassigned";
}

function plane(path, category) {
  const app = appFromPath(path);
  if (app) return `${app} application plane`;
  if (category === "Server-only") return "Server plane";
  if (path.startsWith("packages/shared/platform-auth/")) return "Identity/platform plane";
  if (path.startsWith("packages/shared/data-integration/")) return "Integration plane";
  if (path.startsWith("packages/shared/runtime-domain/")) return "Runtime plane";
  if (path.startsWith("packages/shared/ui-platform/")) return "UI platform plane";
  if (path.startsWith("packages/shared/business-domain/") || path.startsWith("packages/domain/")) return "Business domain plane";
  if (category === "Deprecated") return "Legacy plane";
  return "Build plane";
}

function targets(path, category) {
  const app = appFromPath(path);
  if (app) return app;
  if (category === "Server-only") return "server";
  if (category === "Deprecated") return "none (retirement)";
  if (path.startsWith("deploy/") || path.startsWith("tooling/") || path === "package.json") return "CI/build";
  return "neon, studio, mesh, server as consumed";
}

function proposedPath(item, duplicateItems) {
  if (item.isSourceAlias) return item.canonicalPath;
  const activeCandidate = duplicateItems.find((candidate) => activeSet.has(candidate.path));
  if (activeCandidate) return activeCandidate.path;
  if (item.path.startsWith("packages/product-deprecated/")) return "DELETE (deprecated package tree)";
  return item.path;
}

function migration(item, category, duplicateItems) {
  if (item.isSourceAlias) return `Remove source junction alias; canonical authority is ${item.canonicalPath}`;
  if (category === "Deprecated") return "Scheduled for deletion after consumer retirement";
  if (duplicateItems.length > 1) {
    return activeSet.has(item.path) ? "Canonical candidate; consolidate duplicate package names" : "Retired duplicate; remove after canonical verification";
  }
  if (item.path.startsWith("packages/domain/")) return "Review shared-domain placement";
  return "Inventory complete; no move in Phase 1";
}

const consumers = new Map();
for (const item of manifests) {
  const dependencies = {
    ...(item.manifest.dependencies ?? {}),
    ...(item.manifest.devDependencies ?? {}),
    ...(item.manifest.optionalDependencies ?? {}),
    ...(item.manifest.peerDependencies ?? {}),
  };
  for (const dependency of Object.keys(dependencies)) {
    if (!byName.has(dependency)) continue;
    const list = consumers.get(dependency) ?? [];
    list.push(item.path);
    consumers.set(dependency, list);
  }
}

const rows = manifests.map((item) => {
  const name = item.manifest.name ?? item.path;
  const duplicateItems = byName.get(name) ?? [item];
  const activeCandidate = duplicateItems.find((candidate) => activeSet.has(candidate.path));
  const effectivePath = item.isSourceAlias
    ? item.canonicalPath
    : (activeCandidate?.path ?? item.path);
  const category = classify(effectivePath, item.manifest);
  const row = {
    packageName: name,
    physicalPath: item.path,
    currentConsumers: (consumers.get(name) ?? []).sort(),
    intendedOwner: owner(effectivePath, category),
    runtimePlane: plane(effectivePath, category),
    deploymentTargets: targets(effectivePath, category),
    duplicateStatus: item.isSourceAlias
      ? `Source junction alias -> ${item.canonicalPath}`
      : duplicateItems.length > 1
      ? `Duplicate name (${duplicateItems.length} physical manifests); ${activeSet.has(item.path) ? "active candidate" : "inactive/retired"}`
      : (activeSet.has(item.path) ? "Unique active package" : "Not discovered by pnpm workspace"),
    proposedFinalLocation: proposedPath(item, duplicateItems),
    migrationStatus: migration(item, category, duplicateItems),
    classification: category,
    workspaceActive: activeSet.has(item.path),
  };
  if (!categoryValues.includes(row.classification)) throw new Error(`Unclassified package: ${item.path}`);
  if (row.intendedOwner === "Unassigned") throw new Error(`Unowned package: ${item.path}`);
  return row;
}).sort((a, b) => a.physicalPath.localeCompare(b.physicalPath));

const outputDirectory = resolve(root, "docs/architecture");
const jsonPath = resolve(outputDirectory, "package-ownership-matrix.json");
const markdownPath = resolve(outputDirectory, "package-ownership-matrix.md");
const counts = Object.fromEntries(categoryValues.map((category) => [category, rows.filter((row) => row.classification === category).length]));

const markdown = [
  "# Phase 1 — Package Ownership Matrix",
  "",
  "> Generated by `scripts/package-ownership-inventory.mjs`. Re-run after package moves or dependency changes.",
  "",
  `Inventory date: ${new Date().toISOString().slice(0, 10)}`,
  `Physical package manifests: ${rows.length}`,
  `Active pnpm workspace projects: ${active.length}`,
  "",
  "## Classification counts",
  "",
  "| Classification | Packages |",
  "|---|---:|",
  ...categoryValues.map((category) => `| ${category} | ${counts[category]} |`),
  "",
  "## Contract",
  "",
  "Every package must have exactly one classification, one intended owner, one runtime plane, and one proposed final location. Duplicate package names are tracked explicitly and are not treated as independent authorities.",
  "",
  "## Frontend spine governance",
  "",
  "The Phase 0 frontend spine adds an explicit runtime/workspace dependency budget. The generated matrix and `config/governance/frontend-spine-packages.json` must be updated together.",
  "",
  "| Package | Physical path | Owner | Classification | Runtime dependency budget | Workspace dependency budget |",
  "|---|---|---|---|---:|---:|",
  ...frontendSpine.packages.map((item) => `| ${item.name} | ${item.path} | ${item.owner} | ${item.classification} | ${item.dependencyBudget.runtime} | ${item.dependencyBudget.workspace} |`),
  "",
  "## Detailed matrix",
  "",
  "| Package | Physical path | Consumers | Owner | Runtime plane | Deployment targets | Duplicate status | Proposed final location | Migration status | Classification |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((row) => {
    const consumersText = row.currentConsumers.length > 0 ? row.currentConsumers.join("<br>") : "—";
    return `| ${row.packageName} | ${row.physicalPath} | ${consumersText} | ${row.intendedOwner} | ${row.runtimePlane} | ${row.deploymentTargets} | ${row.duplicateStatus} | ${row.proposedFinalLocation} | ${row.migrationStatus} | ${row.classification} |`;
  }),
  "",
  "## Phase 1 decision rules",
  "",
  "- `packages/shared/*` is the canonical shared source area.",
  "- `packages/planes/<app>/*` is the destination for product-specific reusable packages (`app`, `brand`, `shell`, `navigation`, `route-manifest`, `i18n`, `command-hub`, `runtime`).",
  "- `apps/<app>` remains application composition and deployment entrypoint code.",
  "- `server/packages/*` remains server-only.",
  "- `packages/product-deprecated/*` is never a dependency authority and is scheduled for retirement.",
  "- Windows source junctions are not deployment authorities; pnpm `node_modules` links are generated dependencies and are allowed.",
].join("\n");

writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), categoryValues, counts, frontendSpine, rows }, null, 2) + "\n");
writeFileSync(markdownPath, markdown + "\n");
console.log(`Wrote ${rows.length} package rows to ${relPath(markdownPath)} and ${relPath(jsonPath)}.`);
