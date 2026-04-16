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
//   tsx db/seed/migrate.ts --phase=1          # DDL only
//   tsx db/seed/migrate.ts --phase=2          # System seed only
//   tsx db/seed/migrate.ts --phase=3          # Blueprint + Tenant seed only
//   tsx db/seed/migrate.ts --all              # Run all three phases sequentially
//   tsx db/seed/migrate.ts --status           # Show status of all SQL files
//   tsx db/seed/migrate.ts --reset            # Drop all schemas and reset tracking
//   tsx db/seed/migrate.ts --force            # Re-run even if checksum unchanged
//   tsx db/seed/migrate.ts --phase=1 --force  # Force-re-run DDL only
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
      } else if (entry.isFile() && entry.name.endsWith(".sql")) {
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
  return match ? parseInt(match[1], 10) : 999;
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

  // Sort DDL files by (layer_number, relPath).
  // Primary key = numeric prefix of the filename (e.g. 00, 01, 03, 800).
  // Secondary key = full relative path (preserves alphabetical schema ordering
  // within each layer — e.g. control/00_bootstrap runs before shared/00_bootstrap,
  // but both run before any 01_tables file in any schema).
  ddlFiles.sort((a, b) => {
    const layerA = extractLayerNumber(basename(a.absPath));
    const layerB = extractLayerNumber(basename(b.absPath));
    if (layerA !== layerB) return layerA - layerB;
    return a.relPath.localeCompare(b.relPath);
  });

  // Seed files retain the recursive-alphabetical directory order.
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
    console.log(
      "  %-16s  %-60s  %-8s  %s",
      "Phase",
      "File",
      "Status",
      "Checksum",
    );
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
        "  %-16s  %-60s  %-8s  %s",
        phaseLabel,
        displayKey,
        status,
        hash,
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

  const phaseArg = args.find((a) => a.startsWith("--phase="));
  const runAll = args.includes("--all");
  const force = args.includes("--force");
  const reset = args.includes("--reset");
  const status = args.includes("--status");

  try {
    if (status) {
      await runStatus(connectionString);
      return;
    }

    if (reset) {
      await runReset(connectionString);
      // After reset, always fall through to re-run all phases from scratch
    }

    let phases: Phase[];

    if (runAll) {
      phases = [1, 2, 3];
    } else if (phaseArg) {
      const n = parseInt(phaseArg.split("=")[1] ?? "", 10);
      if (n !== 1 && n !== 2 && n !== 3) {
        logError({
          msg: "migrate_error",
          error: "--phase must be 1, 2, or 3",
        });
        process.exit(1);
      }
      phases = [n as Phase];
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
