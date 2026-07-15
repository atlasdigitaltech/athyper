#!/usr/bin/env tsx
/**
 * Verify Hold Model A — Phase 10
 *
 * Asserts that:
 *   1. `document.purchase_invoice.is_on_hold` column does NOT exist.
 *   2. `document.purchase_invoice.hold_reason` column does NOT exist.
 *   3. No source file references either column (outside this verifier and
 *      the architecture doc).
 *
 * Hold state is now carried by `purchase_invoice.status='on_hold'` with
 * restoration data in `metadata.hold` (see docs/architecture/p2p.md §3).
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-hold-model.ts
 *
 * Exit code:
 *   0 — both columns absent and no source references
 *   1 — at least one survivor (column exists OR a forbidden reference found)
 */

import pg from "pg";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

const SEARCH_ROOTS = ["server/packages", "apps", "packages", "server/db"];
const ALLOWED_REFS = new Set([
  "server/scripts/verify-hold-model.ts",
  "docs/architecture/p2p.md",
  // dunning_hold_reason on master.customer_qualification is intentionally a
  // different column from purchase_invoice.hold_reason — allowed substring.
]);
const SKIP_DIRECTORIES = new Set([
  "node_modules", "dist", ".next", ".turbo", "coverage", ".git",
]);
const FILE_EXTS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".prisma"];

interface SourceHit { file: string; line_no: number; text: string; }

function walk(dir: string, hits: SourceHit[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) { walk(full, hits); continue; }
    if (!FILE_EXTS.some((ext) => entry.endsWith(ext))) continue;
    const rel = relative(process.cwd(), full).split(sep).join("/");
    if (ALLOWED_REFS.has(rel)) continue;

    let content;
    try { content = readFileSync(full, "utf8"); } catch { continue; }
    const lines = content.split("\n");
    lines.forEach((text, i) => {
      // Match `is_on_hold` as a token. `hold_reason` excludes `dunning_hold_reason`.
      const isOnHold     = /\bis_on_hold\b/.test(text);
      const holdReasonRaw = /\bhold_reason\b/.test(text);
      const dunning      = /\bdunning_hold_reason\b/.test(text);
      if (isOnHold || (holdReasonRaw && !dunning)) {
        hits.push({ file: rel, line_no: i + 1, text: text.trim() });
      }
    });
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  const dbViolations: Array<{ check: string; detail: string }> = [];
  const sourceHits:   SourceHit[] = [];

  try {
    // ── Check 1+2: column existence ────────────────────────────────────────
    const colResult = await pool.query<{ column_name: string }>(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'document'
         AND table_name   = 'purchase_invoice'
         AND column_name  IN ('is_on_hold', 'hold_reason')
    `);
    for (const row of colResult.rows) {
      dbViolations.push({
        check:  "column_exists",
        detail: `document.purchase_invoice.${row.column_name} still exists — should have been dropped`,
      });
    }

    // ── Check 3: source references ────────────────────────────────────────
    for (const root of SEARCH_ROOTS) {
      const full = join(process.cwd(), root);
      try {
        if (statSync(full).isDirectory()) walk(full, sourceHits);
      } catch { /* missing — skip */ }
    }
  } finally {
    await pool.end();
  }

  const totalIssues = dbViolations.length + sourceHits.length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      ok: totalIssues === 0,
      db_violations: dbViolations,
      source_hits:   sourceHits,
    }, null, 2));
  } else {
    console.log(`Hold Model A verification`);
    console.log(`  DB columns checked: is_on_hold, hold_reason on document.purchase_invoice`);
    console.log(`  Source roots scanned: ${SEARCH_ROOTS.join(", ")}`);
    if (totalIssues === 0) {
      console.log("✓ pass — Hold Model A invariants hold");
    } else {
      if (dbViolations.length) {
        console.error(`✗ DB violations (${dbViolations.length}):`);
        for (const v of dbViolations) console.error(`  ${v.check} — ${v.detail}`);
      }
      if (sourceHits.length) {
        console.error(`✗ Source references (${sourceHits.length}):`);
        for (const h of sourceHits) console.error(`  ${h.file}:${h.line_no}  ${h.text}`);
      }
    }
  }

  process.exit(totalIssues === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
