#!/usr/bin/env tsx
/**
 * WS-COMPAT — Backfill WHT pricing-component rows from legacy flat data.
 *
 * For every purchase_invoice_line where:
 *   • withholding_tax_amount > 0
 *   • no active document.pricing_component of term_type='withholding'
 *     references the line via source_line_id
 *
 * synthesize a line-scope WHT PC row carrying:
 *   • condition_type = WHT_GENERIC
 *   • tax_group_id   = pil.withholding_tax_group_id (may be NULL — flagged)
 *   • amount_value   = pil.withholding_tax_amount   (sign preserved)
 *   • origin         = 'system_resolved'
 *   • metadata       = { backfilled_at, source: 'flat_field' }
 *
 * Idempotent: lines that already have a WHT PC are skipped. Transactional
 * per chunk so partial failures don't half-migrate the dataset.
 *
 * After cutover, run `verify-wht-backfill-complete.ts` (TODO) and flip
 * ATHYPER_AP_WHT_LEGACY_FALLBACK=0 to disable the read fallback.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/backfill-wht-pricing-components.ts
 *
 *   # Dry-run (no writes):
 *   npx tsx server/scripts/backfill-wht-pricing-components.ts --dry-run
 *
 *   # Single tenant:
 *   npx tsx server/scripts/backfill-wht-pricing-components.ts --tenant <uuid>
 *
 *   # Custom actor (default: shared.SYSTEM_USER_ID):
 *   npx tsx server/scripts/backfill-wht-pricing-components.ts --actor <uuid>
 *
 * Exit code:
 *   0 — backfill completed (or dry-run reported zero pending rows)
 *   1 — backfill failed or pre-flight check failed
 *
 * Spec: WHT-as-PC Implementation Plan v2 (WS-COMPAT).
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
const ACTOR_ID  = (() => {
  const i = process.argv.indexOf("--actor");
  return i >= 0 ? process.argv[i + 1] : "00000000-0000-0000-0000-000000000000";
})();
const CHUNK_SIZE = 200;

interface PendingLine {
  tenant_id:                string;
  company_code_id:          string;
  line_id:                  string;
  purchase_invoice_id:      string;
  line_no:                  number;
  withholding_tax_amount:   string;  // numeric → text
  withholding_tax_group_id: string | null;
  currency_code:            string;
  base_currency_code:       string;
  exchange_rate:            string;
  wht_condition_type_id:    string | null;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  let totalPending  = 0;
  let totalCreated  = 0;
  let totalSkipped  = 0;
  let lastReportAt  = Date.now();

  try {
    // Pre-flight: WHT_GENERIC condition_type must exist (per-tenant)
    const cdResult = await pool.query<{ tenant_id: string; condition_type_id: string }>(`
      SELECT tenant_id, id AS condition_type_id
        FROM master.condition_type
       WHERE code = 'WHT_GENERIC'
         ${TENANT_ID ? "AND tenant_id = $1::uuid" : ""}
    `, TENANT_ID ? [TENANT_ID] : []);

    if (cdResult.rows.length === 0) {
      console.error("ERROR: WHT_GENERIC condition_type not found. Seed not applied?");
      process.exit(1);
    }

    const whtCtByTenant = new Map(cdResult.rows.map((r) => [r.tenant_id, r.condition_type_id]));

    // Count pending lines
    const countResult = await pool.query<{ row_count: string }>(`
      SELECT COUNT(*)::text AS row_count
        FROM document.purchase_invoice_line pil
       WHERE COALESCE(pil.withholding_tax_amount, 0) <> 0
         ${TENANT_ID ? "AND pil.tenant_id = $1::uuid" : ""}
         AND NOT EXISTS (
             SELECT 1 FROM document.pricing_component pc
              WHERE pc.tenant_id        = pil.tenant_id
                AND pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
                AND pc.source_line_id   = pil.id
                AND pc.term_type        = 'withholding'
                AND pc.superseded_by_id IS NULL
         )
    `, TENANT_ID ? [TENANT_ID] : []);

    totalPending = parseInt(countResult.rows[0]?.row_count ?? "0", 10);
    console.log(`[backfill-wht-pc] pending lines: ${totalPending} (tenant=${TENANT_ID ?? "ALL"})`);

    if (totalPending === 0) {
      console.log("[backfill-wht-pc] nothing to do");
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log("[backfill-wht-pc] DRY-RUN — no writes");
      process.exit(0);
    }

    // Chunked backfill
    let cursorAfter: string | null = null;
    while (true) {
      const pendingResult = await pool.query<PendingLine>(`
        WITH pending AS (
          SELECT pil.tenant_id, pi.company_code_id,
                 pil.id AS line_id, pil.purchase_invoice_id, pil.line_no,
                 pil.withholding_tax_amount::text,
                 pil.withholding_tax_group_id,
                 pi.currency_code, pi.base_currency_code,
                 pi.exchange_rate::text,
                 (SELECT id::text FROM master.condition_type
                   WHERE code='WHT_GENERIC' AND tenant_id=pil.tenant_id
                   LIMIT 1) AS wht_condition_type_id
            FROM document.purchase_invoice_line pil
            JOIN document.purchase_invoice pi
              ON pi.id        = pil.purchase_invoice_id
             AND pi.tenant_id = pil.tenant_id
           WHERE COALESCE(pil.withholding_tax_amount, 0) <> 0
             ${TENANT_ID ? "AND pil.tenant_id = $2::uuid" : ""}
             ${cursorAfter ? "AND pil.id > $1::uuid" : ""}
             AND NOT EXISTS (
                 SELECT 1 FROM document.pricing_component pc
                  WHERE pc.tenant_id        = pil.tenant_id
                    AND pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
                    AND pc.source_line_id   = pil.id
                    AND pc.term_type        = 'withholding'
                    AND pc.superseded_by_id IS NULL
             )
           ORDER BY pil.id
           LIMIT ${CHUNK_SIZE}
        )
        SELECT * FROM pending
      `, cursorAfter && TENANT_ID ? [cursorAfter, TENANT_ID]
        : cursorAfter ? [cursorAfter]
        : TENANT_ID ? [null, TENANT_ID]
        : []);

      const rows = pendingResult.rows;
      if (rows.length === 0) break;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const row of rows) {
          const conditionTypeId = row.wht_condition_type_id
            ?? whtCtByTenant.get(row.tenant_id);
          if (!conditionTypeId) {
            console.warn(`[backfill-wht-pc] skip line ${row.line_id}: WHT_GENERIC not found for tenant ${row.tenant_id}`);
            totalSkipped++;
            continue;
          }

          // Resolve tax_group_id: prefer the flat field on the line; if NULL,
          // leave NULL but log so an operator can fix it (the resulting PC row
          // will FAIL pc_tax_fields_scope_chk — flag it as a data-quality
          // issue rather than synthesize a placeholder).
          const taxGroupId = row.withholding_tax_group_id;
          if (!taxGroupId) {
            console.warn(`[backfill-wht-pc] skip line ${row.line_id}: withholding_tax_group_id is NULL (flag for operator review)`);
            totalSkipped++;
            continue;
          }

          // metadata: capture backfill provenance + a synthetic snapshot.
          // wht_basis is unknown at backfill time (no rate-schedule lookup);
          // record 'LEGACY_BACKFILL' so postInvoiceTaxCalculations can detect
          // it later and re-resolve from the group's rate schedules.
          const metadata = {
            backfilled_at:    new Date().toISOString(),
            source:           "flat_field",
            backfill_script:  "backfill-wht-pricing-components.ts",
            rate_schedule_id: "LEGACY_BACKFILL",
            wht_basis:        "LEGACY_BACKFILL",
            resolved_rate:    null,
          };

          const amount = Math.abs(parseFloat(row.withholding_tax_amount));
          await client.query(`
            INSERT INTO document.pricing_component (
              tenant_id, company_code_id,
              source_doc_type, source_doc_id, source_line_id,
              term_type, condition_type_id, sequence,
              basis, amount_value, base_for_calculation,
              computed_amount, computed_base_amount,
              entry_level, apportion_basis,
              origin,
              tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
              metadata,
              currency_code, base_currency_code, exchange_rate,
              created_by
            ) VALUES (
              $1::uuid, $2::uuid,
              'PURCHASE_INVOICE_LINE', $3::uuid, $4::uuid,
              'withholding', $5::uuid, 400,
              'amount', $6::numeric, $6::numeric,
              $6::numeric, ($6::numeric * $7::numeric),
              'line', NULL,
              'system_resolved',
              $8::uuid, false, 0, NULL,
              $9::jsonb,
              $10, $11, $7::numeric,
              $12::uuid
            )
          `, [
            row.tenant_id, row.company_code_id,
            row.purchase_invoice_id, row.line_id,
            conditionTypeId,
            amount,
            row.exchange_rate,
            taxGroupId,
            JSON.stringify(metadata),
            row.currency_code, row.base_currency_code,
            ACTOR_ID,
          ]);
          totalCreated++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      cursorAfter = rows[rows.length - 1]!.line_id;

      if (Date.now() - lastReportAt > 5000) {
        console.log(`[backfill-wht-pc] progress: created=${totalCreated} skipped=${totalSkipped}`);
        lastReportAt = Date.now();
      }
    }

    console.log(`[backfill-wht-pc] complete. pending=${totalPending} created=${totalCreated} skipped=${totalSkipped}`);
    if (totalSkipped > 0) {
      console.warn(`[backfill-wht-pc] ${totalSkipped} line(s) skipped — review logs above and assign withholding_tax_group_id, then re-run.`);
    }
    process.exit(0);
  } catch (err) {
    console.error("[backfill-wht-pc] FATAL:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
