import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const sourceFilenames = new Set(["Dockerfile", "Dockerfile.dev", "Dockerfile.prod"]);
const ignoredDirectories = new Set(["node_modules", ".next", "dist", ".turbo", ".cache"]);

interface BannedPackage {
  name: string;
  reason: string;
}

interface PlaneBoundaryRule {
  label: string;
  roots: string[];
  bannedPackages: BannedPackage[];
}

const meshOnlyPackages = [
  {
    name: "@athyper/mesh-console",
    reason: "Legacy Mesh application surface package",
  },
  {
    name: "@athyper/app-mesh",
    reason: "Mesh app composition package",
  },
  {
    name: "@athyper/app-mesh-brand",
    reason: "Mesh app-specific brand",
  },
  {
    name: "@athyper/app-mesh-i18n",
    reason: "Mesh app-specific i18n",
  },
  {
    name: "@athyper/app-mesh-shell",
    reason: "Mesh app-specific shell",
  },
  {
    name: "@athyper/app-mesh-route-manifest",
    reason: "Mesh app-specific route manifest",
  },
  {
    name: "@athyper/app-mesh-navigation",
    reason: "Mesh app-specific navigation",
  },
] satisfies BannedPackage[];

const removedNeonProductPackages = [
  {
    name: "@athyper/content-vault",
    reason: "Removed Neon route wrapper; use @athyper/app-neon/workbench",
  },
  {
    name: "@athyper/governance-orchestrator",
    reason: "Removed Neon route wrapper; use @athyper/app-neon/workbench",
  },
  {
    name: "@athyper/workbench-lab",
    reason: "Removed Neon route wrapper; use @athyper/app-neon/workbench",
  },
] satisfies BannedPackage[];

const neonOnlyPackages = [
  ...removedNeonProductPackages,
  {
    name: "@athyper/app-neon-command-hub",
    reason: "Neon app-specific package",
  },
  {
    name: "@athyper/app-neon-shell",
    reason: "Neon app-specific shell",
  },
  {
    name: "@athyper/app-neon-route-manifest",
    reason: "Neon app-specific route manifest",
  },
  {
    name: "@athyper/app-neon-navigation",
    reason: "Neon app-specific navigation",
  },
] satisfies BannedPackage[];

const adminOnlyPackages = [
  {
    name: "@athyper/app-admin-command-hub",
    reason: "Admin app-specific package",
  },
  {
    name: "@athyper/app-admin-shell",
    reason: "Admin app-specific shell",
  },
  {
    name: "@athyper/app-admin-route-manifest",
    reason: "Admin app-specific route manifest",
  },
  {
    name: "@athyper/app-admin-navigation",
    reason: "Admin app-specific navigation",
  },
] satisfies BannedPackage[];

const rules = [
  {
    label: "Shared + Core product",
    roots: [
      "packages/shared",
      "packages/product/design",
      "packages/product-deprecated/runtime-ui",
    ],
    bannedPackages: [
      ...neonOnlyPackages,
      ...meshOnlyPackages,
      ...adminOnlyPackages,
    ],
  },
  {
    label: "Mesh",
    roots: [
      "apps/mesh",
      "packages/apps/mesh",
    ],
    bannedPackages: [
      ...neonOnlyPackages,
      ...adminOnlyPackages,
    ],
  },
  {
    label: "Neon",
    roots: [
      "apps/neon",
      "packages/apps/neon",
    ],
    bannedPackages: [
      ...removedNeonProductPackages,
      ...meshOnlyPackages,
      ...adminOnlyPackages,
    ],
  },
  {
    label: "Admin",
    roots: [
      "apps/admin",
      "packages/apps/admin",
    ],
    bannedPackages: [
      ...meshOnlyPackages,
      ...removedNeonProductPackages,
      {
        name: "@athyper/app-neon-command-hub",
        reason: "Neon app-specific package",
      },
      {
        name: "@athyper/app-neon-shell",
        reason: "Neon app-specific shell",
      },
      {
        name: "@athyper/app-neon-route-manifest",
        reason: "Neon app-specific route manifest",
      },
      {
        name: "@athyper/app-neon-navigation",
        reason: "Neon app-specific navigation",
      },
    ],
  },
] satisfies PlaneBoundaryRule[];

const productTierDependencyPolicy = {
  design: ["design"],
  "runtime-ui": ["design", "runtime-ui"],
} as const;

type ProductCoreGroup = keyof typeof productTierDependencyPolicy;

const dependencySections = ["dependencies", "peerDependencies", "devDependencies", "optionalDependencies"] as const;

const legacyRuntimePackages = [
  {
    name: "@athyper/entity-runtime",
    replacement: "@athyper/runtime-record or a Neon record adapter",
  },
  {
    name: "@athyper/document-runtime",
    replacement: "@athyper/runtime-document or a Neon document adapter",
  },
] as const;

const legacyRuntimeImportScanRoots = [
  "apps",
  "packages/apps",
  "packages/shared",
  "packages/product",
  "packages/domain",
  "server",
] as const;

const legacyRuntimeImportIgnoredRoots = [
  "packages/product-deprecated/runtime-ui/entity-runtime",
  "packages/product-deprecated/runtime-ui/document-runtime",
] as const;

const legacyRuntimeImportAllowlist = new Set([
  "apps/neon/app/providers.tsx",
  "apps/neon/next.config.mjs",
  "apps/neon/package.json",
  "packages/domain/finance/finance-workbench/package.json",
  "packages/shared/runtime-domain/runtime-canvas/package.json",
  "packages/shared/runtime-domain/runtime-canvas/src/fields/runtime-field-value-view.tsx",
  "packages/shared/runtime-domain/runtime-canvas/src/header/header-chrome.ts",
  "packages/shared/runtime-domain/runtime-canvas/src/header/types.ts",
  "packages/shared/runtime-domain/runtime-canvas/src/record/runtime-record-chrome.tsx",
  "packages/shared/runtime-domain/runtime-canvas/src/record/runtime-record-workspace.tsx",
]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirectories.has(entry)) continue;

    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
      continue;
    }

    if (sourceFilenames.has(entry)) {
      yield path;
      continue;
    }

    const extIndex = path.lastIndexOf(".");
    if (extIndex === -1) continue;

    const ext = path.slice(extIndex);
    if (sourceExtensions.has(ext)) yield path;
  }
}

function packageOrSubpathIsReferenced(content: string, packageName: string): boolean {
  return (
    content.includes(`"${packageName}"`) ||
    content.includes(`"${packageName}/`) ||
    content.includes(`'${packageName}'`) ||
    content.includes(`'${packageName}/`)
  );
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function relativeRepoPath(path: string): string {
  return normalizePath(relative(repoRoot, path));
}

function isUnderRelRoot(path: string, relRoot: string): boolean {
  const relPath = relativeRepoPath(path);
  return relPath === relRoot || relPath.startsWith(`${relRoot}/`);
}

function isProductCoreGroup(groupName: string): groupName is ProductCoreGroup {
  return Object.prototype.hasOwnProperty.call(productTierDependencyPolicy, groupName);
}

function collectProductPackagesByName(): Map<string, { groupName: string; packageJsonPath: string }> {
  const productRoot = join(repoRoot, "packages/product");
  const packagesByName = new Map<string, { groupName: string; packageJsonPath: string }>();
  if (!existsSync(productRoot)) return packagesByName;

  for (const groupName of readdirSync(productRoot)) {
    const groupRoot = join(productRoot, groupName);
    if (!statSync(groupRoot).isDirectory()) continue;

    for (const packageDirName of readdirSync(groupRoot)) {
      const packageRoot = join(groupRoot, packageDirName);
      if (!statSync(packageRoot).isDirectory()) continue;

      const packageJsonPath = join(packageRoot, "package.json");
      if (!existsSync(packageJsonPath)) continue;

      const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
      if (typeof manifest.name !== "string") continue;

      packagesByName.set(manifest.name, {
        groupName,
        packageJsonPath,
      });
    }
  }

  return packagesByName;
}

const violations: string[] = [];

for (const rule of rules) {
  for (const relRoot of rule.roots) {
    const absRoot = join(repoRoot, relRoot);
    if (!existsSync(absRoot)) continue;

    for (const file of walk(absRoot)) {
      const content = readFileSync(file, "utf8");

      for (const pkg of rule.bannedPackages) {
        if (!packageOrSubpathIsReferenced(content, pkg.name)) continue;
        violations.push(
          `${rule.label}: ${relative(repoRoot, file)} references ${pkg.name} (${pkg.reason})`,
        );
      }
    }
  }
}

for (const relRoot of legacyRuntimeImportScanRoots) {
  const absRoot = join(repoRoot, relRoot);
  if (!existsSync(absRoot)) continue;

  for (const file of walk(absRoot)) {
    if (legacyRuntimeImportIgnoredRoots.some((ignoredRoot) => isUnderRelRoot(file, ignoredRoot))) {
      continue;
    }

    const relFile = relativeRepoPath(file);
    const content = readFileSync(file, "utf8");

    for (const pkg of legacyRuntimePackages) {
      if (!packageOrSubpathIsReferenced(content, pkg.name)) continue;
      if (legacyRuntimeImportAllowlist.has(relFile)) continue;

      violations.push(
        `Legacy runtime import: ${relFile} references ${pkg.name}; migrate new code to ${pkg.replacement}`,
      );
    }
  }
}

const productPackagesByName = collectProductPackagesByName();
for (const [_packageName, packageInfo] of productPackagesByName) {
  if (!isProductCoreGroup(packageInfo.groupName)) continue;

  const allowedGroups = new Set<string>(productTierDependencyPolicy[packageInfo.groupName]);
  const manifest = JSON.parse(readFileSync(packageInfo.packageJsonPath, "utf8")) as Record<string, unknown>;

  for (const section of dependencySections) {
    const deps = manifest[section];
    if (!deps || typeof deps !== "object") continue;

    for (const depName of Object.keys(deps)) {
      const depInfo = productPackagesByName.get(depName);
      if (!depInfo || allowedGroups.has(depInfo.groupName)) continue;

      violations.push(
        `Product tier: ${relative(repoRoot, packageInfo.packageJsonPath)} ${section} references ${depName} from packages/product/${depInfo.groupName}; allowed groups are ${[...allowedGroups].join(", ") || "(none)"}`,
      );
    }
  }
}

if (violations.length > 0) {
  fail([
    "Plane package boundary violations:",
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n"));
}

console.log("Plane package boundaries verified.");
