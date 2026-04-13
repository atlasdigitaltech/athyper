#!/usr/bin/env node
// server/db/seed/migrate.ts
//
// Three-phase database provisioner — first-time setup and re-run safe.
//
// Phase 1 – DDL: All structural SQL (schemas, tables, constraints, indexes, triggers, views, RLS)
//   Directories: 00_extensions → 12_function_security  (13_patches excluded — migration-only)
//
// Phase 2 – System Seed: Platform-wide reference and control data
//   Directory: 900_seed_data/010_system/**
//
// Phase 3 – Blueprint + Tenant Seed: Industry blueprints and tenant org data
//   Directories: 900_seed_data/020_blueprint/**, 900_seed_data/030_tenant/**
//
// Usage:
//   tsx src/seed/migrate.ts --phase=1          # DDL only
//   tsx src/seed/migrate.ts --phase=2          # System seed only
//   tsx src/seed/migrate.ts --phase=3          # Blueprint + Tenant seed only
//   tsx src/seed/migrate.ts --all              # Run all three phases sequentially
//   tsx src/seed/migrate.ts --status           # Show status of all SQL files
//   tsx src/seed/migrate.ts --reset            # Drop all schemas and reset tracking
//   tsx src/seed/migrate.ts --force            # Re-run even if checksum unchanged
//   tsx src/seed/migrate.ts --phase=1 --force  # Force-re-run DDL only
//
// Environment variables:
//   DATABASE_ADMIN_URL  — Direct Postgres connection string (required)
//                         Must NOT be PgBouncer. DDL requires a direct connection.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SQL_DIR = join(__dirname, "../sql");

/** Directories that contain DDL (phases 00–12). Excludes 13_patches and 900_seed_data. */
const DDL_DIR_PATTERN = /^(?:0\d|1[0-2])_/;

/** Seed data root directory within sql/ */
const SEED_DATA_DIR = "900_seed_data";

/** Subdirectory prefixes within 900_seed_data/ */
const SYSTEM_PREFIX = "010_system";
const BLUEPRINT_PREFIX = "020_blueprint";
const TENANT_PREFIX = "030_tenant";
const DEMO_PREFIX = "040_demo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 1 | 2 | 3;

export type SqlFile = {
  /** Relative path from SQL_DIR, using forward slashes, e.g. "04_tables/010_core.sql" */
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

/** Discover and classify all SQL files into phases. */
export function discoverSqlFiles(): SqlFile[] {
  const results: SqlFile[] = [];

  const topEntries = readdirSync(SQL_DIR, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const dirPath = join(SQL_DIR, dirName);

    // ── Phase 1: DDL directories (00_* through 12_*) ──────────────────────
    if (DDL_DIR_PATTERN.test(dirName)) {
      const files = readdirSync(dirPath)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const fileName of files) {
        const absPath = join(dirPath, fileName);
        const relPath = `${dirName}/${fileName}`;
        results.push({
          relPath,
          key: relPath.replace(/\.sql$/, ""),
          absPath,
          phase: 1,
          phaseLabel: "DDL",
        });
      }
      continue;
    }

    // ── Seed data root ─────────────────────────────────────────────────────
    if (dirName === SEED_DATA_DIR) {
      const seedEntries = readdirSync(dirPath, { withFileTypes: true }).sort(
        (a, b) => a.name.localeCompare(b.name),
      );

      for (const seedEntry of seedEntries) {
        if (!seedEntry.isDirectory()) continue;
        const subDirName = seedEntry.name;
        const subDirPath = join(dirPath, subDirName);

        let phase: Phase | null = null;
        let phaseLabel = "";

        if (subDirName.startsWith(SYSTEM_PREFIX)) {
          phase = 2;
          phaseLabel = "System Seed";
        } else if (
          subDirName.startsWith(BLUEPRINT_PREFIX) ||
          subDirName.startsWith(TENANT_PREFIX)
        ) {
          phase = 3;
          phaseLabel =
            subDirName.startsWith(BLUEPRINT_PREFIX)
              ? "Blueprint Seed"
              : "Tenant Seed";
        } else if (subDirName.startsWith(DEMO_PREFIX)) {
          // Demo data: phase 3, excluded by default
          phase = 3;
          phaseLabel = "Demo Seed";
        } else {
          continue;
        }

        const absFiles = collectSqlFiles(subDirPath);
        for (const absPath of absFiles) {
          const relPath = relative(SQL_DIR, absPath).replace(/\\/g, "/");
          results.push({
            relPath,
            key: relPath.replace(/\.sql$/, ""),
            absPath,
            phase,
            phaseLabel,
          });
        }
      }
    }
  }

  return results;
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
  opts: { force: boolean; includeDemo: boolean },
): Promise<void> {
  const allFiles = discoverSqlFiles();

  let files = allFiles.filter((f) => phases.includes(f.phase));

  // Exclude demo data unless explicitly requested
  if (!opts.includeDemo) {
    files = files.filter((f) => f.phaseLabel !== "Demo Seed");
  }

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
  const includeDemo = args.includes("--demo");

  try {
    if (status) {
      await runStatus(connectionString);
      return;
    }

    if (reset) {
      await runReset(connectionString);
      // After reset, fall through to run all phases unless only --reset was given
      if (!runAll && !phaseArg) return;
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

    await runPhases(connectionString, phases, { force, includeDemo });
  } catch (err) {
    logError({ msg: "migrate_fatal", error: String(err) });
    process.exit(1);
  }
}

main();
