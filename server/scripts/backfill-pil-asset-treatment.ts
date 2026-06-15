#!/usr/bin/env tsx
/**
 * Backfill PIL asset fields (P3 v1.2)
 *
 * Maps legacy PIL columns to the new asset_treatment / asset_class_id /
 * target_asset_id triplet:
 *
 *   is_asset=false                                  → asset_treatment='none'
 *   is_asset=true,  asset_category_id IS NULL       → asset_treatment='class_pending', asset_class_id=NULL
 *   is_asset=true,  asset_category_id ∈ asset_class → asset_treatment='class_pending', asset_class_id=<match>
 *   is_asset=true,  asset_category_id ∉ asset_class → flagged for manual review (no auto-mapping)
 *
 * Rationale for default 'class_pending':
 *   The legacy is_asset boolean signaled "this line acquires an asset" without
 *   specifying which master.asset (none existed yet). 'class_pending' is the
 *   honest mapping — the class is known (or NULL), the specific master record
 *   is settled later. If a tenant routinely creates the master.asset at PIL
 *   create time and links via metadata, a targeted migration step (separate)
 *   can promote those rows to 'target_asset'.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/backfill-pil-asset-treatment.ts
 *   npx tsx server/scripts/backfill-pil-asset-treatment.ts --dry-run
 *   npx tsx server/scripts/backfill-pil-asset-treatment.ts --tenant <uuid>
 *   npx tsx server/scripts/backfill-pil-asset-treatment.ts --chunk 5000
 *   npx tsx server/scripts/backfill-pil-asset-treatment.ts --emit-review-queue
 *     (writes flagged rows to /tmp/pil-asset-review.json)
 *
 * Idempotent: only updates rows where asset_treatment IS NULL.
 *
 * Exit:
 *   0 — backfill complete (or dry-run successful)
 *   1 — error
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §3.2 (P3)
 */

import pg from "pg";
import fs from "fs";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const DRY_RUN   = process.argv.includes("--dry-run");
const EMIT_QUEUE = process.argv.includes("--emit-review-queue");
const TENANT_ID = (() => {
  const i = process.argv.indexOf("--tenant");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const CHUNK_SIZE = (() => {
  const i = process.argv.indexOf("--chunk");
  return i >= 0 ? parseInt(process.argv[i + 1] ?? "5000", 10) : 5000;
})();

interface ReviewQueueEntry {
  pil_id:                   string;
  tenant_id:                string;
  purchase_invoice_id:      string;
  is_asset:                 boolean;
  asset_category_id_orig:   string | null;
  reason:                   string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Count phases
    const counts = await pool.query<{
      total_pending:           string;
      false_pending:           string;
      true_no_category:        string;
      true_category_matches:   string;
      true_category_orphan:    string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM document.purchase_invoice_line WHERE asset_treatment IS NULL ${TENANT_ID ? "AND tenant_id = $1" : ""}) AS total_pending,
        (SELECT COUNT(*)::text FROM document.purchase_invoice_line WHERE asset_treatment IS NULL AND is_asset = false ${TENANT_ID ? "AND tenant_id = $1" : ""}) AS false_pending,
        (SELECT COUNT(*)::text FROM document.purchase_invoice_line WHERE asset_treatment IS NULL AND is_asset = true AND asset_category_id IS NULL ${TENANT_ID ? "AND tenant_id = $1" : ""}) AS true_no_category,
        (SELECT COUNT(*)::text FROM document.purchase_invoice_line pil
          WHERE asset_treatment IS NULL AND is_asset = true AND asset_category_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM master.asset_class ac WHERE ac.id = pil.asset_category_id AND ac.tenant_id = pil.tenant_id)
          ${TENANT_ID ? "AND pil.tenant_id = $1" : ""}) AS true_category_matches,
        (SELECT COUNT(*)::text FROM document.purchase_invoice_line pil
          WHERE asset_treatment IS NULL AND is_asset = true AND asset_category_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM master.asset_class ac WHERE ac.id = pil.asset_category_id AND ac.tenant_id = pil.tenant_id)
          ${TENANT_ID ? "AND pil.tenant_id = $1" : ""}) AS true_category_orphan
    `, TENANT_ID ? [TENANT_ID] : []);

    const c = counts.rows[0]!;

    console.log("=== PIL asset_treatment backfill ===");
    console.log(`Mode:        ${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`);
    if (TENANT_ID) console.log(`Tenant:      ${TENANT_ID}`);
    console.log(`Chunk size:  ${CHUNK_SIZE}`);
    console.log();
    console.log(`Pending rows:                       ${c.total_pending}`);
    console.log(`  is_asset=false  → 'none':          ${c.false_pending}`);
    console.log(`  is_asset=true, no category → 'class_pending' (class=NULL): ${c.true_no_category}`);
    console.log(`  is_asset=true, category resolves to asset_class:           ${c.true_category_matches}`);
    console.log(`  is_asset=true, category ORPHAN → review queue:             ${c.true_category_orphan}`);
    console.log();

    // Emit review queue
    if (parseInt(c.true_category_orphan, 10) > 0) {
      const orphans = await pool.query<{
        id:                  string;
        tenant_id:           string;
        purchase_invoice_id: string;
        asset_category_id:   string;
      }>(`
        SELECT pil.id, pil.tenant_id, pil.purchase_invoice_id, pil.asset_category_id
          FROM document.purchase_invoice_line pil
         WHERE pil.asset_treatment IS NULL
           AND pil.is_asset = true
           AND pil.asset_category_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM master.asset_class ac WHERE ac.id = pil.asset_category_id AND ac.tenant_id = pil.tenant_id)
         ${TENANT_ID ? "AND pil.tenant_id = $1" : ""}
         ORDER BY pil.id
         LIMIT 1000
      `, TENANT_ID ? [TENANT_ID] : []);

      const queue: ReviewQueueEntry[] = orphans.rows.map((row) => ({
        pil_id:                 row.id,
        tenant_id:              row.tenant_id,
        purchase_invoice_id:    row.purchase_invoice_id,
        is_asset:               true,
        asset_category_id_orig: row.asset_category_id,
        reason:                 "asset_category_id does not resolve to a master.asset_class row",
      }));

      console.log(`First ${queue.length} orphan rows (review):`);
      console.table(queue.slice(0, 10));

      if (EMIT_QUEUE) {
        fs.writeFileSync("/tmp/pil-asset-review.json", JSON.stringify(queue, null, 2));
        console.log();
        console.log("Review queue written to /tmp/pil-asset-review.json");
      }
      console.log();
    }

    if (DRY_RUN) {
      console.log("Dry-run — no UPDATE issued.");
      process.exit(0);
    }

    // -------------------------------------------------------------------------
    // Phase 1 — is_asset=false  → 'none'
    // -------------------------------------------------------------------------
    let updatedTotal = 0;
    let phase1Count = 0;
    while (true) {
      const result = await pool.query<{ updated: string }>(`
        WITH targets AS (
          SELECT id FROM document.purchase_invoice_line
           WHERE asset_treatment IS NULL AND is_asset = false
           ${TENANT_ID ? "AND tenant_id = $1" : ""}
           LIMIT ${CHUNK_SIZE}
        ),
        updated AS (
          UPDATE document.purchase_invoice_line pil
             SET asset_treatment = 'none'
            FROM targets t
           WHERE pil.id = t.id
       RETURNING pil.id
        )
        SELECT COUNT(*)::text AS updated FROM updated
      `, TENANT_ID ? [TENANT_ID] : []);

      const n = parseInt(result.rows[0]?.updated ?? "0", 10);
      phase1Count += n;
      updatedTotal += n;
      if (n === 0) break;
      console.log(`  phase 1 chunk: +${n} (none total: ${phase1Count})`);
    }

    // -------------------------------------------------------------------------
    // Phase 2 — is_asset=true, no category → 'class_pending'
    // -------------------------------------------------------------------------
    let phase2Count = 0;
    while (true) {
      const result = await pool.query<{ updated: string }>(`
        WITH targets AS (
          SELECT id FROM document.purchase_invoice_line
           WHERE asset_treatment IS NULL AND is_asset = true AND asset_category_id IS NULL
           ${TENANT_ID ? "AND tenant_id = $1" : ""}
           LIMIT ${CHUNK_SIZE}
        ),
        updated AS (
          UPDATE document.purchase_invoice_line pil
             SET asset_treatment = 'class_pending'
            FROM targets t
           WHERE pil.id = t.id
       RETURNING pil.id
        )
        SELECT COUNT(*)::text AS updated FROM updated
      `, TENANT_ID ? [TENANT_ID] : []);

      const n = parseInt(result.rows[0]?.updated ?? "0", 10);
      phase2Count += n;
      updatedTotal += n;
      if (n === 0) break;
      console.log(`  phase 2 chunk: +${n} (class_pending NULL-class total: ${phase2Count})`);
    }

    // -------------------------------------------------------------------------
    // Phase 3 — is_asset=true, category resolves → 'class_pending' + asset_class_id
    // -------------------------------------------------------------------------
    let phase3Count = 0;
    while (true) {
      const result = await pool.query<{ updated: string }>(`
        WITH targets AS (
          SELECT pil.id, pil.asset_category_id AS class_id
            FROM document.purchase_invoice_line pil
           WHERE pil.asset_treatment IS NULL AND pil.is_asset = true AND pil.asset_category_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM master.asset_class ac WHERE ac.id = pil.asset_category_id AND ac.tenant_id = pil.tenant_id)
           ${TENANT_ID ? "AND pil.tenant_id = $1" : ""}
           LIMIT ${CHUNK_SIZE}
        ),
        updated AS (
          UPDATE document.purchase_invoice_line pil
             SET asset_treatment = 'class_pending',
                 asset_class_id  = t.class_id
            FROM targets t
           WHERE pil.id = t.id
       RETURNING pil.id
        )
        SELECT COUNT(*)::text AS updated FROM updated
      `, TENANT_ID ? [TENANT_ID] : []);

      const n = parseInt(result.rows[0]?.updated ?? "0", 10);
      phase3Count += n;
      updatedTotal += n;
      if (n === 0) break;
      console.log(`  phase 3 chunk: +${n} (class_pending + class total: ${phase3Count})`);
    }

    console.log();
    console.log(`Backfill complete:`);
    console.log(`  none:                              ${phase1Count}`);
    console.log(`  class_pending (no class):          ${phase2Count}`);
    console.log(`  class_pending (class mapped):      ${phase3Count}`);
    console.log(`  Total rows updated:                ${updatedTotal}`);
    console.log();
    console.log("Next steps:");
    console.log("  1. Run: npx tsx server/scripts/verify-asset-treatment-mapping.ts");
    console.log("  2. If pass: ALTER TABLE document.purchase_invoice_line ALTER COLUMN asset_treatment SET NOT NULL;");
    console.log("  3. VALIDATE pil_asset_treatment_chk, pil_asset_class_required, pil_asset_target_required.");

    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
