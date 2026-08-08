#!/usr/bin/env node
// server/db/seed/migrate.ts
//
// Three-phase database provisioner — first-time setup and re-run safe.
//
// Phase 1 – DDL: All structural SQL (schema-first layout)
//   Every top-level directory in server/db/sql/ except 900_seed_data is a DDL
//   directory. .sql files are collected recursively, then sorted by the numeric
//   layer prefix in each filename so all bootstrap files (00_*) run before all
//   table files (01_*), table files before constraints (03_*), etc.
//   This mirrors the runner.sh cross-schema phase ordering and preserves the
//   shared.uuidv7() bootstrap dependency.
//
// Phase 2 – System Seed: Platform-wide reference and control data
//   Directory: 900_seed_data/platform/**
//
// Phase 3 – Blueprint + Tenant Seed
//   Directories: 900_seed_data/blueprints/universal/**   (TIER 1 foundation + TIER 2a COA)
//                900_seed_data/blueprints/100_industry_packs/**    (TIER 2b industry packs)
//                900_seed_data/blueprints/modules/**     (TIER 3 module packs)
//                900_seed_data/tenants/**         (per-client onboarding)
//
// Usage:
//   tsx db/seed/migrate.ts                   # Run all three stages (default)
//   tsx db/seed/migrate.ts --all             # Same as default
//   tsx db/seed/migrate.ts --ddl-only        # Stage 1 only (DDL)
//   tsx db/seed/migrate.ts --system-only     # Stages 1+2 (DDL + platform seed; DDL idempotent)
//   tsx db/seed/migrate.ts --no-demo         # Stages 1+2 (DDL + system, no demo/tenant data)
//   tsx db/seed/migrate.ts --demo-only       # Stages 1+2+3 (all; checksum tracking skips done files)
//   tsx db/seed/migrate.ts --with-mesh       # Legacy combined-DB mode; normally use scripts/provision-mesh.ts instead
//   tsx db/seed/migrate.ts --no-mesh         # Explicitly keep Mesh/Mesh-log/Mesh-control out of NEON provisioning (default)
//   tsx db/seed/migrate.ts --reset           # Drop all schemas then re-run all stages
//   tsx db/seed/migrate.ts --reset --confirm LOCAL-AUTH-V2-RESET
//                                             # Guarded local athyper_neon shorthand
//   tsx db/seed/migrate.ts --drop-only       # Drop all schemas only (no re-seed)
//   tsx db/seed/migrate.ts --keep-shared      # Use with --reset/--drop-only to keep `shared`
//   tsx db/seed/migrate.ts --skip-shared      # Skip reseeding shared DDL (`ddl/common/shared/03_tables.sql`) during seed runs
//   tsx db/seed/migrate.ts --status          # Show status of all SQL files
//   tsx db/seed/migrate.ts --force           # Re-run even if checksum unchanged
//   tsx db/seed/migrate.ts --rebuild-entity-metadata
//                                             # Force a system seed and rebuild
//                                             # the control entity metadata graph
//   tsx db/seed/migrate.ts --invalidate=<key> # Clear tracking row(s) matching <key>
//                                             # then run normally (re-executes cleared files)
//                                             # Use when a dev reset dropped tables but left
//                                             # schema_provisions rows intact.
//   tsx db/seed/migrate.ts --stage=1         # Low-level: explicit stage number(s)
//   tsx db/seed/migrate.ts --phase=1         # Alias for --stage=1
//   tsx db/seed/migrate.ts --stage=1 --stage=2  # Multiple stages
//
// Industry pack selection (blueprints/100_industry_packs/ files are OPT-IN):
//   Industry packs are excluded by default — they must be explicitly requested.
//   Without --industry-pack the provisioner runs foundation + COA only (no TIER 2b).
//
//   tsx db/seed/migrate.ts --industry-pack=103_pack_transport
//   tsx db/seed/migrate.ts --industry-pack=pack_transport          # prefix optional
//   tsx db/seed/migrate.ts --industry-pack=103_pack_transport \
//                          --industry-pack=108_pack_mfg_textile    # multiple packs
//
// Environment variables:
//   DATABASE_ADMIN_URL  — Direct Postgres connection string (required)
//                         Must NOT be PgBouncer. DDL requires a direct connection.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { validateMetadataGraph } from "@athyper/svc-metadata";
import {
  acquireProvisionLock,
  assertDestructiveResetAllowed,
  assertPlaneFileBoundary,
  recordSeedExecution,
  registerSeedPack,
  resolveDestructiveResetCliApproval,
  seedReceipt,
} from "../../db/scripts/safe-provision.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DDL_DIR     = join(__dirname, "../../db/ddl");
const SEED_DIR    = join(__dirname, "../../db/seed");
const TENANTS_DIR = join(__dirname, "../seed/tenants/neon");
const MESH_DIR    = join(__dirname, "../seed/tenants/mesh");
const REPO_ROOT   = join(__dirname, "../../..");
const NEON_MANIFEST = join(DDL_DIR, "planes", "neon", "_manifest.txt");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 1 | 2 | 3;

type Phase3Scope =
  | "blueprint"
  | "module"
  | "post_company"
  | "final_tenant"
  | "tenant_pre_org"
  | "tenant_post_org"
  | "plane_seed";

export type SqlFile = {
  /** Relative path from SQL_DIR, using forward slashes, e.g. "control/01_tables.sql" */
  relPath: string;
  /** Tracking key (relPath without extension) */
  key: string;
  /** Absolute filesystem path */
  absPath: string;
  /** Which migration phase this file belongs to */
  phase: Phase;
  /** Human-readable phase label */
  phaseLabel: string;
  /** Tenant folder this Phase 3 file is being applied for, e.g. "030_cirrusatlantic" */
  tenantFolder?: string;
  /** More specific Phase 3 ordering bucket */
  phase3Scope?: Phase3Scope;
};

type ExecutionResult = {
  key: string;
  durationMs: number;
};

export type DiscoveryOptions = {
  /** Phase 3 only — filter to this tenant subfolder (e.g. "030_cirrusatlantic") */
  tenantFolder?: string;
  /** Phase 3 only — whitelist of industry-pack folder names (e.g. ["pack_infocomm"]) */
  industryPacks?: string[];
  /** Phase 3 only — whitelist of module-pack folder names (e.g. ["ap_non_po"]) */
  modules?: string[];
  /** Phase 3 only — when true, skip all files from the tenants/ directory */
  skipTenants?: boolean;
  /** Cutover gate — when true, skip Mesh/Mesh-log/Mesh-control DDL and Mesh plane seed files */
  skipMesh?: boolean;
  /** Phase 1 only — when true, skip shared/* DDL and reseeding of that schema */
  skipShared?: boolean;
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

function logError(data: Record<string, unknown>): void {
  console.error(JSON.stringify(data));
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvDefaults(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = unquoteEnvValue(rawValue ?? "");
  }
}

function loadProvisionEnvDefaults(): void {
  loadEnvDefaults(join(REPO_ROOT, "server", ".env"));
  loadEnvDefaults(join(REPO_ROOT, "stack", "env", ".env"));
}

function localDockerHostFallback(connectionString: string): { connectionString: string; fromHost: string } | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }

  const dockerDbHosts = new Set(["db", "athyper-db-1"]);
  const composeProjectName = process.env.COMPOSE_PROJECT_NAME;
  if (composeProjectName) {
    dockerDbHosts.add(`${composeProjectName}-db-1`);
  }

  if (!dockerDbHosts.has(url.hostname)) {
    return null;
  }

  const fromHost = url.hostname;
  url.hostname = "localhost";
  return { connectionString: url.toString(), fromHost };
}

function isNameResolutionError(err: unknown): boolean {
  const message = String(err);
  return message.includes("getaddrinfo ENOTFOUND");
}

async function connectClient(connectionString: string): Promise<pg.Client> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    return client;
  } catch (err) {
    const fallback = localDockerHostFallback(connectionString);
    if (!fallback || !isNameResolutionError(err)) {
      throw err;
    }

    log({
      msg: "db_connection_retry_localhost",
      fromHost: fallback.fromHost,
      toHost: "localhost",
    });

    const fallbackClient = new Client({ connectionString: fallback.connectionString });
    await fallbackClient.connect();
    return fallbackClient;
  }
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/** Recursively collect all .sql files under a directory, sorted by relative path. */
function collectSqlFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith("_")) walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".sql") && !entry.name.startsWith("verify") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function collectManifestSqlFiles(manifestPath: string): string[] {
  const ddlRoot = resolve(DDL_DIR);
  if (!existsSync(manifestPath)) throw new Error(`DDL manifest not found: ${manifestPath}`);

  return readFileSync(manifestPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((manifestEntry) => {
      if (!manifestEntry.endsWith(".sql")) {
        throw new Error(`DDL manifest entry must be SQL: ${manifestEntry}`);
      }
      const absPath = resolve(DDL_DIR, manifestEntry);
      if (relative(ddlRoot, absPath).startsWith("..") || !existsSync(absPath)) {
        throw new Error(`Invalid or missing DDL manifest entry: ${manifestEntry}`);
      }
      return absPath;
    });
}

function readExpandedSql(absPath: string, includeStack = new Set<string>()): string {
  const resolvedPath = resolve(absPath);
  if (includeStack.has(resolvedPath)) throw new Error(`Recursive SQL include: ${resolvedPath}`);
  includeStack.add(resolvedPath);
  try {
    return readFileSync(resolvedPath, "utf8")
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*\\ir\s+(.+?)\s*$/);
        if (!match?.[1]) return line;
        const includeValue = match[1].trim().replace(/^['"]|['"]$/g, "");
        return readExpandedSql(resolve(dirname(resolvedPath), includeValue), includeStack);
      })
      .join("\n");
  } finally {
    includeStack.delete(resolvedPath);
  }
}

function readProvisionSql(file: SqlFile): string {
  return (file.phase === 1 ? readExpandedSql(file.absPath) : readFileSync(file.absPath, "utf8"))
    .replace(/^\uFEFF/, "");
}

/**
 * Extract the leading numeric layer number from a filename.
 *   "00_bootstrap.sql"      → 0
 *   "01_tables.sql"         → 1
 *   "01a_tables_core.sql"   → 1
 *   "800_security.sql"      → 800
 *   "no-prefix.sql"         → 999  (sorts last)
 */
function extractLayerNumber(fileName: string): number {
  const match = fileName.match(/^(\d+)/);
  return match?.[1] !== undefined ? parseInt(match[1], 10) : 999;
}

function tenantCodeFromFolder(folder: string): string {
  const slug = folder.replace(/^\d+_/, "");
  return slug === "demo" ? "athyper" : slug;
}

function isTenantPreOrgFile(file: SqlFile): boolean {
  const tenantRelative = file.relPath.replace(/^tenants\/[^/]+\//, "");
  return tenantRelative === "000_tenant.sql"
    || tenantRelative === "001_tenant_profile.sql"
    || tenantRelative === "002_demo_tenants.sql"
    || tenantRelative === "003_technostat_production_seed.sql"
    || tenantRelative.startsWith("100_org_structure/1")
    || tenantRelative.startsWith("100_org_structure/2")
    || tenantRelative === "100_org_structure/311_ledger_books.sql";
}

function postCompanyBlueprintOrder(file: SqlFile): number {
  const relPath = file.relPath;
  if (relPath.startsWith("seed/blueprints/universal/060_org_structure/")) return 0;
  if (relPath.startsWith("seed/blueprints/200_industry_org_structure/")) return 10;
  return 50;
}

function scopedTrackingKey(file: SqlFile, explicitTenantId?: string): string {
  if (
    file.phase === 3
    && file.tenantFolder
    && (file.phase3Scope === "blueprint"
      || file.phase3Scope === "module"
      || file.phase3Scope === "post_company"
      || file.phase3Scope === "final_tenant")
  ) {
    return `${file.key}@${file.tenantFolder}`;
  }
  if (
    file.phase === 3
    && explicitTenantId
    && (file.phase3Scope === "blueprint"
      || file.phase3Scope === "module"
      || file.phase3Scope === "post_company"
      || file.phase3Scope === "final_tenant")
  ) {
    return `${file.key}@tenant:${explicitTenantId.toLowerCase()}`;
  }
  return file.key;
}

function cleanIndustryPackArg(value: string): string {
  const fileName = value.trim().replace(/\\/g, "/").split("/").pop() ?? value;
  return fileName.replace(/\.sql$/i, "");
}

function buildIndustryPackIndex(): Map<string, string> {
  const packDir = join(SEED_DIR, "blueprints", "100_industry_packs");
  const index = new Map<string, string>();
  if (!existsSync(packDir)) return index;

  for (const absPath of collectSqlFiles(packDir)) {
    const packFileName = basename(absPath, ".sql");
    const packAlias = packFileName.replace(/^\d+_/, "");
    index.set(packFileName, packFileName);
    index.set(packAlias, packFileName);
  }

  return index;
}

function resolveIndustryPacks(requested?: string[]): Set<string> | undefined {
  if (!requested || requested.length === 0) return undefined;

  const index = buildIndustryPackIndex();
  const resolved = new Set<string>();
  const unknown: string[] = [];

  for (const value of requested) {
    const cleanValue = cleanIndustryPackArg(value);
    const packFileName = index.get(cleanValue);
    if (packFileName) {
      resolved.add(packFileName);
    } else {
      unknown.push(value);
    }
  }

  if (unknown.length > 0) {
    const known = [...new Set(index.values())].sort();
    throw new Error(
      `Unknown --industry-pack value(s): ${unknown.join(", ")}. Known packs: ${known.join(", ")}`,
    );
  }

  return resolved;
}

/** Discover and classify all SQL files into phases. */
export function discoverSqlFiles(opts: DiscoveryOptions = {}): SqlFile[] {
  const ddlFiles: SqlFile[] = [];
  const seedFiles: SqlFile[] = [];
  const moduleSeedFiles: SqlFile[] = [];
  const postCompanySeedFiles: SqlFile[] = [];
  const finalTenantSeedFiles: SqlFile[] = [];
  const tenantFiles: SqlFile[] = [];
  const requestedIndustryPacks = resolveIndustryPacks(opts.industryPacks);

  // ── Phase 1: DDL ─────────────────────────────────────────────────────────
  if (existsSync(DDL_DIR)) {
    for (const absPath of collectManifestSqlFiles(NEON_MANIFEST)) {
      const relPath = `ddl/${relative(DDL_DIR, absPath).replace(/\\/g, "/")}`;
      if (opts.skipShared && relPath.startsWith("ddl/common/shared/")) continue;
      ddlFiles.push({
        relPath,
        key: relPath.replace(/\.sql$/, ""),
        absPath,
        phase: 1,
        phaseLabel: "DDL",
      });
    }
  }

  // ── Phases 2 & 3: Seed data ───────────────────────────────────────────────
  if (existsSync(SEED_DIR)) {
    const seedRoots: Array<{
      relPath: string;
      phase: Phase;
      phaseLabel: string;
      isModuleSeed?: boolean;
    }> = [
      { relPath: "platform", phase: 2, phaseLabel: "System Seed" },
      { relPath: "blueprints/universal", phase: 3, phaseLabel: "Blueprint Seed" },
      { relPath: "blueprints/100_industry_packs", phase: 3, phaseLabel: "Blueprint Seed" },
      { relPath: "blueprints/200_industry_org_structure", phase: 3, phaseLabel: "Blueprint Seed" },
      { relPath: "blueprints/modules", phase: 3, phaseLabel: "Module Seed", isModuleSeed: true },
    ];

    for (const seedRoot of seedRoots) {
      const dirPath = join(SEED_DIR, ...seedRoot.relPath.split("/"));
      if (!existsSync(dirPath)) continue;
      const { phase, phaseLabel } = seedRoot;
      const isModuleSeed = seedRoot.isModuleSeed === true;

      for (const absPath of collectSqlFiles(dirPath)) {
        const relFromSeed = relative(SEED_DIR, absPath).replace(/\\/g, "/");
        const relPath = `seed/${relFromSeed}`;
        const isFinalTenantSeed =
          relFromSeed === "blueprints/universal/060_org_structure/303_company_code_tax_fx_links.sql"
          || relFromSeed.startsWith("blueprints/universal/990_validation/");
        const isPostCompanySeed =
          !isFinalTenantSeed
          && (relFromSeed.startsWith("blueprints/universal/060_org_structure/")
            || relFromSeed.startsWith("blueprints/200_industry_org_structure/"));

        // Industry pack filter: files under blueprints/100_industry_packs/ are
        // excluded by default and must be explicitly opted-in via --industry-pack.
        // Matching supports both "103_pack_transport" and "pack_transport" forms.
        if (phase === 3 && relFromSeed.includes("/100_industry_packs/")) {
          const packFileName = basename(absPath, ".sql");
          if (!requestedIndustryPacks?.has(packFileName)) {
            continue;
          }
        }

        // Module filter: include only module-pack files whose path contains
        // a matching module name. Foundation blueprint files remain available
        // because module packs depend on them.
        if (isModuleSeed && opts.modules && opts.modules.length > 0) {
          const pathParts = relFromSeed.split("/");
          const matches = opts.modules.some((m) =>
            pathParts.some((p) => p === m || p.endsWith(`_${m}`)),
          );
          if (!matches) continue;
        }

        const file: SqlFile = {
          relPath,
          key: relPath.replace(/\.sql$/, ""),
          absPath,
          phase,
          phaseLabel,
          ...(phase === 3 ? { phase3Scope: isModuleSeed ? "module" as const : "blueprint" as const } : {}),
        };

        if (isModuleSeed) {
          moduleSeedFiles.push(file);
        } else if (isFinalTenantSeed) {
          if (!opts.skipTenants) finalTenantSeedFiles.push({ ...file, phase3Scope: "final_tenant" });
        } else if (isPostCompanySeed) {
          if (!opts.skipTenants) postCompanySeedFiles.push({ ...file, phase3Scope: "post_company" });
        } else {
          seedFiles.push(file);
        }
      }
    }
  }

  // ── Phase 3: Tenant provisioning ──────────────────────────────────────────
  if (!opts.skipTenants && existsSync(TENANTS_DIR)) {
    const tenantTopEntries = readdirSync(TENANTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of tenantTopEntries) {
      const dirName = entry.name;
      if (opts.tenantFolder && dirName !== opts.tenantFolder) continue;

      const dirPath = join(TENANTS_DIR, dirName);
      for (const absPath of collectSqlFiles(dirPath)) {
        const relPath = `tenants/${relative(TENANTS_DIR, absPath).replace(/\\/g, "/")}`;
        tenantFiles.push({
          relPath,
          key: relPath.replace(/\.sql$/, ""),
          absPath,
          phase: 3,
          phaseLabel: "Tenant Seed",
          tenantFolder: dirName,
        });
      }
    }
  }

  // ── Sort DDL files by execution order (mirrors runner.sh) ─────────────────
  //
  // Phase  0  — ddl/common/shared/02_domains.sql
  // Phase 10  — ddl/common/shared/03_tables.sql (all layers, isolated)
  // Phase 20  — ddl/*/00_bootstrap (all schemas — BEFORE tables)
  // Phase 30  — ddl/common/shared/03_tables.sql (shared tables before shared functions)
  // Phase 35  — ddl/common/shared/03_tables.sql, ddl/common/shared/07_functions.sql
  //             (must run after shared/01_tables but before other schemas' 01_tables)
  // Phase 40  — ddl/*/01* (all remaining schemas)
  // Phase 50  — ddl/*/02_pre_constraint
  // Phase 60  — ddl/*/03_constraints
  // Phase 70  — ddl/*/04_indexes
  // Phase 80  — ddl/*/05_functions
  // Phase 90  — ddl/*/06_triggers
  // Phase 100 — ddl/*/07_views
  // Phase 110 — ddl/*/08_rls
  // Phase 120 — ddl/common/shared/09_function_search_path_hardening.sql

  // DDL files intentionally retain the explicit Neon manifest order.

  // Seed and tenant files sort alphabetically by relPath. The numeric prefixes
  // in each subfolder name provide the correct execution order.
  seedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));
  moduleSeedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));
  postCompanySeedFiles.sort((a, b) => {
    const orderA = postCompanyBlueprintOrder(a);
    const orderB = postCompanyBlueprintOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.relPath.localeCompare(b.relPath);
  });
  finalTenantSeedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));
  tenantFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  // Phase 3 tenant bootstrap files must run before tenant-scoped blueprint
  // seeds. New tenant onboarding supplies --tenant-id, but the tenant row and
  // company codes are created by these pre-org files.
  const tenantPreOrgFiles = tenantFiles
    .filter(isTenantPreOrgFile)
    .map((file) => ({ ...file, phase3Scope: "tenant_pre_org" as const }));
  const tenantPostOrgFiles = tenantFiles
    .filter((file) => !isTenantPreOrgFile(file))
    .map((file) => ({ ...file, phase3Scope: "tenant_post_org" as const }));
  const systemSeedFiles = seedFiles.filter((file) => file.phase === 2);
  const blueprintSeedFiles = seedFiles.filter((file) => file.phase === 3);

  const tenantFolders = [
    ...new Set(tenantFiles.map((file) => file.tenantFolder).filter((folder): folder is string => !!folder)),
  ];

  const tenantScopedPhase3Files: SqlFile[] = [];
  for (const tenantFolder of tenantFolders) {
    tenantScopedPhase3Files.push(
      ...tenantPreOrgFiles.filter((file) => file.tenantFolder === tenantFolder),
      ...blueprintSeedFiles.map((file) => ({ ...file, tenantFolder })),
      ...postCompanySeedFiles.map((file) => ({ ...file, tenantFolder })),
      ...moduleSeedFiles.map((file) => ({ ...file, tenantFolder })),
      ...tenantPostOrgFiles.filter((file) => file.tenantFolder === tenantFolder),
      ...finalTenantSeedFiles.map((file) => ({ ...file, tenantFolder })),
    );
  }

  const phase3Files = tenantScopedPhase3Files.length > 0
    ? tenantScopedPhase3Files
    : [...blueprintSeedFiles, ...postCompanySeedFiles, ...moduleSeedFiles, ...tenantPostOrgFiles, ...finalTenantSeedFiles];

  // ── Optional legacy combined-database Mesh seeds ──────────────────────────
  // Athyper admin-plane identities/authority must never execute in Neon. They
  // are consumed by the Athyper plane's own foundation/authority workflow.
  // Standalone Mesh uses provision-mesh.ts.
  const planeSeedFiles: SqlFile[] = [];
  for (const [label, dir] of [["Mesh Plane Seed", MESH_DIR]] as const) {
    if (opts.skipMesh) continue;
    if (!existsSync(dir)) continue;
    for (const absPath of collectSqlFiles(dir)) {
      const relPath = `mesh/${relative(dir, absPath).replace(/\\/g, "/")}`;
      planeSeedFiles.push({
        relPath,
        key: relPath.replace(/\.sql$/, ""),
        absPath,
        phase: 3,
        phaseLabel: label,
        phase3Scope: "plane_seed",
      });
    }
  }
  planeSeedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return [
    ...ddlFiles,
    ...systemSeedFiles,
    ...phase3Files,
    ...planeSeedFiles,
  ];
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/** djb2 hash for change detection (not cryptographic). */
function checksum(sql: string): string {
  let hash = 5381;
  for (let i = 0; i < sql.length; i++) {
    hash = ((hash << 5) + hash + sql.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function shouldAlwaysRunSeedFile(file: SqlFile): boolean {
  if (
    file.phase === 2
    && file.key === "seed/platform/003_control/044b_site_warehouse_metadata"
  ) {
    return true;
  }

  // Repair seeds are idempotent health checks, not one-time migrations. They
  // restore tenant lookup/list surfaces when rows were truncated after the
  // original seed was marked executed in public.schema_provisions.
  // The company-code tax/FX linker is a finalization pass over tenant data and
  // should re-check whenever onboarding files add or change company codes.
  return file.phase === 3
    && (/_repair$/i.test(file.key)
      || /303_company_code_tax_fx_links$/i.test(file.key)
      || /999_common_onboarding_assertions$/i.test(file.key));
}

function shouldForceEntityMetadataRebuildFile(file: SqlFile): boolean {
  return file.phase === 2
    && file.key.startsWith("seed/platform/003_control/");
}

// ---------------------------------------------------------------------------
// Tracking Table
// ---------------------------------------------------------------------------

async function ensureTrackingTable(client: pg.Client): Promise<void> {
  // public schema may not exist on fresh databases or after a DROP SCHEMA public
  await client.query(`CREATE SCHEMA IF NOT EXISTS public`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_provisions (
      id          serial primary key,
      file_name   text unique not null,
      checksum    text not null,
      executed_at timestamptz not null default now()
    )
  `);
}

async function getExecuted(client: pg.Client): Promise<Map<string, string>> {
  const result = await client.query<{ file_name: string; checksum: string }>(
    "SELECT file_name, checksum FROM public.schema_provisions ORDER BY id",
  );
  return new Map(result.rows.map((r) => [r.file_name, r.checksum]));
}

async function markExecuted(
  client: pg.Client,
  key: string,
  hash: string,
): Promise<void> {
  await client.query(
    `INSERT INTO public.schema_provisions (file_name, checksum, executed_at)
     VALUES ($1, $2, now())
     ON CONFLICT (file_name) DO UPDATE SET
       checksum = EXCLUDED.checksum,
       executed_at = now()`,
    [key, hash],
  );
}

async function replaySchemaBootstrapAndTables(
  client: pg.Client,
  allFiles: SqlFile[],
  executed: Map<string, string>,
  schema: string,
  stopBeforeTrackingKey?: string,
): Promise<number> {
  const ddlFiles = allFiles.filter((file) =>
    file.phase === 1
    && (file.relPath.startsWith(`ddl/${schema}/00`)
      || file.relPath.startsWith(`ddl/${schema}/01`))
  );

  let replayed = 0;
  for (const ddlFile of ddlFiles) {
    const sql = readFileSync(ddlFile.absPath, "utf-8").replace(/^\uFEFF/, "");
    const hash = checksum(sql);
    const key = scopedTrackingKey(ddlFile);
    if (stopBeforeTrackingKey && key === stopBeforeTrackingKey) break;

    const startTime = Date.now();

    log({
      msg: "migrate_recovery_replay_executing",
      schema,
      file: key,
      sourceFile: ddlFile.key,
    });

    await client.query(sql);
    await markExecuted(client, key, hash);
    executed.set(key, hash);
    replayed += 1;

    log({
      msg: "migrate_recovery_replay_success",
      schema,
      file: key,
      sourceFile: ddlFile.key,
      durationMs: Date.now() - startTime,
    });
  }

  return replayed;
}

const RECOVERABLE_SCHEMAS = new Set([
  "shared", "master", "mesh", "mesh_log", "mesh_control", "control", "document",
  "ledger", "log", "event", "governance", "snapshot", "aggregate",
]);

function schemaFromProvisionError(errStr: string, file: SqlFile): string {
  const schemaMatch = errStr.match(/schema\s+"([a-z_]+)"\s+does not exist/i);
  if (schemaMatch?.[1]) return schemaMatch[1];

  const relationMatch = errStr.match(/"([a-z_]+)\.[a-z_]+"/i);
  if (relationMatch?.[1]) return relationMatch[1];

  const pathParts = file.relPath.split("/");
  if (pathParts[0] === "ddl") return pathParts[1] ?? "";

  return pathParts[0] ?? "";
}

async function setSeedTenant(client: pg.Client, tenantId: string): Promise<void> {
  const actor = await client.query<{ id: string }>(`
    SELECT id::text
      FROM master.principal
     WHERE tenant_id = $1::uuid
       AND status = 'active'
       AND principal_type = 'service_account'
     ORDER BY (code = 'seed-service') DESC, code, id
     LIMIT 1
  `, [tenantId]);
  const actorId = actor.rows[0]?.id;
  if (!actorId) {
    throw new Error(
      `No active tenant-local service-account principal exists for seed tenant ${tenantId}`,
    );
  }

  const currencies = await client.query<{ currency_code: string }>(`
    SELECT DISTINCT functional_currency::text AS currency_code
      FROM master.company_code
     WHERE tenant_id = $1::uuid
       AND status = 'active'
     ORDER BY functional_currency::text
  `, [tenantId]);
  if (currencies.rows.length !== 1 || !currencies.rows[0]?.currency_code) {
    const found = currencies.rows.map((row) => row.currency_code).join(", ") || "none";
    throw new Error(
      `Seed tenant ${tenantId} requires exactly one active company functional currency; found: ${found}`,
    );
  }
  const currencyCode = currencies.rows[0].currency_code;

  await client.query(`
    SELECT
      set_config('app.seed_tenant_id', $1, false),
      set_config('app.current_tenant_id', $1, false),
      set_config('app.current_principal_id', $2, false),
      set_config('app.seed_currency_code', $3, false)
  `, [tenantId, actorId, currencyCode]);
}

async function teardownSeedPhaseSetup(client: pg.Client): Promise<void> {
  await client.query(`
    DO $seed_trigger_teardown$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = to_regclass('control.entity_lifecycle')
          AND tgname = 'trg_el_validate_entity_binding'
      ) THEN
        ALTER TABLE control.entity_lifecycle ENABLE TRIGGER trg_el_validate_entity_binding;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = to_regclass('control.entity_operation')
          AND tgname = 'trg_eo_validate_entity_binding'
      ) THEN
        ALTER TABLE control.entity_operation ENABLE TRIGGER trg_eo_validate_entity_binding;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = to_regclass('control.entity_relation')
          AND tgname = 'trg_er_validate_target_entity'
      ) THEN
        ALTER TABLE control.entity_relation ENABLE TRIGGER trg_er_validate_target_entity;
      END IF;
    END
    $seed_trigger_teardown$;

    DO $seed_entity_trigger_teardown$
    BEGIN
      IF to_regclass('control.entity') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_seed_entity_code_default ON control.entity';
      END IF;
    END
    $seed_entity_trigger_teardown$;

    DROP FUNCTION IF EXISTS control.trg_fn_seed_entity_code_default();
  `);
}

async function resolveTenantIdForFolder(
  client: pg.Client,
  tenantFolder: string,
  explicitTenantId?: string,
): Promise<string> {
  if (explicitTenantId) return explicitTenantId;

  const tenantCode = tenantCodeFromFolder(tenantFolder);
  const result = await client.query<{ id: string }>(
    `SELECT id::text
       FROM master.tenant
      WHERE realm_key = 'athyper'
        AND code = $1
      LIMIT 1`,
    [tenantCode],
  );

  const firstRow = result.rows[0];
  if (!firstRow) {
    throw new Error(
      `Unable to resolve tenant_id for folder "${tenantFolder}" (expected master.tenant code "${tenantCode}")`,
    );
  }

  return firstRow.id;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function runPhases(
  connectionString: string,
  phases: Phase[],
  opts: { force: boolean; rebuildEntityMetadata?: boolean; tenantId?: string; discovery?: DiscoveryOptions },
): Promise<void> {
  const discoveredFiles = discoverSqlFiles(opts.discovery ?? {});
  const selectedIndustryPacks = resolveIndustryPacks(opts.discovery?.industryPacks);
  const selectedIndustryPackCodes = selectedIndustryPacks
    ? [...selectedIndustryPacks]
        .map((packFileName) => packFileName.replace(/^\d+_/, ""))
        .sort()
    : [];
  assertPlaneFileBoundary(
    "neon",
    discoveredFiles.map((file) => file.relPath),
  );
  const files = discoveredFiles.filter((f) => phases.includes(f.phase));
  const tenantFolders = [
    ...new Set(files.map((file) => file.tenantFolder).filter((folder): folder is string => !!folder)),
  ];

  if (files.length === 0) {
    log({ msg: "migrate_noop", reason: "no matching SQL files", phases });
    return;
  }

  if (opts.tenantId && tenantFolders.length > 1) {
    throw new Error(
      "--tenant-id / SEED_TENANT_ID can only be used with one tenant folder. Pass --tenant=<folder> when seeding a specific tenant.",
    );
  }

  const client = await connectClient(connectionString);

  try {
    await acquireProvisionLock(client, "neon");
    await ensureTrackingTable(client);

    // Set system tenant context so triggers that call shared.current_tenant_id()
    // do not raise during seed execution. The system tenant UUID is the well-known
    // zero UUID established by ddl/common/master/12_system_authority_reference_seed.sql.
    await client.query(
      `SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'`,
    );
    if (selectedIndustryPackCodes.length > 0) {
      await client.query(
        `SELECT set_config('app.seed_industry_pack_codes', $1, false)`,
        [selectedIndustryPackCodes.join(",")],
      );
      log({
        msg: "migrate_seed_industry_packs_set",
        industryPackCodes: selectedIndustryPackCodes,
      });
    }

    // Bypass control.entity_version EFFECTIVE-mutation lock during provisioning.
    // The trigger fn_block_effective_version_mutation respects this GUC so the
    // seed can precompute version_hash, normalize labels, etc. on EFFECTIVE rows.
    // Runtime sessions never set this GUC; the lock remains enforced for users.
    await client.query(`SET app.bypass_version_lock = 'true'`);

    // Batch 6F — seed-contract assertions strict mode is OPT-IN. 042o
    // (pre-quarantine) and 100_ (post-quarantine) both gate on this GUC:
    // 'on' -> RAISE EXCEPTION, anything else -> RAISE WARNING.
    //
    // Default is off because there is pre-existing drift outside the P2P
    // batch scope (business_partner / customer entity_field rows; a handful
    // of entity_relation targets like business_unit /
    // company_code_supplier_intent_policy). Promoting strict by default would
    // block every local reset until that separate cleanup batch lands. CI
    // opts in via SEED_STRICT=on once the non-P2P drift is cleared.
    const seedStrict = (process.env["SEED_STRICT"] ?? "off").toLowerCase();
    if (seedStrict === "on" || seedStrict === "true" || seedStrict === "1") {
      await client.query(`SET app.assert_seed_contracts = 'on'`);
      log({ msg: "migrate_seed_strict_enabled" });
    } else {
      log({ msg: "migrate_seed_strict_disabled" });
    }

    if (opts.rebuildEntityMetadata) {
      await client.query(`SET app.rebuild_entity_metadata = 'true'`);
      log({ msg: "migrate_rebuild_entity_metadata_enabled" });
    }

    // Set seed tenant for Phase 3 blueprint/tenant provisioning.
    // SQL files under blueprints/universal/, blueprints/100_industry_packs/,
    // and blueprints/200_industry_org_structure/ call
    // current_setting('app.seed_tenant_id', true)::uuid to scope their inserts.
    // When --tenant-id / SEED_TENANT_ID is supplied, set the session variable
    // once here so every Phase 3 file in this connection inherits it.
    if (opts.tenantId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.tenantId)) {
        throw new Error(`--tenant-id / SEED_TENANT_ID is not a valid UUID: ${opts.tenantId}`);
      }
      if (tenantFolders.length === 0) {
        await setSeedTenant(client, opts.tenantId);
        log({ msg: "migrate_seed_tenant_set", tenantId: opts.tenantId });
      }
    }

    const seedPhases: Phase[] = [2, 3];
    const hasSeedPhase = phases.some((p) => seedPhases.includes(p));
    // seedSetupApplied tracks whether the seed-phase ALTER TABLE / trigger
    // installs have run. They must happen AFTER phase 1 DDL creates the
    // control schema, so we apply them lazily just before the first
    // phase-2/3 file executes rather than eagerly at startup.
    let seedSetupApplied = false;
    // seedTenantResolved tracks whether we have attempted to auto-resolve the
    // seed tenant UUID. Done lazily before the first Phase 3 file so that
    // Phase 2 (which creates the Athyper tenant) has already run. This way
    // a --all run from a clean DB works without needing --tenant-id.
    let seedTenantResolved = !!opts.tenantId || tenantFolders.length > 0;
    let activeTenantFolder: string | undefined;
    let activeTenantId: string | undefined = tenantFolders.length === 0 ? opts.tenantId : undefined;

    const executed = await getExecuted(client);
    const seedReceipts = new Map(
      files
        .filter((file) => file.phase >= 2)
        .map((file) => {
          const source = readFileSync(file.absPath, "utf-8");
          const receipt = seedReceipt({
            plane: "neon",
            packKey: scopedTrackingKey(file, opts.tenantId),
            sourcePath: file.relPath,
            source,
          });
          return [scopedTrackingKey(file, opts.tenantId), receipt] as const;
        }),
    );
    for (const receipt of seedReceipts.values()) {
      await registerSeedPack(client, receipt);
    }
    const results: ExecutionResult[] = [];

    log({
      msg: "migrate_start",
      phases,
      totalFiles: files.length,
      alreadyExecuted: executed.size,
      force: opts.force,
      rebuildEntityMetadata: !!opts.rebuildEntityMetadata,
      seedTenantId: opts.tenantId ?? "(not set — will auto-resolve from master.tenant before Phase 3)",
    });

    let seedLoopSucceeded = false;
    try {
      for (const file of files) {
      if (
        file.phase === 3
        && file.tenantFolder
        && file.phase3Scope !== "tenant_pre_org"
        && activeTenantFolder !== file.tenantFolder
      ) {
        const tenantId = await resolveTenantIdForFolder(client, file.tenantFolder, opts.tenantId);
        await setSeedTenant(client, tenantId);
        activeTenantFolder = file.tenantFolder;
        activeTenantId = tenantId;
        log({
          msg: "migrate_seed_tenant_resolved",
          tenantFolder: file.tenantFolder,
          tenantCode: tenantCodeFromFolder(file.tenantFolder),
          tenantId,
        });
      }

      // Auto-resolve seed tenant UUID once, immediately before the first Phase 3
      // file, so Phase 2 (which bootstraps the Athyper tenant) has already run.
      // Skipped when --tenant-id / SEED_TENANT_ID was explicitly provided.
      if (file.phase === 3 && !seedTenantResolved) {
        seedTenantResolved = true;
        try {
          const row = await client.query<{ id: string }>(
            `SELECT id::text FROM master.tenant WHERE code = 'athyper' LIMIT 1`,
          );
          const firstRow = row.rows[0];
          if (firstRow) {
            const resolvedId = firstRow.id;
            await setSeedTenant(client, resolvedId);
            activeTenantId = resolvedId;
            log({ msg: "migrate_seed_tenant_resolved", tenantId: resolvedId });
          }
        } catch {
          // master.tenant not accessible yet — SQL files will raise their own error
        }
      }

      // Apply seed-phase setup once, immediately before the first seed file,
      // so the control schema is guaranteed to exist (phase 1 ran first).
      if (hasSeedPhase && !seedSetupApplied && file.phase >= 2) {
        // 1. Disable entity-binding validation triggers.
        //    Some seed files reference entity codes (e.g. 'bank_branch') that are
        //    stale or not yet registered when the seed file runs. These triggers
        //    enforce entity_code existence in control.entity — valid at runtime but
        //    too strict during trusted initial seeding.
        await client.query(`
          DO $seed_trigger_setup$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgrelid = to_regclass('control.entity_lifecycle')
                AND tgname = 'trg_el_validate_entity_binding'
            ) THEN
              ALTER TABLE control.entity_lifecycle DISABLE TRIGGER trg_el_validate_entity_binding;
            END IF;

            IF EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgrelid = to_regclass('control.entity_operation')
                AND tgname = 'trg_eo_validate_entity_binding'
            ) THEN
              ALTER TABLE control.entity_operation DISABLE TRIGGER trg_eo_validate_entity_binding;
            END IF;

            IF EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgrelid = to_regclass('control.entity_relation')
                AND tgname = 'trg_er_validate_target_entity'
            ) THEN
              ALTER TABLE control.entity_relation DISABLE TRIGGER trg_er_validate_target_entity;
            END IF;
          END
          $seed_trigger_setup$;
        `);
        seedSetupApplied = true;

        // 2. Install a temporary BEFORE INSERT trigger on control.entity that
        //    derives entity_code from name when the caller omits it.
        //    Several 100_finance seed files pre-date the entity_code NOT NULL column
        //    and do not include it in their INSERT column lists. Deriving from name
        //    is safe because name values in these files already satisfy the
        //    entity_code_fmt_chk regex ('^[a-z][a-z0-9_]*$').
        //    The trigger and its function are dropped after seeding completes.
        await client.query(`
          CREATE OR REPLACE FUNCTION control.trg_fn_seed_entity_code_default()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
              IF NEW.entity_code IS NULL THEN
                  NEW.entity_code := NEW.name;
              END IF;
              RETURN NEW;
          END;
          $$;

          DO $seed_entity_trigger_setup$
          BEGIN
            IF to_regclass('control.entity') IS NOT NULL THEN
              EXECUTE 'DROP TRIGGER IF EXISTS trg_seed_entity_code_default ON control.entity';
              EXECUTE 'CREATE TRIGGER trg_seed_entity_code_default
                         BEFORE INSERT ON control.entity
                         FOR EACH ROW EXECUTE FUNCTION control.trg_fn_seed_entity_code_default()';
            END IF;
          END
          $seed_entity_trigger_setup$;
        `);
      }

      const sql = readProvisionSql(file);
      const hash = checksum(sql);
      const fileKey = scopedTrackingKey(file, opts.tenantId);
      const prev = executed.get(fileKey);
      const alwaysRun = shouldAlwaysRunSeedFile(file);
      const forceFile = opts.force
        || (!!opts.rebuildEntityMetadata && shouldForceEntityMetadataRebuildFile(file));

      if (prev === hash && !forceFile && !alwaysRun) {
        log({ msg: "migrate_skip", file: fileKey, sourceFile: file.key, reason: "already_executed" });
        continue;
      }

      const startTime = Date.now();
      log({
        msg: "migrate_executing",
        phase: file.phase,
        phaseLabel: file.phaseLabel,
        file: fileKey,
        sourceFile: file.key,
        tenantFolder: file.tenantFolder,
        tenantId: activeTenantId,
        changed: prev != null && prev !== hash,
        forced: forceFile && prev === hash,
        alwaysRun,
      });

      try {
        await client.query(sql);
        await markExecuted(client, fileKey, hash);
        const receipt = seedReceipts.get(fileKey);
        if (receipt) {
          await recordSeedExecution(
            client,
            receipt,
            forceFile ? "forced_reseed" : prev === undefined
              ? "clean"
              : "upgrade",
          );
        }

        const durationMs = Date.now() - startTime;
        results.push({ key: fileKey, durationMs });

        log({ msg: "migrate_success", file: fileKey, sourceFile: file.key, durationMs });
      } catch (err) {
        let errStr = String(err);

        // Stale-tracking auto-recovery: if any file fails because a relation
        // doesn't exist, the bootstrap/table tracking rows for that schema are stale —
        // tables were dropped (e.g. via a dev reset script) after the last
        // successful run, so checksums matched and the file was silently skipped.
        // This affects both constraints files (03_constraints.sql) and seed files
        // when the constraints file was also skipped (checksum unchanged).
        // Strategy: extract the missing schema from the error message, clear all
        // 00*/01* tracking rows for that schema, replay them, and retry once.
        if (errStr.toLowerCase().includes("does not exist")) {
          const missingSchema = schemaFromProvisionError(errStr, file);
          if (missingSchema && RECOVERABLE_SCHEMAS.has(missingSchema)) {
            try {
              const cleared = await client.query<{ file_name: string }>(
                `DELETE FROM public.schema_provisions
                 WHERE file_name LIKE $1
                    OR file_name LIKE $2
                 RETURNING file_name`,
                [`ddl/${missingSchema}/00%`, `ddl/${missingSchema}/01%`],
              );
              const canReplayCurrentDdl = file.phase === 1 && file.relPath.startsWith(`ddl/${missingSchema}/`);
              if (cleared.rows.length > 0 || canReplayCurrentDdl) {
                for (const row of cleared.rows) {
                  log({ msg: "migrate_stale_cleared", file: row.file_name });
                }
                log({
                  msg: "migrate_recovery_hint",
                  schema: missingSchema,
                  cleared: cleared.rows.length,
                  message: `Cleared stale DDL tracking for schema "${missingSchema}". Replaying bootstrap/table DDL and retrying current file.`,
                });

                const replayed = await replaySchemaBootstrapAndTables(
                  client,
                  discoveredFiles,
                  executed,
                  missingSchema,
                  canReplayCurrentDdl ? fileKey : undefined,
                );

                if (replayed > 0) {
                  log({
                    msg: "migrate_recovery_retrying",
                    schema: missingSchema,
                    replayed,
                    file: fileKey,
                    sourceFile: file.key,
                  });

                  const retryStartTime = Date.now();
                  try {
                    await client.query(sql);
                    await markExecuted(client, fileKey, hash);

                    const durationMs = Date.now() - retryStartTime;
                    results.push({ key: fileKey, durationMs });

                    log({
                      msg: "migrate_success",
                      file: fileKey,
                      sourceFile: file.key,
                      durationMs,
                      recovered: true,
                    });
                    continue;
                  } catch (retryErr) {
                    errStr = String(retryErr);
                    logError({
                      msg: "migrate_recovery_retry_failed",
                      schema: missingSchema,
                      file: fileKey,
                      sourceFile: file.key,
                      error: errStr,
                    });
                  }
                }
              }
            } catch (recoveryErr) {
              logError({
                msg: "migrate_recovery_failed",
                schema: missingSchema,
                file: fileKey,
                sourceFile: file.key,
                error: String(recoveryErr),
              });
            }
          }
        }

        logError({
          msg: "migrate_failed",
          phase: file.phase,
          file: fileKey,
          sourceFile: file.key,
          error: errStr,
        });
        throw new Error(`Migration failed at ${fileKey}: ${errStr}`);
      }
    }
      seedLoopSucceeded = true;
    } finally {
      if (seedSetupApplied) {
        try {
          await teardownSeedPhaseSetup(client);
          seedSetupApplied = false;
        } catch (err) {
          logError({
            msg: "migrate_seed_setup_teardown_failed",
            error: String(err),
          });
          if (seedLoopSucceeded) {
            throw err;
          }
        }
      }
    }

    if (opts.rebuildEntityMetadata) {
      const graphValidation = await validateMetadataGraph({
        query: <T extends object>(text: string, values?: readonly unknown[]) =>
          client.query<T>(text, values ? [...values] : undefined),
      });
      if (!graphValidation.passed) {
        const diagnostics = graphValidation.diagnostics.map((diagnostic) => ({
          entityCode: diagnostic.entityCode,
          code: diagnostic.code,
          path: diagnostic.path,
          message: diagnostic.message,
        }));
        logError({
          msg: "metadata_graph_preflight_failed",
          diagnostics,
        });
        throw new Error(`Metadata graph preflight failed with ${diagnostics.length} diagnostic(s).`);
      }
      log({
        msg: "metadata_graph_preflight_passed",
        eligibleEntities: graphValidation.eligibleEntityCodes.length,
      });
    }

    log({
      msg: "migrate_complete",
      phases,
      executed: results.length,
      totalMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    });
  } finally {
    await client.end();
  }
}

async function runReset(
  connectionString: string,
  options: {
    keepSharedSchema?: boolean;
    expectedDatabase: string;
    acknowledgement: string;
    disposableEnvironmentMarker: string;
    executionProfile: string;
    approvalLabel: string;
    refreshDisposableFingerprint?: boolean;
  },
): Promise<void> {
  const client = await connectClient(connectionString);

  try {
    await acquireProvisionLock(client, "neon");
    await assertDestructiveResetAllowed(client, {
      plane: "neon",
      expectedDatabase: options.expectedDatabase,
      acknowledgement: options.acknowledgement,
      disposableEnvironmentMarker: options.disposableEnvironmentMarker,
      executionProfile: options.executionProfile,
      approvalLabel: options.approvalLabel,
      refreshDisposableFingerprint: options.refreshDisposableFingerprint,
    });
    log({ msg: "reset_start" });
    await prepareResetConnection(client);

    const schemas = [
      "shared",
      "control",
      "master",
      "document",
      "ledger",
      "log",
      "event",
      "governance",
      "snapshot",
      "aggregate",
    ];

    for (const schema of schemas) {
      if (schema === "shared" && options.keepSharedSchema) {
        log({ msg: "reset_keep_schema", schema });
        continue;
      }
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      log({ msg: "reset_drop_schema", schema });
    }

    await client.query("DROP TABLE IF EXISTS public.schema_provisions CASCADE");
    await client.query("DROP TABLE IF EXISTS public.migrations CASCADE");
    await client.query("DROP TABLE IF EXISTS public.seed_pack_execution_v2 CASCADE");
    await client.query("DROP TABLE IF EXISTS public.seed_pack_ledger_v2 CASCADE");

    log({ msg: "reset_complete" });
  } finally {
    await client.end();
  }
}

async function prepareResetConnection(client: pg.Client): Promise<void> {
  await client.query(`SET lock_timeout = '15s'`);
  await client.query(`SET statement_timeout = '10min'`);

  const blockers = await client.query<{
    pid: number;
    application_name: string | null;
    state: string | null;
  }>(`
    SELECT pid, application_name, state
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
  `);

  if (blockers.rows.length === 0) return;

  log({
    msg: "reset_terminating_existing_sessions",
    count: blockers.rows.length,
    sessions: blockers.rows.map((row) => ({
      pid: row.pid,
      applicationName: row.application_name,
      state: row.state,
    })),
  });

  await client.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
  `);
}

/**
 * Delete schema_provisions rows whose file_name contains the given substring.
 * Used to recover from inconsistent state where a file was marked executed but
 * its DB objects no longer exist (e.g. after running a dev reset script).
 *
 * Usage:  tsx migrate.ts --invalidate=master/01j_tables_party_risk
 *         tsx migrate.ts --invalidate=master/01j   (matches all files with that prefix)
 */
async function runInvalidate(
  connectionString: string,
  pattern: string,
): Promise<void> {
  const client = await connectClient(connectionString);
  try {
    await ensureTrackingTable(client);
    const result = await client.query<{ file_name: string }>(
      `DELETE FROM public.schema_provisions
       WHERE file_name LIKE $1
       RETURNING file_name`,
      [`%${pattern}%`],
    );
    if (result.rows.length === 0) {
      log({ msg: "invalidate_noop", pattern, reason: "no matching rows" });
    } else {
      for (const row of result.rows) {
        log({ msg: "invalidate_removed", file: row.file_name });
      }
      log({ msg: "invalidate_complete", removed: result.rows.length });
    }
  } finally {
    await client.end();
  }
}

async function runStatus(
  connectionString: string,
  discovery: DiscoveryOptions = {},
  tenantId?: string,
): Promise<void> {
  const client = await connectClient(connectionString);

  try {
    await ensureTrackingTable(client);

    const executed = await getExecuted(client);
    const allFiles = discoverSqlFiles(discovery);

    const PHASE_LABELS: Record<Phase, string> = {
      1: "DDL",
      2: "System Seed",
      3: "Blueprint/Tenant",
    };

    let pending = 0;
    let changed = 0;
    let ok = 0;

    console.log("\n  Database Migration Status\n");
    console.log(`  ${"Phase".padEnd(16)}  ${"File".padEnd(60)}  ${"Status".padEnd(8)}  Checksum`);
    console.log("  " + "-".repeat(100));

    let lastPhase = 0;
    for (const file of allFiles) {
      const sql = readProvisionSql(file);
      const hash = checksum(sql);
      const fileKey = scopedTrackingKey(file, tenantId);
      const prev = executed.get(fileKey);

      let status: string;
      if (!prev) {
        status = "PENDING";
        pending++;
      } else if (prev !== hash) {
        status = "CHANGED";
        changed++;
      } else {
        status = "OK";
        ok++;
      }

      const phaseLabel =
        file.phase !== lastPhase ? PHASE_LABELS[file.phase] : "";
      if (file.phase !== lastPhase) lastPhase = file.phase;

      const displayKey =
        fileKey.length > 58 ? "…" + fileKey.slice(-57) : fileKey;
      console.log(
        `  ${phaseLabel.padEnd(16)}  ${displayKey.padEnd(60)}  ${status.padEnd(8)}  ${hash}`,
      );
    }

    console.log(
      "\n  Total: %d | OK: %d | Pending: %d | Changed: %d\n",
      allFiles.length,
      ok,
      pending,
      changed,
    );
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadProvisionEnvDefaults();

  const args = process.argv.slice(2);

  const LOCAL_DEFAULT =
    "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1";
  const connectionString = process.env.DATABASE_ADMIN_URL ?? LOCAL_DEFAULT;

  if (!process.env.DATABASE_ADMIN_URL) {
    console.error(
      `\n  DATABASE_ADMIN_URL not set — using local default: ${LOCAL_DEFAULT}\n`,
    );
  }

  const force = args.includes("--force");
  const rebuildEntityMetadata =
    args.includes("--rebuild-entity-metadata")
    || /^(1|true|on|yes)$/i.test(process.env.REBUILD_ENTITY_METADATA ?? "");
  const reset = args.includes("--reset");
  const dropOnly = args.includes("--drop-only");
  const keepShared = args.includes("--keep-shared");
  const status = args.includes("--status");
  const destructiveApproval = resolveDestructiveResetCliApproval(
    args,
    "neon",
    process.env.ATHYPER_DISPOSABLE_ENVIRONMENT,
  );

  // --invalidate=<substring>  Remove matching schema_provisions rows so the
  // next run re-executes those files. Solves the stale-tracking/missing-table
  // inconsistency that occurs after running a dev reset script.
  // Example: tsx migrate.ts --invalidate=master/01j_tables_party_risk
  const invalidateArg = args.find((a) => a.startsWith("--invalidate="));
  const invalidateKey = invalidateArg ? invalidateArg.split("=").slice(1).join("=") : null;

  // High-level convenience flags (all idempotent via checksum tracking)
  const ddlOnly    = args.includes("--ddl-only");     // Stage 1 only
  const systemOnly = args.includes("--system-only");  // Stages 1+2
  const noDemo     = args.includes("--no-demo");      // Stages 1+2
  const demoOnly   = args.includes("--demo-only");    // Stages 1+2+3 (ensures prerequisites)
  const runAll     = args.includes("--all");

  // Low-level --stage=N flag(s) — all occurrences are collected
  const stageArgs  = args.filter((a) => a.startsWith("--stage=") || a.startsWith("--phase="));

  // Tenant UUID for Stage 3 blueprint/tenant provisioning.
  // CLI flag takes precedence over environment variable.
  const tenantIdArg = args.find((a) => a.startsWith("--tenant-id="));
  const tenantId    = tenantIdArg
    ? tenantIdArg.split("=").slice(1).join("=")   // preserve any = in UUID (shouldn't happen, but safe)
    : process.env.SEED_TENANT_ID;

  // Scoped Phase 3 discovery options
  const discover = args.includes("--discover");
  const skipTenants = args.includes("--skip-tenants");
  const skipMesh = args.includes("--no-mesh") || !args.includes("--with-mesh");
  const skipShared = args.includes("--skip-shared") || keepShared;

  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const tenantFolder = tenantArg ? tenantArg.split("=").slice(1).join("=") : undefined;

  const industryPackArgs = args.filter((a) => a.startsWith("--industry-pack="));
  const industryPacks = industryPackArgs.length > 0
    ? industryPackArgs.map((a) => a.split("=").slice(1).join("="))
    : undefined;

  const moduleArgs = args.filter((a) => a.startsWith("--module="));
  const modules = moduleArgs.length > 0
    ? moduleArgs.map((a) => a.split("=").slice(1).join("="))
    : undefined;

  const discovery: DiscoveryOptions = {
    ...(tenantFolder ? { tenantFolder } : {}),
    ...(industryPacks ? { industryPacks } : {}),
    ...(modules ? { modules } : {}),
    ...(skipTenants ? { skipTenants: true } : {}),
    ...(skipShared ? { skipShared: true } : {}),
    ...(skipMesh ? { skipMesh: true } : {}),
  };

  try {
    if (discover) {
      const files = discoverSqlFiles(discovery);
      console.log(`\n  Discovered ${files.length} SQL files\n`);
      let lastPhase = 0;
      for (const f of files) {
        if (f.phase !== lastPhase) {
          console.log(`\n  Phase ${f.phase} — ${f.phaseLabel}`);
          lastPhase = f.phase;
        }
        console.log(`    ${scopedTrackingKey(f, tenantId)}`);
      }
      console.log();
      return;
    }

    if (status) {
      await runStatus(connectionString, discovery, tenantId);
      return;
    }

    if (dropOnly) {
      await runReset(connectionString, {
        keepSharedSchema: keepShared,
        expectedDatabase: destructiveApproval.expectedDatabase,
        acknowledgement: destructiveApproval.acknowledgement,
        disposableEnvironmentMarker:
          destructiveApproval.disposableEnvironmentMarker,
        executionProfile: destructiveApproval.executionProfile,
        approvalLabel: destructiveApproval.approvalLabel,
        refreshDisposableFingerprint:
          destructiveApproval.confirmationShorthandUsed,
      });
      return;
    }

    if (invalidateKey) {
      await runInvalidate(connectionString, invalidateKey);
      // Fall through so the normal run immediately re-executes the invalidated files.
    }

    if (reset) {
      await runReset(connectionString, {
        keepSharedSchema: keepShared,
        expectedDatabase: destructiveApproval.expectedDatabase,
        acknowledgement: destructiveApproval.acknowledgement,
        disposableEnvironmentMarker:
          destructiveApproval.disposableEnvironmentMarker,
        executionProfile: destructiveApproval.executionProfile,
        approvalLabel: destructiveApproval.approvalLabel,
        refreshDisposableFingerprint:
          destructiveApproval.confirmationShorthandUsed,
      });
      // After reset, always fall through to re-run all stages from scratch
    }

    let phases: Phase[];

    if (ddlOnly) {
      phases = [1];
    } else if (systemOnly) {
      // Always include Phase 1 — DDL is idempotent (checksum tracking skips done files)
      // and must precede Phase 2 to guarantee all tables exist (e.g. after a dev reset).
      phases = [1, 2];
    } else if (noDemo) {
      phases = [1, 2];
    } else if (demoOnly || runAll) {
      // demoOnly runs ALL stages — checksum tracking skips already-executed files,
      // so prerequisites (stage 1 DDL, stage 2 system seed) are always guaranteed.
      phases = [1, 2, 3];
    } else if (stageArgs.length > 0) {
      const parsed = stageArgs.map((a) => parseInt(a.split("=")[1] ?? "", 10));
      if (parsed.some((n) => n !== 1 && n !== 2 && n !== 3)) {
        logError({
          msg: "migrate_error",
          error: "--stage/--phase must be 1, 2, or 3",
        });
        process.exit(1);
      }
      phases = [...new Set(parsed)].sort() as Phase[];
    } else {
      // Default: run all stages
      phases = [1, 2, 3];
    }

    await runPhases(connectionString, phases, {
      force,
      rebuildEntityMetadata,
      tenantId,
      discovery,
    });
  } catch (err) {
    const errStr =
      err instanceof AggregateError
        ? `AggregateError(${err.errors.map((e: unknown) => String(e)).join(" | ")})`
        : String(err);
    const databaseError = err as {
      code?: string;
      detail?: string;
      where?: string;
      position?: string;
      routine?: string;
    };
    logError({
      msg: "migrate_fatal",
      error: errStr,
      code: databaseError.code,
      detail: databaseError.detail,
      where: databaseError.where,
      position: databaseError.position,
      routine: databaseError.routine,
    });
    process.exit(1);
  }
}

main();
