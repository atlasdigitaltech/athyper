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
//   Directory: 900_seed_data/010_system/**
//
// Phase 3 – Blueprint + Tenant + Prod Tenant Seed
//   Directories: 900_seed_data/020_blueprint/**
//                900_seed_data/030_tenant/**
//                900_seed_data/040_prod_tenant/**
//
// Usage:
//   tsx db/seed/migrate.ts                   # Run all three phases (default)
//   tsx db/seed/migrate.ts --all             # Same as default
//   tsx db/seed/migrate.ts --ddl-only        # Phase 1 only (DDL)
//   tsx db/seed/migrate.ts --system-only     # Phase 2 only (010_system seed; DDL must exist)
//   tsx db/seed/migrate.ts --no-demo         # Phases 1+2 (DDL + system, no demo/tenant data)
//   tsx db/seed/migrate.ts --demo-only       # Phases 1+2+3 (all; checksum tracking skips done files)
//   tsx db/seed/migrate.ts --reset           # Drop all schemas then re-run all phases
//   tsx db/seed/migrate.ts --drop-only       # Drop all schemas only (no re-seed)
//   tsx db/seed/migrate.ts --status          # Show status of all SQL files
//   tsx db/seed/migrate.ts --force           # Re-run even if checksum unchanged
//   tsx db/seed/migrate.ts --phase=1         # Low-level: explicit phase number(s)
//   tsx db/seed/migrate.ts --phase=1 --phase=2  # Multiple phases
//
// Environment variables:
//   DATABASE_ADMIN_URL  — Direct Postgres connection string (required)
//                         Must NOT be PgBouncer. DDL requires a direct connection.

import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SQL_DIR = join(__dirname, "../sql");

/** Seed data root directory within sql/ */
const SEED_DATA_DIR = "900_seed_data";

/** Subdirectory prefixes within 900_seed_data/ */
const SYSTEM_PREFIX = "010_system";
const BLUEPRINT_PREFIX = "020_blueprint";
const TENANT_PREFIX = "030_tenant";
const PROD_TENANT_PREFIX = "040_prod_tenant";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 1 | 2 | 3;

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
};

type ExecutionResult = {
  key: string;
  durationMs: number;
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
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".sql") && !entry.name.startsWith("verify")) {
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

/** Discover and classify all SQL files into phases. */
export function discoverSqlFiles(): SqlFile[] {
  const ddlFiles: SqlFile[] = [];
  const seedFiles: SqlFile[] = [];

  const topEntries = readdirSync(SQL_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of topEntries) {
    const dirName = entry.name;
    const dirPath = join(SQL_DIR, dirName);

    // ── Phase 1: DDL (every top-level dir except 900_seed_data) ──────────
    if (dirName !== SEED_DATA_DIR) {
      for (const absPath of collectSqlFiles(dirPath)) {
        const relPath = relative(SQL_DIR, absPath).replace(/\\/g, "/");
        ddlFiles.push({
          relPath,
          key: relPath.replace(/\.sql$/, ""),
          absPath,
          phase: 1,
          phaseLabel: "DDL",
        });
      }
      continue;
    }

    // ── Phases 2 & 3: Seed data ──────────────────────────────────────────
    const seedEntries = readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const seedEntry of seedEntries) {
      const subDirName = seedEntry.name;
      const subDirPath = join(dirPath, subDirName);

      let phase: Phase;
      let phaseLabel: string;

      if (subDirName.startsWith(SYSTEM_PREFIX)) {
        phase = 2;
        phaseLabel = "System Seed";
      } else if (subDirName.startsWith(BLUEPRINT_PREFIX)) {
        phase = 3;
        phaseLabel = "Blueprint Seed";
      } else if (subDirName.startsWith(TENANT_PREFIX)) {
        phase = 3;
        phaseLabel = "Tenant Seed";
      } else if (subDirName.startsWith(PROD_TENANT_PREFIX)) {
        phase = 3;
        phaseLabel = "Prod Tenant Seed";
      } else {
        continue;
      }

      for (const absPath of collectSqlFiles(subDirPath)) {
        const relPath = relative(SQL_DIR, absPath).replace(/\\/g, "/");
        seedFiles.push({
          relPath,
          key: relPath.replace(/\.sql$/, ""),
          absPath,
          phase,
          phaseLabel,
        });
      }
    }
  }

  // Execution order mirrors runner.sh exactly.
  //
  // Phase  0 — 00_platform/*          roles → extensions → schemas → domains
  // Phase 10 — public/* (all layers)  isolated schema, no cross-schema FKs
  // Phase 20 — */00_bootstrap         all schemas, shared first
  // Phase 30 — shared/01_tables*      shared tables before shared functions
  // Phase 35 — shared/05_functions    BEFORE other schemas' tables — master/01f_tables_cms
  //                                   has inline RLS that calls current_tenant_id_soft()
  // Phase 40 — */01_tables*           all remaining schemas (control,master,document,…)
  // Phase 50 — */02_pre_constraint    all schemas
  // Phase 60 — */03_constraints       all schemas
  // Phase 70 — */04_indexes           all schemas
  // Phase 80 — */05_functions         all schemas (shared already ran at phase 35)
  // Phase 90 — */06_triggers          all schemas
  // Phase 100 — */07_views            all schemas
  // Phase 110 — */08_rls              all schemas
  // Phase 120 — 99_security/*         REVOKE / search_path hardening — always last
  //
  // Within each phase, files sort by (schema_order, relPath).
  // Schema order (master before control because control has FKs into master):
  //   shared → master → control → document → ledger → log → event → governance → snapshot → aggregate

  const SCHEMAS: string[] = [
    "shared", "master", "control", "document",
    "ledger", "log", "event", "governance", "snapshot", "aggregate",
  ];

  function schemaIndex(relPath: string): number {
    const schema = relPath.split("/")[0] ?? "";
    const idx = SCHEMAS.indexOf(schema);
    return idx === -1 ? SCHEMAS.length : idx;
  }

  function filePhase(relPath: string, fileName: string): number {
    if (relPath.startsWith("00_platform/"))               return 0;
    if (relPath.startsWith("public/"))                    return 10;
    if (fileName.startsWith("00_"))                       return 20;
    if (relPath.startsWith("shared/") && fileName.startsWith("01")) return 30;
    // shared/02_pre_constraint and shared/05_functions both define functions used
    // inline in master/01f_tables_cms (current_tenant_id, current_tenant_id_soft).
    // They must run after shared/01_tables but before any other schema's 01_tables.
    if (relPath === "shared/02_pre_constraint.sql")       return 35;
    if (relPath === "shared/05_functions.sql")            return 35;
    if (fileName.startsWith("01"))                        return 40;
    if (fileName.startsWith("02_"))                       return 50;
    if (fileName.startsWith("03_"))                       return 60;
    if (fileName.startsWith("04_"))                       return 70;
    if (fileName.startsWith("05_"))                       return 80;
    if (fileName.startsWith("06_"))                       return 90;
    if (fileName.startsWith("07_"))                       return 100;
    if (fileName.startsWith("08_"))                       return 110;
    if (relPath.startsWith("99_security/"))               return 120;
    return 999;
  }

  ddlFiles.sort((a, b) => {
    const phaseA = filePhase(a.relPath, basename(a.absPath));
    const phaseB = filePhase(b.relPath, basename(b.absPath));
    if (phaseA !== phaseB) return phaseA - phaseB;
    // Within 00_platform, preserve internal numeric order (000 < 001 < 002 < 003)
    if (a.relPath.startsWith("00_platform/")) {
      const nA = extractLayerNumber(basename(a.absPath));
      const nB = extractLayerNumber(basename(b.absPath));
      if (nA !== nB) return nA - nB;
    }
    const schemaA = schemaIndex(a.relPath);
    const schemaB = schemaIndex(b.relPath);
    if (schemaA !== schemaB) return schemaA - schemaB;
    return a.relPath.localeCompare(b.relPath);
  });

  // Seed files sort alphabetically with two exceptions within 010_system/:
  //
  // 1. 000_public/000_bootstrap.sql must run FIRST — it creates the system
  //    tenant and system principal (all-zeros UUID) which later seeds reference
  //    as created_by. Alphabetically "000_public" (p=112) sorts after
  //    "000_lookups" (l=108), so we remap it to "000_000_public" (0=48 < l).
  //
  // 2. entity_engine/ must run before 100_finance/ because entity_engine/
  //    020_entities/ registers entity_code values that 100_finance/ seeds
  //    depend on. Alphabetically "e" > "1" so we remap to "009_entity_engine".
  function seedSortKey(relPath: string): string {
    return relPath
      .replace(
        "900_seed_data/010_system/000_public/",
        "900_seed_data/010_system/000_000_public/",
      )
      .replace(
        "900_seed_data/010_system/entity_engine/",
        "900_seed_data/010_system/009_entity_engine/",
      );
  }
  seedFiles.sort((a, b) =>
    seedSortKey(a.relPath).localeCompare(seedSortKey(b.relPath)),
  );

  return [...ddlFiles, ...seedFiles];
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function runPhases(
  connectionString: string,
  phases: Phase[],
  opts: { force: boolean },
): Promise<void> {
  const files = discoverSqlFiles().filter((f) => phases.includes(f.phase));

  if (files.length === 0) {
    log({ msg: "migrate_noop", reason: "no matching SQL files", phases });
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureTrackingTable(client);

    // Set system tenant context so triggers that call shared.current_tenant_id()
    // do not raise during seed execution. The system tenant UUID is the well-known
    // zero UUID established in 900_seed_data/010_system/000_public/000_bootstrap.sql.
    await client.query(
      `SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'`,
    );

    const seedPhases: Phase[] = [2, 3];
    const hasSeedPhase = phases.some((p) => seedPhases.includes(p));
    // seedSetupApplied tracks whether the seed-phase ALTER TABLE / trigger
    // installs have run. They must happen AFTER phase 1 DDL creates the
    // control schema, so we apply them lazily just before the first
    // phase-2/3 file executes rather than eagerly at startup.
    let seedSetupApplied = false;

    const executed = await getExecuted(client);
    const results: ExecutionResult[] = [];

    log({
      msg: "migrate_start",
      phases,
      totalFiles: files.length,
      alreadyExecuted: executed.size,
      force: opts.force,
    });

    for (const file of files) {
      // Apply seed-phase setup once, immediately before the first seed file,
      // so the control schema is guaranteed to exist (phase 1 ran first).
      if (hasSeedPhase && !seedSetupApplied && file.phase >= 2) {
        // 1. Disable entity-binding validation triggers.
        //    Some seed files reference entity codes (e.g. 'bank_branch') that are
        //    stale or not yet registered when the seed file runs. These triggers
        //    enforce entity_code existence in control.entity — valid at runtime but
        //    too strict during trusted initial seeding.
        await client.query(`
          ALTER TABLE control.entity_lifecycle DISABLE TRIGGER trg_el_validate_entity_binding;
          ALTER TABLE control.entity_operation  DISABLE TRIGGER trg_eo_validate_entity_binding;
          ALTER TABLE control.entity_relation   DISABLE TRIGGER trg_er_validate_target_entity;
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
      const prev = executed.get(file.key);

      if (prev === hash && !opts.force) {
        log({ msg: "migrate_skip", file: file.key, reason: "already_executed" });
        continue;
      }

      const startTime = Date.now();
      log({
        msg: "migrate_executing",
        phase: file.phase,
        phaseLabel: file.phaseLabel,
        file: file.key,
        changed: prev != null && prev !== hash,
      });

      try {
        await client.query(sql);
        await markExecuted(client, file.key, hash);

        const durationMs = Date.now() - startTime;
        results.push({ key: file.key, durationMs });

        log({ msg: "migrate_success", file: file.key, durationMs });
      } catch (err) {
        logError({
          msg: "migrate_failed",
          phase: file.phase,
          file: file.key,
          error: String(err),
        });
        throw new Error(`Migration failed at ${file.key}: ${String(err)}`);
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
        ALTER TABLE control.entity_lifecycle ENABLE TRIGGER trg_el_validate_entity_binding;
        ALTER TABLE control.entity_operation  ENABLE TRIGGER trg_eo_validate_entity_binding;
        ALTER TABLE control.entity_relation   ENABLE TRIGGER trg_er_validate_target_entity;

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

async function runStatus(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureTrackingTable(client);

    const executed = await getExecuted(client);
    const allFiles = discoverSqlFiles();

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
      const prev = executed.get(file.key);

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
        file.key.length > 58 ? "…" + file.key.slice(-57) : file.key;
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

  // High-level convenience flags (all idempotent via checksum tracking)
  const ddlOnly    = args.includes("--ddl-only");     // Phase 1 only
  const systemOnly = args.includes("--system-only");  // Phase 2 only (DDL must exist)
  const noDemo     = args.includes("--no-demo");      // Phases 1+2
  const demoOnly   = args.includes("--demo-only");    // Phases 1+2+3 (ensures prerequisites)
  const runAll     = args.includes("--all");

  // Low-level --phase=N flag(s) — all occurrences are collected
  const phaseArgs  = args.filter((a) => a.startsWith("--phase="));

  try {
    if (status) {
      await runStatus(connectionString);
      return;
    }

    if (dropOnly) {
      await runReset(connectionString);
      return;
    }

    if (reset) {
      await runReset(connectionString);
      // After reset, always fall through to re-run all phases from scratch
    }

    let phases: Phase[];

    if (ddlOnly) {
      phases = [1];
    } else if (systemOnly) {
      phases = [2];
    } else if (noDemo) {
      phases = [1, 2];
    } else if (demoOnly || runAll) {
      // demoOnly runs ALL phases — checksum tracking skips already-executed files,
      // so prerequisites (phase 1 DDL, phase 2 system seed) are always guaranteed.
      phases = [1, 2, 3];
    } else if (phaseArgs.length > 0) {
      const parsed = phaseArgs.map((a) => parseInt(a.split("=")[1] ?? "", 10));
      if (parsed.some((n) => n !== 1 && n !== 2 && n !== 3)) {
        logError({
          msg: "migrate_error",
          error: "--phase must be 1, 2, or 3",
        });
        process.exit(1);
      }
      phases = [...new Set(parsed)].sort() as Phase[];
    } else {
      // Default: run all phases
      phases = [1, 2, 3];
    }

    await runPhases(connectionString, phases, { force });
  } catch (err) {
    logError({ msg: "migrate_fatal", error: String(err) });
    process.exit(1);
  }
}

main();
