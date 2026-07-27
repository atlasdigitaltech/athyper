#!/usr/bin/env tsx
/**
 * Verify No Orphan JE — Phase 10
 *
 * Asserts that every posted journal_entry has at least one corresponding
 * ledger.gl_balance row. An "orphan JE" is a posted journal_entry whose
 * journal_lines did not get materialised into gl_balance — typically caused
 * by a posting path that skipped postJournalGl() or by a partial transaction.
 *
 * Background: review finding R6 (single-source GL helper). After Phase 5.4
 * every posting path calls postJournalGl(); this verifier catches regressions.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-no-orphan-je.ts
 *
 * Exit code:
 *   0 — every posted JE has at least one gl_balance row touched by it
 *   1 — orphan JE(s) found
 */

import pg from "pg";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

interface OrphanJe {
  tenant_id:        string;
  journal_entry_id: string;
  je_number:        string | null;
  source_doc_type:  string | null;
  source_doc_id:    string | null;
  posted_at:        string | null;
  journal_line_count: number;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // An orphan: posted JE with journal_lines but no gl_balance row references it
    // via last_je_id (the column upsert_gl_balance writes).
    const result = await pool.query<OrphanJe>(`
      SELECT
        je.tenant_id::text                     AS tenant_id,
        je.id::text                             AS journal_entry_id,
        je.je_number                            AS je_number,
        je.source_doc_type                      AS source_doc_type,
        je.source_doc_id::text                  AS source_doc_id,
        je.posted_at::text                      AS posted_at,
        COALESCE(jl.line_count, 0)::int         AS journal_line_count
      FROM   document.journal_entry je
      LEFT  JOIN (
        SELECT journal_entry_id, COUNT(*)::int AS line_count
          FROM document.journal_line
         GROUP BY journal_entry_id
      ) jl ON jl.journal_entry_id = je.id
      WHERE  je.status     = 'posted'
        AND  je.posted_at IS NOT NULL
        AND  COALESCE(jl.line_count, 0) > 0
        AND  NOT EXISTS (
          SELECT 1
            FROM ledger.gl_balance gb
           WHERE gb.tenant_id   = je.tenant_id
             AND gb.last_je_id  = je.id
        )
      ORDER BY je.posted_at DESC NULLS LAST
      LIMIT 100
    `);

    const orphans = result.rows;

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:           orphans.length === 0,
        orphan_count: orphans.length,
        orphans,
      }, null, 2));
    } else {
      console.log(`Posted-JE → gl_balance link check`);
      if (orphans.length === 0) {
        console.log("✓ pass — every posted JE materialised at least one gl_balance row");
      } else {
        console.error(`✗ FAIL — ${orphans.length} orphan posted JE(s) (first 100):`);
        for (const o of orphans) {
          console.error(`  ${o.journal_entry_id} (${o.je_number ?? "?"}) source=${o.source_doc_type ?? "?"}:${o.source_doc_id ?? "?"} lines=${o.journal_line_count} posted_at=${o.posted_at ?? "?"}`);
        }
        console.error(`\nHint: posting path likely missed postJournalGl(). See docs/architecture/p2p.md §7.`);
      }
    }

    process.exit(orphans.length === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
