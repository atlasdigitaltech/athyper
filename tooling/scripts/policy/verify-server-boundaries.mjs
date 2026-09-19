#!/usr/bin/env node
import { sourceImports as importSpecifiers } from "./source-imports.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const promotedServices = new Map([
  ["ai", "@athyper/svc-ai"],
  ["audit", "@athyper/svc-audit"],
  ["business", "@athyper/svc-business"],
  ["collab", "@athyper/svc-collab"],
  ["content", "@athyper/svc-content"],
  ["doc-services", "@athyper/svc-doc-services"],
  ["documents", "@athyper/svc-documents"],
  ["finance", "@athyper/svc-finance"],
  ["iam", "@athyper/svc-iam"],
  ["integration", "@athyper/svc-integration"],
  ["jobs", "@athyper/svc-jobs"],
  ["master", "@athyper/svc-master"],
  ["metadata", "@athyper/svc-metadata"],
  ["platform", "@athyper/svc-platform"],
  ["policy", "@athyper/svc-policy"],
  ["records", "@athyper/svc-records"],
  ["search", "@athyper/svc-search"],
  ["shared", "@athyper/svc-shared"],
  ["workflow", "@athyper/svc-workflow"],
]);

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
]);
const ignoredDirs = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".next",
  ".git",
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function* walk(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (ignoredDirs.has(entry)) continue;
    const abs = join(root, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      yield* walk(abs);
      continue;
    }
    const dot = entry.lastIndexOf(".");
    if (dot === -1) continue;
    if (sourceExtensions.has(entry.slice(dot))) yield abs;
  }
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(file), specifier);
  return base.replace(/\.(js|mjs|cjs)$/, ".ts");
}

const violations = [];
const serverPackagesRoot = join(repoRoot, "server", "packages");
const serverSrcRoot = join(repoRoot, "server", "src");
const serverDbRoot = join(repoRoot, "server", "db");
const servicesRoot = join(serverPackagesRoot, "services");
const legacyFoundationRoot = join(serverPackagesRoot, "runtime", "foundation");
const legacyOpenApiRoot = join(serverPackagesRoot, "runtime", "openapi");

if (existsSync(legacyFoundationRoot)) {
  violations.push(
    "legacy runtime foundation directory still exists; use @athyper/server-foundation",
  );
}
if (existsSync(legacyOpenApiRoot)) {
  violations.push(
    "legacy runtime OpenAPI directory still exists; use @athyper/server-foundation/openapi/*",
  );
}

for (const file of walk(join(repoRoot, "server"))) {
  const relFile = toPosix(relative(repoRoot, file));
  const source = readFileSync(file, "utf8");
  for (const specifier of importSpecifiers(source, file)) {
    const resolved = resolveRelativeImport(file, specifier);
    const normalizedSpec = specifier.replaceAll("\\", "/");

    if (
      isInside(file, serverPackagesRoot) &&
      resolved &&
      isInside(resolved, serverSrcRoot)
    ) {
      violations.push(`${relFile} imports server/src through ${specifier}`);
    }

    if (isInside(file, serverDbRoot)) {
      if (
        normalizedSpec.includes("packages/services/") ||
        normalizedSpec.startsWith("@athyper/svc-") ||
        normalizedSpec.startsWith("@athyper/server-service-")
      ) {
        violations.push(
          `${relFile} imports a service package from db code through ${specifier}`,
        );
      }
    }

    if (
      normalizedSpec.includes("packages/runtime/foundation") ||
      normalizedSpec.includes("packages/runtime/openapi") ||
      normalizedSpec.includes("runtime/foundation")
    ) {
      violations.push(
        `${relFile} imports legacy runtime namespace through ${specifier}`,
      );
    }

    if (!resolved) continue;
    if (isInside(file, serverSrcRoot)) continue;

    for (const [service, packageName] of promotedServices.entries()) {
      const targetRoot = join(servicesRoot, service);
      if (!isInside(resolved, targetRoot)) continue;
      if (isInside(file, targetRoot)) continue;
      violations.push(
        `${relFile} reaches ${service} via ${specifier}; use ${packageName}`,
      );
    }
  }
}

if (violations.length > 0) {
  fail(
    ["Server boundary violations:", ...violations.map((v) => `- ${v}`)].join(
      "\n",
    ),
  );
} else {
  console.log("Server package boundaries verified.");
}
