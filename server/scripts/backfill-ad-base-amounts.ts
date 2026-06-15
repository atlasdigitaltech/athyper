#!/usr/bin/env tsx
/**
 * Backfill AD base-currency amounts (P0)
 *
 * Populates distributed_amount_base + exchange_rate_snapshot on existing
 * accounting_distribution rows using the parent purchase_invoice's
 * exchange_rate. Idempotent — skips rows where both columns are already set.
 *
 * After backfill, the operator confirms zero remaining NULLs and issues:
 *   ALTER TABLE document.accounting_distribution
 *     ALTER COLUMN distributed_amount_base SET NOT NULL,
 *     ALTER COLUMN exchange_rate_snapshot  SET NOT NULL;
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/backfill-ad-base-amounts.ts
 *
 *   # Dry-run:
 *   npx tsx server/scripts/backfill-ad-base-amounts.ts --dry-run
 *
 *   # Restrict to a single tenant:
 *   npx tsx server/scripts/backfill-ad-base-amounts.ts --tenant <uuid>
 *
 *   # Chunk size override (default 5000):
 *   npx tsx server/scripts/backfill-ad-base-amounts.ts --chunk 10000
 *
 * Exit code:
 *   0 — backfill completed (or dry-run successful)
 *   1 — error
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §3.4
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const DRY_RUN   = process.argv.includes("--dry-run");
const TENANT_ID = (() => {
  const i = process.argv.indexOf("--tenant");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const CHUNK_SIZE = (() => {
  const i = process.argv.indexOf("--chunk");
  return i >= 0 ? parseInt(process.argv[i + 1] ?? "5000", 10) : 5000;
})();

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Step 1: count target rows
    const countResult = await pool.query<{ row_count: string }>(`
      SELECT COUNT(*)::text AS row_count
        FROM document.accounting_distribution ad
        JOIN document.purchase_invoice_line pil
          ON pil.id = ad.source_line_id
         AND pil.tenant_id = ad.tenant_id
        JOIN document.purchase_invoice pi
          ON pi.id = pil.purchase_invoice_id
         AND pi.tenant_id = ad.tenant_id
       WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
         AND (ad.distributed_amount_base IS NULL OR ad.exchange_rate_snapshot IS NULL)
         ${TENANT_ID ? "AND ad.tenant_id = $1" : ""}
    `, TENANT_ID ? [TENANT_ID] : []);

    const totalRows = parseInt(countResult.rows[0]?.row_count ?? "0", 10);

    console.log(`=== AD base-currency backfill ===`);
    console.log(`Mode:        ${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`);
    if (TENANT_ID) console.log(`Tenant:      ${TENANT_ID}`);
    console.log(`Chunk size:  ${CHUNK_SIZE}`);
    console.log(`Rows to fix: ${totalRows}`);
    console.log();

    if (totalRows === 0) {
      console.log("Nothing to backfill. Done.");
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log("Dry-run — no UPDATE issued.");

      // Show a sample of what would be updated
      const sampleResult = await pool.query(`
        SELECT ad.id,
               ad.distributed_amount,
               pi.exchange_rate,
               ad.distributed_amount * pi.exchange_rate AS new_base_amount
          FROM document.accounting_distribution ad
          JOIN document.purchase_invoice_line pil
            ON pil.id = ad.source_line_id AND pil.tenant_id = ad.tenant_id
          JOIN document.purchase_invoice pi
            ON pi.id = pil.purchase_invoice_id AND pi.tenant_id = ad.tenant_id
         WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
           AND (ad.distributed_amount_base IS NULL OR ad.exchange_rate_snapshot IS NULL)
           ${TENANT_ID ? "AND ad.tenant_id = $1" : ""}
         LIMIT 10
      `, TENANT_ID ? [TENANT_ID] : []);

      console.log("Sample (first 10):");
      console.table(sampleResult.rows);
      process.exit(0);
    }

    // Step 2: backfill in chunks (set-based UPDATE with LIMIT via CTE)
    let updatedTotal = 0;
    while (true) {
      const result = await pool.query<{ updated: string }>(`
        WITH targets AS (
          SELECT ad.id, pi.exchange_rate, ad.distributed_amount
            FROM document.accounting_distribution ad
            JOIN document.purchase_invoice_line pil
              ON pil.id = ad.source_line_id AND pil.tenant_id = ad.tenant_id
            JOIN document.purchase_invoice pi
              ON pi.id = pil.purchase_invoice_id AND pi.tenant_id = ad.tenant_id
           WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
             AND (ad.distributed_amount_base IS NULL OR ad.exchange_rate_snapshot IS NULL)
             ${TENANT_ID ? "AND ad.tenant_id = $1" : ""}
           LIMIT ${CHUNK_SIZE}
        ),
        updated AS (
          UPDATE document.accounting_distribution ad
             SET distributed_amount_base = t.distributed_amount * t.exchange_rate,
                 exchange_rate_snapshot  = t.exchange_rate
            FROM targets t
           WHERE ad.id = t.id
       RETURNING ad.id
        )
        SELECT COUNT(*)::text AS updated FROM updated
      `, TENANT_ID ? [TENANT_ID] : []);

      const updated = parseInt(result.rows[0]?.updated ?? "0", 10);
      updatedTotal += updated;
      console.log(`  chunk: +${updated} (total: ${updatedTotal}/${totalRows})`);

      if (updated === 0) break;
    }

    console.log();
    console.log(`Backfill complete: ${updatedTotal} rows updated.`);
    console.log();
    console.log("Next step — confirm zero NULLs then issue:");
    console.log(`  ALTER TABLE document.accounting_distribution`);
    console.log(`    ALTER COLUMN distributed_amount_base SET NOT NULL,`);
    console.log(`    ALTER COLUMN exchange_rate_snapshot  SET NOT NULL;`);

    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
