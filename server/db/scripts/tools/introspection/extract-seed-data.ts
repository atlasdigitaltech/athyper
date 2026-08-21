#!/usr/bin/env tsx
// server/db/scripts/extract.ts
// DEV-ONLY: Experimental seed-extractor. Use with caution — rewrites server/db/seed/ in place.
//
// Rebuilds server/db/seed/ from the live database after a successful --reset --all run.
//
// Classification per file:
//   SIMPLE  — only INSERT INTO statements (no DO blocks / dollar-quoting)
//             Re-extracted from the live DB via pg_dump --inserts.
//             The result is a cleaner, normalised INSERT … ON CONFLICT DO NOTHING file.
//
//   COMPLEX — contains DO $…$ blocks, named dollar-quoting, $$ literals, or
//             hand-crafted subquery logic.
//             Copied verbatim from 900_seed_data_backup — the logic is intentional.
//
// Usage:
//   tsx db/seed/extract-seed.ts               # full rebuild
//   tsx db/seed/extract-seed.ts --dry-run     # preview — no writes
//   tsx db/seed/extract-seed.ts --simple-only # skip complex (copy) files
//   tsx db/seed/extract-seed.ts --complex-only # skip simple (extract) files
//
// Requires:
//   DATABASE_ADMIN_URL  direct Postgres URL (falls back to local dev default)
//   pg_dump 14+         for --on-conflict-do-nothing support

import { spawnSync }    from "node:child_process";
import * as fs          from "node:fs";
import * as path        from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR    = path.resolve(__dirname, "../../..");
const BACKUP    = path.join(DB_DIR, "seed_backup");
const OUTPUT    = path.join(DB_DIR, "seed");

const CONN = process.env.DATABASE_ADMIN_URL
  ?? "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1";

const argv       = process.argv.slice(2);
const DRY        = argv.includes("--dry-run");
const CMPLX_ONLY = argv.includes("--complex-only");
const SMPL_ONLY  = argv.includes("--simple-only");

if (!process.env.DATABASE_ADMIN_URL) {
  console.error(`\n  DATABASE_ADMIN_URL not set — using local default: ${CONN}\n`);
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * True when the file uses dollar-quoted blocks (DO $$, DO $label$, $$ functions,
 * named dollar-quoting like $tenant$ or $demo_le$).
 * These files contain intentional hand-crafted logic and are copied as-is.
 */
function isComplex(sql: string): boolean {
  return (
    /DO\s+\$/i.test(sql)           // DO $$ or DO $label$
    || /\$\$/.test(sql)            // bare $$ (function/trigger bodies)
    || /\$[a-zA-Z_]\w*\$/.test(sql) // named dollar-quoting: $tenant$, $demo_le$
  );
}

/** All unique schema.table pairs found via INSERT INTO in the file, in order. */
function tableRefs(sql: string): { schema: string; table: string }[] {
  const seen = new Set<string>();
  const out: { schema: string; table: string }[] = [];
  const re  = /INSERT\s+INTO\s+["']?(\w+)["']?\.["']?(\w+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const k = `${m[1]}.${m[2]}`.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ schema: m[1].toLowerCase(), table: m[2].toLowerCase() });
    }
  }
  return out;
}

/**
 * Extracts INSERT statements for one table via pg_dump.
 * Returns only the INSERT lines (pg_dump boilerplate stripped).
 * Uses --on-conflict-do-nothing (requires pg_dump 14+).
 */
function pgDump(schema: string, table: string): string {
  const r = spawnSync(
    "pg_dump",
    [
      CONN,
      "--data-only",
      "--inserts",
      "--column-inserts",
      "--on-conflict-do-nothing",
      "--no-comments",
      "--no-privileges",
      "--no-tablespaces",
      `--table=${schema}.${table}`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  if (r.error || r.status !== 0) {
    const msg = (r.stderr ?? "").trim() || String(r.error);
    process.stderr.write(`  WARN  pg_dump ${schema}.${table}: ${msg}\n`);
    return "";
  }

  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("INSERT INTO"))
    .join("\n");
}

/** Recursive sorted .sql file listing under dir. */
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory())               out.push(...walk(fp));
    else if (e.name.endsWith(".sql"))  out.push(fp);
  }
  return out;
}

function write(dest: string, content: string): void {
  if (DRY) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");
}

// ── main ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(BACKUP)) {
    process.stderr.write(
      `ERROR: backup directory not found:\n  ${BACKUP}\n`
      + `Run first: Rename-Item server\\db\\seed server\\db\\seed_backup\n`,
    );
    process.exit(1);
  }

  if (!DRY) fs.mkdirSync(OUTPUT, { recursive: true });

  const files = walk(BACKUP);
  console.log(`Scanning ${files.length} SQL files in seed_backup …`);
  if (DRY) console.log("DRY RUN — no files will be written\n");

  const stats = { extracted: 0, tables: 0, copied: 0 };

  for (const src of files) {
    const rel   = path.relative(BACKUP, src).replace(/\\/g, "/");
    const dest  = path.join(OUTPUT, rel);
    const sql   = fs.readFileSync(src, "utf8");
    const cmplx = isComplex(sql);

    // ── COMPLEX: copy verbatim ──────────────────────────────────────────────
    if (cmplx) {
      if (SMPL_ONLY) continue;
      write(dest, sql);
      stats.copied++;
      console.log(`  COPY     ${rel}`);
      continue;
    }

    if (CMPLX_ONLY) continue;

    // ── SIMPLE: check for INSERT refs ───────────────────────────────────────
    const refs = tableRefs(sql);

    if (refs.length === 0) {
      // SET statements, pure comments, CALL, etc. — copy as-is
      write(dest, sql);
      stats.copied++;
      console.log(`  COPY(misc)  ${rel}`);
      continue;
    }

    // ── SIMPLE with INSERT: extract fresh data from live DB ─────────────────
    const ts  = new Date().toISOString();
    let out   = `-- extracted from live DB\n-- source: ${rel}\n-- generated: ${ts}\n\n`;
    let hasData = false;

    for (const { schema, table } of refs) {
      const data = pgDump(schema, table);
      out += `-- ${schema}.${table}\n${data || "-- (empty table)"}\n\n`;
      if (data) { stats.tables++; hasData = true; }
    }

    write(dest, out);
    stats.extracted++;
    console.log(
      `  EXTRACT  ${rel}  [${refs.map((r) => `${r.schema}.${r.table}`).join(", ")}]`
      + (hasData ? "" : "  ← empty"),
    );
  }

  console.log(
    `\n  Done.  extracted=${stats.extracted} files (${stats.tables} tables)  copied=${stats.copied} files`,
  );
}

main();
