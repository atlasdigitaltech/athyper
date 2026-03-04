#!/usr/bin/env node
/**
 * db:publish — Single-click Schema Change Lifecycle
 *
 * Orchestrates the full Prisma → Kysely pipeline:
 *
 *   1. Validate   — prisma validate
 *   2. Diff/Plan  — prisma migrate diff (preview SQL, no apply)
 *   3. Migrate    — prisma migrate dev --name <auto> (create + apply)
 *   4. Generate   — prisma generate (Kysely types)
 *   5. Report     — summary of changes
 *
 * Flags:
 *   --dry-run       Stop after step 2 (validate + diff only)
 *   --skip-migrate  Skip step 3 (useful when migration already exists)
 *   --name <name>   Custom migration name (default: auto_YYYYMMDD_HHmmss)
 *
 * Usage:
 *   pnpm db:publish
 *   pnpm db:publish:dry-run
 */

import {
  DB_DIR,
  MIGRATIONS_DIR,
  SCHEMA_PATH,
  run,
  runCapture,
} from "./lib.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublishOptions {
  dryRun: boolean;
  skipMigrate: boolean;
  migrationName: string;
}

interface StepResult {
  step: number;
  name: string;
  status: "ok" | "skipped" | "stopped";
  durationMs: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function autoName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `auto_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function parseArgs(): PublishOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipMigrate = args.includes("--skip-migrate");

  let migrationName = autoName();
  const nameIdx = args.indexOf("--name");
  if (nameIdx !== -1 && args[nameIdx + 1]) {
    migrationName = args[nameIdx + 1];
  }

  return { dryRun, skipMigrate, migrationName };
}

function log(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

/**
 * Env override for Prisma commands that don't connect to the database
 * (validate, diff --script, generate). Prisma still requires DATABASE_URL
 * to be resolvable even for offline operations.
 */
function prismaOfflineEnv(): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://offline:offline@localhost:5432/offline",
  };
}

function banner(step: number, title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Step ${step}: ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

async function stepValidate(): Promise<StepResult> {
  banner(1, "Validate schema");
  const t0 = Date.now();

  await run("pnpm", ["prisma", "validate"], {
    cwd: DB_DIR,
    env: prismaOfflineEnv(),
  });

  return { step: 1, name: "validate", status: "ok", durationMs: Date.now() - t0 };
}

async function stepDiff(): Promise<StepResult> {
  banner(2, "Diff / Plan");
  const t0 = Date.now();

  try {
    const diffSql = await runCapture("pnpm", [
      "prisma", "migrate", "diff",
      "--from-migrations", MIGRATIONS_DIR,
      "--to-schema", SCHEMA_PATH,
      "--script",
    ], { cwd: DB_DIR, env: prismaOfflineEnv() });

    if (diffSql.trim()) {
      console.log("Pending migration SQL:\n");
      console.log(diffSql);
    } else {
      console.log("No schema changes detected — database is up to date.");
    }

    return {
      step: 2,
      name: "diff",
      status: "ok",
      durationMs: Date.now() - t0,
      detail: diffSql.trim() ? "changes_detected" : "no_changes",
    };
  } catch {
    // prisma migrate diff exits non-zero when there ARE changes in some modes.
    // We treat this as informational, not a failure.
    console.log("Diff completed (changes pending).");
    return { step: 2, name: "diff", status: "ok", durationMs: Date.now() - t0, detail: "changes_detected" };
  }
}

async function stepMigrate(opts: PublishOptions): Promise<StepResult> {
  banner(3, "Migrate");
  const t0 = Date.now();

  if (opts.skipMigrate) {
    console.log("Skipped (--skip-migrate).");
    return { step: 3, name: "migrate", status: "skipped", durationMs: 0 };
  }

  // Prefer DATABASE_ADMIN_URL (direct connection) over DATABASE_URL (may be PgBouncer).
  // Prisma migrate needs a direct Postgres connection for advisory locks.
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

  if (!adminUrl) {
    throw new Error(
      "DATABASE_ADMIN_URL or DATABASE_URL is required for migrate step.\n" +
      "Must be a direct Postgres connection (not PgBouncer).\n" +
      "Example: DATABASE_ADMIN_URL=postgres://user:pass@localhost:5432/athyper\n" +
      "Or use --skip-migrate to skip this step.",
    );
  }

  await run("pnpm", [
    "prisma", "migrate", "dev",
    "--name", opts.migrationName,
  ], {
    cwd: DB_DIR,
    env: { ...process.env as Record<string, string>, DATABASE_URL: adminUrl },
  });

  return {
    step: 3,
    name: "migrate",
    status: "ok",
    durationMs: Date.now() - t0,
    detail: opts.migrationName,
  };
}

async function stepGenerate(): Promise<StepResult> {
  banner(4, "Generate (Kysely types)");
  const t0 = Date.now();

  await run("pnpm", ["prisma", "generate"], {
    cwd: DB_DIR,
    env: prismaOfflineEnv(),
  });

  return { step: 4, name: "generate", status: "ok", durationMs: Date.now() - t0 };
}

function stepReport(results: StepResult[]): void {
  banner(5, "Report");

  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log("Pipeline summary:\n");
  for (const r of results) {
    const dur = r.durationMs > 0 ? `${r.durationMs}ms` : "-";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`  ${r.step}. ${r.name.padEnd(10)} ${r.status.padEnd(8)} ${dur}${detail}`);
  }

  console.log(`\n  Total: ${totalMs}ms`);
  console.log("\nSchema Change Lifecycle complete.\n");

  log({
    msg: "publish_complete",
    steps: results.map((r) => ({ step: r.name, status: r.status, ms: r.durationMs })),
    totalMs,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs();
  const results: StepResult[] = [];

  log({
    msg: "publish_start",
    dryRun: opts.dryRun,
    skipMigrate: opts.skipMigrate,
    migrationName: opts.migrationName,
  });

  // Step 1 — Validate
  results.push(await stepValidate());

  // Step 2 — Diff/Plan
  results.push(await stepDiff());

  // Dry-run stops here
  if (opts.dryRun) {
    console.log("\n--dry-run: stopping after diff. No migration applied.\n");
    stepReport(results);
    return;
  }

  // Step 3 — Migrate
  results.push(await stepMigrate(opts));

  // Step 4 — Generate
  results.push(await stepGenerate());

  // Step 5 — Report
  stepReport(results);
}

main().catch((err) => {
  console.error("\n[db:publish] Fatal error:\n");
  console.error(err);
  process.exit(1);
});
