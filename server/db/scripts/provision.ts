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
//   Directory: 900_seed_data/010_platform/**
//
// Phase 3 – Blueprint + Tenant Seed
//   Directories: 900_seed_data/020_universal/**   (TIER 1 foundation + TIER 2a COA)
//                900_seed_data/030_industry/**    (TIER 2b industry packs + TIER 3 modules)
//                900_seed_data/040_tenants/**     (per-client onboarding)
//
// Usage:
//   tsx db/seed/migrate.ts                   # Run all three stages (default)
//   tsx db/seed/migrate.ts --all             # Same as default
//   tsx db/seed/migrate.ts --ddl-only        # Stage 1 only (DDL)
//   tsx db/seed/migrate.ts --system-only     # Stages 1+2 (DDL + 010_platform seed; DDL idempotent)
//   tsx db/seed/migrate.ts --no-demo         # Stages 1+2 (DDL + system, no demo/tenant data)
//   tsx db/seed/migrate.ts --demo-only       # Stages 1+2+3 (all; checksum tracking skips done files)
//   tsx db/seed/migrate.ts --reset           # Drop all schemas then re-run all stages
//   tsx db/seed/migrate.ts --drop-only       # Drop all schemas only (no re-seed)
//   tsx db/seed/migrate.ts --status          # Show status of all SQL files
//   tsx db/seed/migrate.ts --force           # Re-run even if checksum unchanged
//   tsx db/seed/migrate.ts --invalidate=<key> # Clear tracking row(s) matching <key>
//                                             # then run normally (re-executes cleared files)
//                                             # Use when a dev reset dropped tables but left
//                                             # schema_provisions rows intact.
//   tsx db/seed/migrate.ts --stage=1         # Low-level: explicit stage number(s)
//   tsx db/seed/migrate.ts --phase=1         # Alias for --stage=1
//   tsx db/seed/migrate.ts --stage=1 --stage=2  # Multiple stages
//
// Industry pack selection (030_industry/100_industry_packs/ files are OPT-IN):
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
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DDL_DIR     = join(__dirname, "../ddl");
const SEED_DIR    = join(__dirname, "../seed");
const TENANTS_DIR = join(__dirname, "../tenants");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 1 | 2 | 3;

type Phase3Scope =
  | "blueprint"
  | "post_company"
  | "final_tenant"
  | "tenant_pre_org"
  | "tenant_post_org";

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
  /** Phase 3 only — whitelist of module names inside industry packs */
  modules?: string[];
  /** Phase 3 only — when true, skip all files from the tenants/ directory */
  skipTenants?: boolean;
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
    || tenantRelative.startsWith("100_org_structure/2");
}

function scopedTrackingKey(file: SqlFile): string {
  if (
    file.phase === 3
    && file.tenantFolder
    && (file.phase3Scope === "blueprint"
      || file.phase3Scope === "post_company"
      || file.phase3Scope === "final_tenant")
  ) {
    return `${file.key}@${file.tenantFolder}`;
  }
  return file.key;
}

/** Discover and classify all SQL files into phases. */
export function discoverSqlFiles(opts: DiscoveryOptions = {}): SqlFile[] {
  const ddlFiles: SqlFile[] = [];
  const seedFiles: SqlFile[] = [];
  const postCompanySeedFiles: SqlFile[] = [];
  const finalTenantSeedFiles: SqlFile[] = [];
  const tenantFiles: SqlFile[] = [];

  // ── Phase 1: DDL ─────────────────────────────────────────────────────────
  if (existsSync(DDL_DIR)) {
    for (const absPath of collectSqlFiles(DDL_DIR)) {
      const relPath = `ddl/${relative(DDL_DIR, absPath).replace(/\\/g, "/")}`;
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
    const seedTopEntries = readdirSync(SEED_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of seedTopEntries) {
      const dirName = entry.name;
      const dirPath = join(SEED_DIR, dirName);

      let phase: Phase;
      let phaseLabel: string;

      if (dirName.startsWith("010_platform")) {
        phase = 2;
        phaseLabel = "System Seed";
      } else if (dirName.startsWith("020_universal")) {
        phase = 3;
        phaseLabel = "Blueprint Seed";
      } else if (dirName.startsWith("030_industry")) {
        phase = 3;
        phaseLabel = "Blueprint Seed";
      } else {
        continue;
      }

      for (const absPath of collectSqlFiles(dirPath)) {
        const relFromSeed = relative(SEED_DIR, absPath).replace(/\\/g, "/");
        const relPath = `seed/${relFromSeed}`;
        const isFinalTenantSeed =
          relFromSeed === "020_universal/060_org_structure/303_company_code_tax_fx_links.sql"
          || relFromSeed.startsWith("020_universal/990_validation/");
        const isPostCompanySeed =
          !isFinalTenantSeed
          && (relFromSeed.startsWith("020_universal/060_org_structure/")
            || relFromSeed.startsWith("030_industry/200_org_structure/"));

        // Industry pack filter: files under 030_industry/100_industry_packs/ are
        // excluded by default and must be explicitly opted-in via --industry-pack.
        // Matching supports both "103_pack_transport" and "pack_transport" forms.
        if (phase === 3 && relFromSeed.includes("/100_industry_packs/")) {
          const packFileName = basename(absPath, ".sql");
          const packStripped = packFileName.replace(/^\d+_/, "");
          const allowed = opts.industryPacks ?? [];
          if (!allowed.includes(packFileName) && !allowed.includes(packStripped)) {
            continue;
          }
        }

        // Module filter: include only files whose path contains a matching module name
        if (phase === 3 && opts.modules && opts.modules.length > 0) {
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
          ...(phase === 3 ? { phase3Scope: "blueprint" as const } : {}),
        };

        if (isFinalTenantSeed) {
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
  // Phase  0  — ddl/000_bootstrap/*
  // Phase 10  — ddl/public/* (all layers, isolated)
  // Phase 20  — ddl/*/00_bootstrap (all schemas — BEFORE tables)
  // Phase 30  — ddl/shared/01* (shared tables before shared functions)
  // Phase 35  — ddl/shared/02_pre_constraint, ddl/shared/05_functions
  //             (must run after shared/01_tables but before other schemas' 01_tables)
  // Phase 40  — ddl/*/01* (all remaining schemas)
  // Phase 50  — ddl/*/02_pre_constraint
  // Phase 60  — ddl/*/03_constraints
  // Phase 70  — ddl/*/04_indexes
  // Phase 80  — ddl/*/05_functions
  // Phase 90  — ddl/*/06_triggers
  // Phase 100 — ddl/*/07_views
  // Phase 110 — ddl/*/08_rls
  // Phase 120 — ddl/security/*

  const SCHEMAS: string[] = [
    "shared", "master", "control", "document",
    "ledger", "log", "event", "governance", "snapshot", "aggregate",
  ];

  function schemaIndex(relPath: string): number {
    const schema = relPath.replace(/^ddl\//, "").split("/")[0] ?? "";
    const idx = SCHEMAS.indexOf(schema);
    return idx === -1 ? SCHEMAS.length : idx;
  }

  function filePhase(relPath: string, fileName: string): number {
    if (relPath.startsWith("ddl/000_bootstrap/"))               return 0;
    if (relPath.startsWith("ddl/public/"))                      return 10;
    if (fileName.startsWith("00_"))                             return 20;
    if (relPath.startsWith("ddl/shared/") && fileName.startsWith("01")) return 30;
    if (relPath === "ddl/shared/02_pre_constraint.sql")         return 35;
    if (relPath === "ddl/shared/05_functions.sql")              return 35;
    if (fileName.startsWith("01"))                              return 40;
    if (fileName.startsWith("02_"))                             return 50;
    if (fileName.startsWith("03_"))                             return 60;
    if (fileName.startsWith("04_"))                             return 70;
    if (fileName.startsWith("05_"))                             return 80;
    if (fileName.startsWith("06_"))                             return 90;
    if (fileName.startsWith("07_"))                             return 100;
    if (fileName.startsWith("08_"))                             return 110;
    if (relPath.startsWith("ddl/security/"))                    return 120;
    return 999;
  }

  ddlFiles.sort((a, b) => {
    const phaseA = filePhase(a.relPath, basename(a.absPath));
    const phaseB = filePhase(b.relPath, basename(b.absPath));
    if (phaseA !== phaseB) return phaseA - phaseB;
    // Within 000_bootstrap, preserve internal numeric order (000 < 001 < 002 < 003)
    if (a.relPath.startsWith("ddl/000_bootstrap/")) {
      const nA = extractLayerNumber(basename(a.absPath));
      const nB = extractLayerNumber(basename(b.absPath));
      if (nA !== nB) return nA - nB;
    }
    const schemaA = schemaIndex(a.relPath);
    const schemaB = schemaIndex(b.relPath);
    if (schemaA !== schemaB) return schemaA - schemaB;
    return a.relPath.localeCompare(b.relPath);
  });

  // Seed and tenant files sort alphabetically by relPath. The numeric prefixes
  // in each subfolder name provide the correct execution order.
  seedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));
  postCompanySeedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));
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
      ...tenantPostOrgFiles.filter((file) => file.tenantFolder === tenantFolder),
      ...finalTenantSeedFiles.map((file) => ({ ...file, tenantFolder })),
    );
  }

  const phase3Files = tenantScopedPhase3Files.length > 0
    ? tenantScopedPhase3Files
    : [...blueprintSeedFiles, ...postCompanySeedFiles, ...tenantPostOrgFiles, ...finalTenantSeedFiles];

  return [
    ...ddlFiles,
    ...systemSeedFiles,
    ...phase3Files,
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

async function setSeedTenant(client: pg.Client, tenantId: string): Promise<void> {
  await client.query(`SELECT set_config('app.seed_tenant_id', $1, false)`, [tenantId]);
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
  opts: { force: boolean; tenantId?: string; discovery?: DiscoveryOptions },
): Promise<void> {
  const files = discoverSqlFiles(opts.discovery ?? {}).filter((f) => phases.includes(f.phase));
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

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureTrackingTable(client);

    // Set system tenant context so triggers that call shared.current_tenant_id()
    // do not raise during seed execution. The system tenant UUID is the well-known
    // zero UUID established in 900_seed_data/010_platform/000_bootstrap/000_bootstrap.sql.
    await client.query(
      `SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'`,
    );

    // Set seed tenant for Phase 3 blueprint/tenant provisioning.
    // SQL files under 020_universal/ and 030_industry/ call
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
    const results: ExecutionResult[] = [];

    log({
      msg: "migrate_start",
      phases,
      totalFiles: files.length,
      alreadyExecuted: executed.size,
      force: opts.force,
      seedTenantId: opts.tenantId ?? "(not set — will auto-resolve from master.tenant before Phase 3)",
    });

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
              WHERE tgrelid = 'control.entity_lifecycle'::regclass
                AND tgname = 'trg_el_validate_entity_binding'
            ) THEN
              ALTER TABLE control.entity_lifecycle DISABLE TRIGGER trg_el_validate_entity_binding;
            END IF;

            IF EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'control.entity_operation'::regclass
                AND tgname = 'trg_eo_validate_entity_binding'
            ) THEN
              ALTER TABLE control.entity_operation DISABLE TRIGGER trg_eo_validate_entity_binding;
            END IF;

            IF EXISTS (
              SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'control.entity_relation'::regclass
                AND tgname = 'trg_er_validate_target_entity'
            ) THEN
              ALTER TABLE control.entity_relation DISABLE TRIGGER trg_er_validate_target_entity;
            END IF;
          END
          $seed_trigger_setup$;
        `);

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

          DROP TRIGGER IF EXISTS trg_seed_entity_code_default ON control.entity;
          CREATE TRIGGER trg_seed_entity_code_default
              BEFORE INSERT ON control.entity
              FOR EACH ROW EXECUTE FUNCTION control.trg_fn_seed_entity_code_default();
        `);
        seedSetupApplied = true;
      }

      const sql = readFileSync(file.absPath, "utf-8");
      const hash = checksum(sql);
      const fileKey = scopedTrackingKey(file);
      const prev = executed.get(fileKey);
      const alwaysRun = shouldAlwaysRunSeedFile(file);

      if (prev === hash && !opts.force && !alwaysRun) {
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
        alwaysRun,
      });

      try {
        await client.query(sql);
        await markExecuted(client, fileKey, hash);

        const durationMs = Date.now() - startTime;
        results.push({ key: fileKey, durationMs });

        log({ msg: "migrate_success", file: fileKey, sourceFile: file.key, durationMs });
      } catch (err) {
        const errStr = String(err);

        // Stale-tracking auto-recovery: if any file fails because a relation
        // doesn't exist, the 01_tables tracking row for that schema is stale —
        // tables were dropped (e.g. via a dev reset script) after the last
        // successful run, so checksums matched and the file was silently skipped.
        // This affects both constraints files (03_constraints.sql) and seed files
        // when the constraints file was also skipped (checksum unchanged).
        // Strategy: extract the missing schema from the error message, clear all
        // 01* tracking rows for that schema, and let the next run recreate them.
        if (errStr.toLowerCase().includes("does not exist")) {
          // Parse schema from PostgreSQL error: relation "schema.table" does not exist
          const relationMatch = errStr.match(/"([a-z_]+)\.[a-z_]+"/i);
          const missingSchema = relationMatch?.[1] ?? file.relPath.split("/")[0] ?? "";
          const KNOWN_SCHEMAS = new Set([
            "shared", "master", "control", "document",
            "ledger", "log", "event", "governance", "snapshot", "aggregate",
          ]);
          if (missingSchema && KNOWN_SCHEMAS.has(missingSchema)) {
            try {
              const cleared = await client.query<{ file_name: string }>(
                `DELETE FROM public.schema_provisions
                 WHERE file_name LIKE $1
                 RETURNING file_name`,
                [`${missingSchema}/01%`],
              );
              if (cleared.rows.length > 0) {
                for (const row of cleared.rows) {
                  log({ msg: "migrate_stale_cleared", file: row.file_name });
                }
                log({
                  msg: "migrate_recovery_hint",
                  schema: missingSchema,
                  cleared: cleared.rows.length,
                  message: `Cleared stale table-file tracking for schema "${missingSchema}". Re-run migrate to recreate the missing tables and retry.`,
                });
              }
            } catch {
              // recovery cleanup is best-effort; original error takes precedence
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

    log({
      msg: "migrate_complete",
      phases,
      executed: results.length,
      totalMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    });

    // Tear down seed-phase setup (only if it was actually applied).
    if (seedSetupApplied) {
      await client.query(`
        DO $seed_trigger_teardown$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'control.entity_lifecycle'::regclass
              AND tgname = 'trg_el_validate_entity_binding'
          ) THEN
            ALTER TABLE control.entity_lifecycle ENABLE TRIGGER trg_el_validate_entity_binding;
          END IF;

          IF EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'control.entity_operation'::regclass
              AND tgname = 'trg_eo_validate_entity_binding'
          ) THEN
            ALTER TABLE control.entity_operation ENABLE TRIGGER trg_eo_validate_entity_binding;
          END IF;

          IF EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'control.entity_relation'::regclass
              AND tgname = 'trg_er_validate_target_entity'
          ) THEN
            ALTER TABLE control.entity_relation ENABLE TRIGGER trg_er_validate_target_entity;
          END IF;
        END
        $seed_trigger_teardown$;

        DROP TRIGGER IF EXISTS trg_seed_entity_code_default ON control.entity;
        DROP FUNCTION IF EXISTS control.trg_fn_seed_entity_code_default();
      `);
    }
  } finally {
    await client.end();
  }
}

async function runReset(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    log({ msg: "reset_start" });

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
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      log({ msg: "reset_drop_schema", schema });
    }

    await client.query("DROP TABLE IF EXISTS public.schema_provisions CASCADE");
    await client.query("DROP TABLE IF EXISTS public.migrations CASCADE");

    log({ msg: "reset_complete" });
  } finally {
    await client.end();
  }
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
  const client = new Client({ connectionString });
  try {
    await client.connect();
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

async function runStatus(connectionString: string, discovery: DiscoveryOptions = {}): Promise<void> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
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
      const sql = readFileSync(file.absPath, "utf-8");
      const hash = checksum(sql);
      const fileKey = scopedTrackingKey(file);
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
  const reset = args.includes("--reset");
  const dropOnly = args.includes("--drop-only");
  const status = args.includes("--status");

  // --invalidate=<substring>  Remove matching schema_provisions rows so the
  // next run re-executes those files. Solves the stale-tracking/missing-table
  // inconsistency that occurs after running a dev reset script.
  // Example: tsx migrate.ts --invalidate=master/01j_tables_party_risk
  const invalidateArg = args.find((a) => a.startsWith("--invalidate="));
  const invalidateKey = invalidateArg ? invalidateArg.split("=").slice(1).join("=") : null;

  // High-level convenience flags (all idempotent via checksum tracking)
  const ddlOnly    = args.includes("--ddl-only");     // Stage 1 only
  const systemOnly = args.includes("--system-only");  // Stage 2 only (DDL must exist)
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
        console.log(`    ${scopedTrackingKey(f)}`);
      }
      console.log();
      return;
    }

    if (status) {
      await runStatus(connectionString, discovery);
      return;
    }

    if (dropOnly) {
      await runReset(connectionString);
      return;
    }

    if (invalidateKey) {
      await runInvalidate(connectionString, invalidateKey);
      // Fall through so the normal run immediately re-executes the invalidated files.
    }

    if (reset) {
      await runReset(connectionString);
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

    await runPhases(connectionString, phases, { force, tenantId, discovery });
  } catch (err) {
    const errStr =
      err instanceof AggregateError
        ? `AggregateError(${err.errors.map((e: unknown) => String(e)).join(" | ")})`
        : String(err);
    logError({ msg: "migrate_fatal", error: errStr });
    process.exit(1);
  }
}

main();
