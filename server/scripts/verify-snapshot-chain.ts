#!/usr/bin/env tsx
/**
 * Verify Snapshot Chain — Phase 10
 *
 * Asserts that every (entity_type, entity_id) chain in
 * snapshot.document_snapshot is hash-continuous — `previous_snapshot_id`
 * on row N matches the id of the row at `chain_seq = N-1` for that entity.
 *
 * Delegates to `snapshot.fn_verify_chain` (defined in
 * server/db/ddl/common/snapshot/07_functions.sql) and aggregates broken rows.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-snapshot-chain.ts
 *
 * Exit code:
 *   0 — all chains intact
 *   1 — at least one broken chain
 */

import pg from "pg";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

interface BrokenLink {
  tenant_id:        string;
  entity_type:      string;
  entity_id:        string;
  snapshot_id:      string;
  chain_seq:        number;
  captured_at:      string;
  expected_prev_id: string | null;
  actual_prev_id:   string | null;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Iterate one entity at a time to bound result size. Verify_chain is
    // STABLE so we can fold it into the entity-level scan.
    const entitiesResult = await pool.query<{
      tenant_id: string; entity_type: string; entity_id: string;
    }>(`
      SELECT DISTINCT
             tenant_id::text   AS tenant_id,
             entity_type       AS entity_type,
             entity_id::text   AS entity_id
        FROM snapshot.document_snapshot
       ORDER BY tenant_id, entity_type, entity_id
    `);

    const broken: BrokenLink[] = [];

    for (const e of entitiesResult.rows) {
      const chainResult = await pool.query<{
        snapshot_id:      string;
        chain_seq:        number;
        captured_at:      string;
        expected_prev_id: string | null;
        actual_prev_id:   string | null;
        chain_ok:         boolean;
      }>(`
        SELECT snapshot_id::text          AS snapshot_id,
               chain_seq,
               captured_at::text          AS captured_at,
               expected_prev_id::text     AS expected_prev_id,
               actual_prev_id::text       AS actual_prev_id,
               chain_ok
          FROM snapshot.fn_verify_chain($1::uuid, $2::text, $3::uuid)
      `, [e.tenant_id, e.entity_type, e.entity_id]);

      for (const row of chainResult.rows) {
        if (!row.chain_ok) {
          broken.push({
            tenant_id:        e.tenant_id,
            entity_type:      e.entity_type,
            entity_id:        e.entity_id,
            snapshot_id:      row.snapshot_id,
            chain_seq:        row.chain_seq,
            captured_at:      row.captured_at,
            expected_prev_id: row.expected_prev_id,
            actual_prev_id:   row.actual_prev_id,
          });
        }
      }
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:               broken.length === 0,
        entities_scanned: entitiesResult.rows.length,
        broken_link_count: broken.length,
        broken_links:     broken,
      }, null, 2));
    } else {
      console.log(`Snapshot chain verification`);
      console.log(`  Entities scanned: ${entitiesResult.rows.length}`);
      if (broken.length === 0) {
        console.log("✓ pass — all snapshot chains intact");
      } else {
        console.error(`✗ FAIL — ${broken.length} broken chain link(s):`);
        for (const b of broken.slice(0, 50)) {
          console.error(`  ${b.entity_type} ${b.entity_id} @ seq=${b.chain_seq} — expected prev=${b.expected_prev_id ?? "NULL"}, actual=${b.actual_prev_id ?? "NULL"}`);
        }
        if (broken.length > 50) console.error(`  … ${broken.length - 50} more (run with --json for full list)`);
      }
    }

    process.exit(broken.length === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
