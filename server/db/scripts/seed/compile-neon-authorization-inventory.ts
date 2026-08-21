#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  validateNeonAuthorizationInventory,
  type NeonReviewedSlicesContract,
  type NeonTableCoverageRow,
  type StudioNeonOrganizationBoundaryContract,
} from "./neon-authorization-inventory-model.js";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../..");
const repositoryRoot = resolve(dbRoot, "../..");
const contractPath = resolve(dbRoot, "seed/contracts/authorization/inventory/neon/reviewed-slices.v1.json");
const organizationBoundaryPath = resolve(dbRoot, "seed/contracts/authorization/inventory/neon/studio-neon-organization-boundary.v1.json");
const outputRoot = resolve(dbRoot, "seed/contracts/authorization/inventory/neon/compiled");
const outputPath = resolve(outputRoot, "table-authorization-coverage.v1.json");
const reportPath = resolve(outputRoot, "review-report.md");
const ddlSources = [
  "ddl/common/master/03_platform_tables.sql",
  "ddl/common/master/03_tables.sql",
  "ddl/planes/neon/master/03_tables.sql",
  "ddl/common/document/03_tables.sql",
  "ddl/planes/neon/document/03_tables.sql",
] as const;
const repositoryRoots = ["apps", "packages", "server/apps", "server/packages", "tools/scripts"] as const;
const expectedTableCount = 260;

type DiscoveredTable = {
  readonly table: string;
  readonly ddlSource: string;
  readonly hasStatus: boolean;
  readonly hasVersion: boolean;
};

export async function compileNeonAuthorizationInventory(): Promise<{
  readonly artifact: Record<string, unknown>;
  readonly report: string;
  readonly errors: readonly string[];
  readonly releaseBlockers: readonly string[];
}> {
  const [contract, organizationBoundary] = await Promise.all([
    json<NeonReviewedSlicesContract>(contractPath),
    json<StudioNeonOrganizationBoundaryContract>(organizationBoundaryPath),
  ]);
  if (contract.contractVersion !== "athyper.authorization.neon-reviewed-slices.v1" || contract.plane !== "neon") {
    throw new Error("invalid Neon reviewed-slices contract identity");
  }
  const discovered = (await Promise.all(ddlSources.map(discoverTables))).flat()
    .sort((left, right) => left.table.localeCompare(right.table));
  const duplicateTables = duplicates(discovered.map((item) => item.table));
  if (duplicateTables.length) throw new Error(`Neon DDL defines duplicate table(s): ${duplicateTables.join(", ")}`);
  if (discovered.length !== expectedTableCount) {
    throw new Error(`Neon authorization inventory expected ${expectedTableCount} tables; found ${discovered.length}`);
  }

  const sourceFiles = (await Promise.all(repositoryRoots.map((root) => walk(resolve(repositoryRoot, root))))).flat()
    .filter(sourceFile)
    .sort();
  const sourceCache = new Map(await Promise.all(sourceFiles.map(async (path) => [path, await readFile(path, "utf8")] as const)));

  const reviewed = new Map(contract.tables.map((definition) => [definition.table, definition]));
  const coverage: NeonTableCoverageRow[] = discovered.map((item) => {
    const repositoryReferences = references(item.table, sourceCache, false);
    const writerReferences = references(item.table, sourceCache, true);
    const definition = reviewed.get(item.table);
    if (!definition) {
      return {
        ...item,
        repositoryReferences,
        writerReferences,
        reviewStatus: "pending_review",
        slice: "phase1_backlog",
        businessDomain: null,
        classification: "pending_review",
        aggregateRoot: null,
        writerKind: null,
        writerOwner: null,
        externallyReadable: null,
        externallyWritable: null,
        sensitivity: null,
        requiredScopeKinds: [],
      };
    }
    return {
      ...item,
      repositoryReferences,
      writerReferences,
      reviewStatus: "reviewed",
      slice: definition.slice,
      businessDomain: definition.businessDomain,
      classification: definition.classification,
      aggregateRoot: definition.aggregateRoot,
      writerKind: definition.writerKind,
      writerOwner: definition.writerOwner,
      externallyReadable: definition.externallyReadable,
      externallyWritable: definition.externallyWritable,
      sensitivity: definition.sensitivity,
      requiredScopeKinds: definition.requiredScopeKinds,
      ...(definition.notes ? { notes: definition.notes } : {}),
    };
  });
  const validation = validateNeonAuthorizationInventory({
    discoveredTables: discovered.map((item) => item.table),
    coverage,
    contract,
    organizationBoundary,
  });
  const reviewedRows = coverage.filter((row) => row.reviewStatus === "reviewed");
  const pendingRows = coverage.filter((row) => row.reviewStatus === "pending_review");
  const artifactBody = {
    contractVersion: "athyper.authorization.neon-table-coverage.v1",
    plane: "neon",
    mode: "inventory_only_non_enforcing",
    source: {
      ddlSources,
      repositoryRoots,
      reviewedSlicesContract: relativePath(contractPath),
      studioNeonOrganizationBoundary: relativePath(organizationBoundaryPath),
    },
    counts: {
      tables: coverage.length,
      masterTables: coverage.filter((row) => row.table.startsWith("master.")).length,
      documentTables: coverage.filter((row) => row.table.startsWith("document.")).length,
      reviewedTables: reviewedRows.length,
      pendingReviewTables: pendingRows.length,
      operations: contract.operations.length,
      lifecycles: contract.lifecycles.length,
      crossPlaneOrganizationResources: organizationBoundary.resources.length,
      roles: 0,
      grants: 0,
    },
    tables: coverage,
    operations: contract.operations,
    lifecycles: contract.lifecycles,
    studioNeonOrganizationBoundary: organizationBoundary,
    releaseBlockers: validation.releaseBlockers,
  };
  const artifact = {
    ...artifactBody,
    sha256: sha256(canonical(artifactBody)),
  };
  return {
    artifact,
    report: markdown(artifact),
    errors: validation.errors,
    releaseBlockers: validation.releaseBlockers,
  };
}

async function discoverTables(sourcePath: string): Promise<DiscoveredTable[]> {
  const absolute = resolve(dbRoot, sourcePath);
  const source = await readFile(absolute, "utf8");
  const matches = [...source.matchAll(/^CREATE TABLE\s+((?:master|document)\.[a-z][a-z0-9_]*)/gm)];
  return matches.map((match, index) => {
    const body = source.slice(match.index!, matches[index + 1]?.index ?? source.length);
    return {
      table: match[1]!,
      ddlSource: sourcePath,
      hasStatus: /^\s+(?:status|state|lifecycle_status)\s+/m.test(body),
      hasVersion: /^\s+(?:row_version|version|lock_version)\s+/m.test(body),
    };
  });
}

function references(table: string, files: ReadonlyMap<string, string>, writersOnly: boolean): string[] {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const writer = new RegExp(
    "(?:insertInto|updateTable|deleteFrom)\\(\\s*[\"'`]" + escaped
      + "[\"'`]|\\b(?:insert\\s+into|update|delete\\s+from|truncate(?:\\s+table)?)\\s+" + escaped + "\\b",
    "i",
  );
  const output: string[] = [];
  for (const [path, source] of files) {
    if (writersOnly ? writer.test(source) : source.includes(table)) output.push(relativePath(path));
  }
  return output.sort();
}

function sourceFile(path: string): boolean {
  return [".ts", ".tsx", ".js", ".mjs"].includes(extname(path))
    && !/[\\/](?:node_modules|dist|coverage|generated|__tests__|__fixtures__)[\\/]/.test(path)
    && !/\.(?:test|spec|d)\.(?:ts|tsx|js|mjs)$/.test(path);
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "coverage", ".git"].includes(entry.name)) output.push(...await walk(path));
    } else if (entry.isFile()) output.push(path);
  }
  return output;
}

function markdown(artifact: Record<string, unknown>): string {
  const counts = artifact.counts as Record<string, number>;
  const rows = artifact.tables as NeonTableCoverageRow[];
  const operations = artifact.operations as NeonReviewedSlicesContract["operations"];
  const lifecycles = artifact.lifecycles as NeonReviewedSlicesContract["lifecycles"];
  const organizationBoundary = artifact.studioNeonOrganizationBoundary as StudioNeonOrganizationBoundaryContract;
  const releaseBlockers = artifact.releaseBlockers as string[];
  const reviewed = rows.filter((row) => row.reviewStatus === "reviewed");
  const pending = rows.filter((row) => row.reviewStatus === "pending_review");
  const classificationCounts = new Map<string, number>();
  for (const row of reviewed) classificationCounts.set(row.classification, (classificationCounts.get(row.classification) ?? 0) + 1);
  const classifications = [...classificationCounts].sort(([left], [right]) => left.localeCompare(right));
  const lines = [
    "# Neon authorization inventory review",
    "",
    "Status: inventory-only and non-enforcing. This artifact creates no roles, grants, or runtime bindings.",
    "",
    "## Coverage",
    "",
    `- Physical tables: ${counts.tables} (${counts.masterTables} master, ${counts.documentTables} document)`,
    `- Reviewed tables: ${counts.reviewedTables}`,
    `- Pending business review: ${counts.pendingReviewTables}`,
    `- Proposed operations: ${counts.operations}`,
    `- Proposed lifecycles: ${counts.lifecycles}`,
    `- Studio-to-Neon organization resource contracts: ${counts.crossPlaneOrganizationResources}`,
    "- Roles: 0",
    "- Grants: 0",
    "",
    "## Reviewed classifications",
    "",
    "| Classification | Tables |",
    "| --- | ---: |",
    ...classifications.map(([classification, count]) => `| ${classification} | ${count} |`),
    "",
    "## Reviewed tables",
    "",
    "| Table | Slice | Classification | Aggregate root | Writer owner | Scope |",
    "| --- | --- | --- | --- | --- | --- |",
    ...reviewed.map((row) => `| ${row.table} | ${row.slice} | ${row.classification} | ${row.aggregateRoot} | ${row.writerOwner} | ${row.requiredScopeKinds.join(", ")} |`),
    "",
    "## Proposed operations",
    "",
    "These definitions are review inputs only; they are not published to `authz.permission` or granted to a role.",
    "",
    "| Permission | Kind | Storage root | Scope | Risk | MFA | SoD |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...operations.map((operation) => `| ${operation.permissionCode} | ${operation.permissionKind} | ${operation.storageRoot} | ${operation.requiredScopeKinds.join(", ")} | ${operation.riskTier} | ${operation.requiresMfa} | ${operation.requiresSod} |`),
    "",
    "## Proposed lifecycle transitions",
    "",
    "| Entity | Transition | From | To | Permission |",
    "| --- | --- | --- | --- | --- |",
    ...lifecycles.flatMap((lifecycle) => lifecycle.transitions.map((transition) =>
      `| ${lifecycle.entityCode} | ${transition.code} | ${transition.from.join(", ")} | ${transition.to} | ${transition.permissionCode} |`)),
    "",
    "## Studio onboarding / Neon organization boundary",
    "",
    "Keycloak proves identity, organization/client admission and assurance only. Studio owns onboarding orchestration and desired-state evidence. TrustIAM projection rows are authorization scope ceilings only. Neon owns the legal-entity, company-code and operating-organization records and their business lifecycle.",
    "",
    `- Direct Studio SQL into Neon: ${organizationBoundary.source.directNeonSql ? "allowed" : "forbidden"}`,
    `- Keycloak meaning: ${organizationBoundary.lifecycleSeparation.keycloakAdmissionMeans}`,
    `- Studio projection grants Neon authority: ${organizationBoundary.source.grantsNeonBusinessAuthority ? "yes" : "no"}`,
    `- Neon applier: ${organizationBoundary.target.applierOwner} (${organizationBoundary.target.implementationStatus})`,
    `- Provisioned status: ${organizationBoundary.target.defaultCreateStatus}; business activation by provisioner: ${organizationBoundary.target.forbidsBusinessActivation ? "forbidden" : "allowed"}`,
    "",
    "| Resource kind | Neon aggregate | Create scope | Apply rule | Activation permission |",
    "| --- | --- | --- | --- | --- |",
    ...organizationBoundary.resources.map((resource) => `| ${resource.resourceKind} | ${resource.targetTable} | ${resource.createScopeKind}/${resource.createScopeCoordinateKey} | ${resource.applyConstraint} | ${resource.activationPermissionCode} |`),
    "",
    "Required before enforcement:",
    "",
    ...organizationBoundary.requiredBeforeEnforcement.map((item) => `- ${item}`),
    "",
    "## Pending tables",
    "",
    ...pending.map((row) => `- ${row.table}`),
    "",
    "## Release conclusion",
    "",
    releaseBlockers.length
      ? `Blocked: ${pending.length} tables still require business classification and ${releaseBlockers.length - pending.length} implementation qualification item(s) remain. Inventory compilation may continue; release compilation must fail.`
      : "Ready for release compiler review; live authorization gates still apply.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates].sort();
}
function relativePath(path: string): string { return relative(dbRoot, path).replace(/\\/g, "/"); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
async function json<T>(path: string): Promise<T> { return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T; }

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const strict = process.argv.includes("--strict");
  const compiled = await compileNeonAuthorizationInventory();
  if (compiled.errors.length) throw new Error(`Neon authorization inventory is invalid:\n- ${compiled.errors.join("\n- ")}`);
  if (strict && compiled.releaseBlockers.length) {
    throw new Error(`Neon authorization release inventory is incomplete: ${compiled.releaseBlockers.length} release blocker(s)`);
  }
  const jsonSource = `${JSON.stringify(compiled.artifact, null, 2)}\n`;
  if (check) {
    const [existingJson, existingReport] = await Promise.all([readFile(outputPath, "utf8"), readFile(reportPath, "utf8")]);
    if (existingJson !== jsonSource || existingReport !== compiled.report) throw new Error("Neon authorization inventory artifacts are stale");
  } else {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all([writeFile(outputPath, jsonSource), writeFile(reportPath, compiled.report)]);
  }
  const counts = (compiled.artifact as { counts: unknown }).counts;
  process.stdout.write(`${JSON.stringify({ mode: check ? "check" : "write", counts, releaseReady: compiled.releaseBlockers.length === 0 }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
