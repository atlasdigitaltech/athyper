#!/usr/bin/env tsx
/**
 * Verify Schedule Line Versioning — Phase 10
 *
 * Asserts the invariants from docs/architecture/p2p.md §5 (schedule_line
 * contract):
 *
 *   1. At most ONE current-version row per (tenant, source_doc_type,
 *      source_line_id, schedule_no) — supersession must atomically flip the
 *      prior row before inserting the new one.
 *   2. For COMMITMENT_LINE schedules, the SUM of `scheduled_quantity` of
 *      current versions equals the parent commitment_line.quantity
 *      (when at least one schedule exists for the line — lines without
 *      schedules are allowed and indicate a single full-line schedule was
 *      not materialised).
 *   3. previous_version_id chain is consistent — every non-NULL
 *      previous_version_id references a row in the same source_line_id chain
 *      with version_number = self.version_number - 1.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-schedule-line-versioning.ts
 *
 * Exit code:
 *   0 — all invariants hold
 *   1 — at least one violation
 */

import pg from "pg";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // ── Check 1: multiple current versions per schedule_no ────────────────
    const multiCurrent = await pool.query<{
      tenant_id: string; source_doc_type: string; source_line_id: string;
      schedule_no: number; current_count: number;
    }>(`
      SELECT tenant_id::text       AS tenant_id,
             source_doc_type,
             source_line_id::text  AS source_line_id,
             schedule_no,
             COUNT(*)::int         AS current_count
        FROM document.schedule_line
       WHERE is_current_version = true
         AND terminal_status    IS NULL
       GROUP BY tenant_id, source_doc_type, source_line_id, schedule_no
      HAVING COUNT(*) > 1
       ORDER BY source_doc_type, source_line_id, schedule_no
    `);

    // ── Check 2: commitment_line quantity ↔ schedule sum ──────────────────
    const qtyMismatches = await pool.query<{
      tenant_id: string; commitment_id: string; commitment_line_id: string;
      line_quantity: string; schedule_sum: string;
    }>(`
      WITH schedule_sums AS (
        SELECT sl.tenant_id,
               sl.source_line_id              AS commitment_line_id,
               SUM(sl.scheduled_quantity)     AS schedule_sum
          FROM document.schedule_line sl
         WHERE sl.source_doc_type    = 'COMMITMENT_LINE'
           AND sl.is_current_version = true
           AND sl.terminal_status    IS NULL
         GROUP BY sl.tenant_id, sl.source_line_id
      )
      SELECT cl.tenant_id::text         AS tenant_id,
             cl.commitment_id::text     AS commitment_id,
             cl.id::text                AS commitment_line_id,
             cl.quantity::text          AS line_quantity,
             ss.schedule_sum::text      AS schedule_sum
        FROM document.commitment_line cl
        JOIN schedule_sums ss
          ON ss.tenant_id          = cl.tenant_id
         AND ss.commitment_line_id = cl.id
       WHERE ABS(cl.quantity - ss.schedule_sum) > 0.0001
       ORDER BY cl.commitment_id, cl.line_no
       LIMIT 100
    `);

    // ── Check 3: previous_version_id chain integrity ─────────────────────
    const brokenChains = await pool.query<{
      tenant_id: string; source_doc_type: string; source_line_id: string;
      child_id: string; child_version: number; prev_id: string;
      expected_prev_version: number; actual_prev_version: number | null;
    }>(`
      SELECT child.tenant_id::text          AS tenant_id,
             child.source_doc_type           AS source_doc_type,
             child.source_line_id::text      AS source_line_id,
             child.id::text                  AS child_id,
             child.version_number            AS child_version,
             child.previous_version_id::text AS prev_id,
             (child.version_number - 1)      AS expected_prev_version,
             parent.version_number           AS actual_prev_version
        FROM document.schedule_line child
        LEFT JOIN document.schedule_line parent
          ON parent.id        = child.previous_version_id
         AND parent.tenant_id = child.tenant_id
       WHERE child.previous_version_id IS NOT NULL
         AND (
              parent.id IS NULL
              OR parent.source_line_id <> child.source_line_id
              OR parent.version_number   <> child.version_number - 1
         )
       ORDER BY child.source_line_id, child.version_number
       LIMIT 100
    `);

    const totalIssues =
      multiCurrent.rows.length + qtyMismatches.rows.length + brokenChains.rows.length;

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:                          totalIssues === 0,
        multi_current_per_schedule:  multiCurrent.rows,
        commitment_qty_mismatches:   qtyMismatches.rows,
        broken_version_chains:       brokenChains.rows,
      }, null, 2));
    } else {
      console.log(`Schedule line versioning invariants`);
      if (totalIssues === 0) {
        console.log("✓ pass — current-version uniqueness, qty totals, and version chains all consistent");
      } else {
        if (multiCurrent.rows.length) {
          console.error(`✗ Multiple current versions per (source_line_id, schedule_no) (${multiCurrent.rows.length}):`);
          for (const r of multiCurrent.rows.slice(0, 20)) {
            console.error(`  ${r.source_doc_type} line=${r.source_line_id} schedule_no=${r.schedule_no} current_count=${r.current_count}`);
          }
        }
        if (qtyMismatches.rows.length) {
          console.error(`✗ commitment_line.quantity ≠ sum(scheduled_quantity) (${qtyMismatches.rows.length}):`);
          for (const r of qtyMismatches.rows.slice(0, 20)) {
            console.error(`  line=${r.commitment_line_id} qty=${r.line_quantity} schedule_sum=${r.schedule_sum}`);
          }
        }
        if (brokenChains.rows.length) {
          console.error(`✗ Broken previous_version_id chains (${brokenChains.rows.length}):`);
          for (const r of brokenChains.rows.slice(0, 20)) {
            console.error(`  child=${r.child_id} v=${r.child_version} expected_prev_v=${r.expected_prev_version} actual_prev_v=${r.actual_prev_version ?? "MISSING"}`);
          }
        }
      }
    }

    process.exit(totalIssues === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
