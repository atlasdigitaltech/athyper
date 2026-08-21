#!/usr/bin/env tsx
/**
 * PC ↔ PIL Cache Consistency Drift Detector (P4 v1.2)
 *
 * Runs daily during the 30-day dual-write window. For every active invoice with
 * PC rows, compares aggregated PC values against the PIL flat-column caches:
 *   discount_amount, tax_amount, withholding_tax_amount, retention_amount.
 *
 * Drift threshold: ±0.01 per field per line.
 *
 * Exit criteria for P5 (drop legacy columns):
 *   30 consecutive days of zero drift across all tenants.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/verify-pc-cache-consistency.ts
 *   npx tsx server/scripts/verify-pc-cache-consistency.ts --json
 *   npx tsx server/scripts/verify-pc-cache-consistency.ts --tenant <uuid>
 *   npx tsx server/scripts/verify-pc-cache-consistency.ts --tolerance 0.001
 *
 * Exit:
 *   0 — zero drift
 *   1 — drift found
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §3.1, §3.2 (P4 reader migration)
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");
const TENANT_ID = (() => {
  const i = process.argv.indexOf("--tenant");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const TOLERANCE = (() => {
  const i = process.argv.indexOf("--tolerance");
  return i >= 0 ? parseFloat(process.argv[i + 1] ?? "0.01") : 0.01;
})();

interface Drift {
  tenant_id:           string;
  purchase_invoice_id: string;
  pil_id:              string;
  field:               string;
  pil_value:           string;
  pc_aggregated:       string;
  drift:               string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const drifts: Drift[] = [];

  try {
    const params: unknown[] = [TOLERANCE];
    let tenantFilter = "";
    if (TENANT_ID) {
      params.push(TENANT_ID);
      tenantFilter = `AND pil.tenant_id = $${params.length}::uuid`;
    }

    // For each PIL with active PC rows, compute the PC aggregate and compare.
    // PILs with zero PC rows are skipped (shadow mode: many invoices have no PC yet).
    const result = await pool.query<{
      tenant_id:           string;
      purchase_invoice_id: string;
      pil_id:              string;
      pil_discount:        string;
      pc_discount:         string;
      pil_tax:             string;
      pc_tax:              string;
      pil_withholding:     string;
      pc_withholding:      string;
      pil_retention:       string;
      pc_retention:        string;
    }>(`
      WITH agg AS (
        SELECT
          pc.tenant_id,
          pc.source_doc_id  AS purchase_invoice_id,
          pc.source_line_id AS pil_id,
          COALESCE(SUM(CASE WHEN pc.term_type = 'discount'    THEN pc.computed_amount END), 0) AS pc_discount,
          COALESCE(SUM(CASE WHEN pc.term_type = 'tax'         THEN pc.computed_amount END), 0) AS pc_tax,
          COALESCE(SUM(CASE WHEN pc.term_type = 'withholding' THEN pc.computed_amount END), 0) AS pc_withholding,
          COALESCE(SUM(CASE WHEN pc.term_type = 'retention'   THEN pc.computed_amount END), 0) AS pc_retention
        FROM document.pricing_component pc
        WHERE pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
          AND pc.source_line_id   IS NOT NULL
          AND pc.superseded_by_id IS NULL
        GROUP BY pc.tenant_id, pc.source_doc_id, pc.source_line_id
      )
      SELECT
        pil.tenant_id::text                                    AS tenant_id,
        pil.purchase_invoice_id::text                          AS purchase_invoice_id,
        pil.id::text                                           AS pil_id,
        pil.discount_amount::text                              AS pil_discount,
        agg.pc_discount::text                                  AS pc_discount,
        pil.tax_amount::text                                   AS pil_tax,
        agg.pc_tax::text                                       AS pc_tax,
        pil.withholding_tax_amount::text                       AS pil_withholding,
        agg.pc_withholding::text                               AS pc_withholding,
        pil.retention_amount::text                             AS pil_retention,
        agg.pc_retention::text                                 AS pc_retention
      FROM agg
      JOIN document.purchase_invoice_line pil
        ON pil.id        = agg.pil_id
       AND pil.tenant_id = agg.tenant_id
      WHERE
            abs(pil.discount_amount        - agg.pc_discount)    > $1::numeric
         OR abs(pil.tax_amount             - agg.pc_tax)         > $1::numeric
         OR abs(pil.withholding_tax_amount - agg.pc_withholding) > $1::numeric
         OR abs(pil.retention_amount       - agg.pc_retention)   > $1::numeric
        ${tenantFilter}
      LIMIT 5000
    `, params);

    for (const row of result.rows) {
      const checks: Array<{
        field: string;
        pil:   string;
        pc:    string;
      }> = [
        { field: "discount_amount",        pil: row.pil_discount,    pc: row.pc_discount    },
        { field: "tax_amount",             pil: row.pil_tax,         pc: row.pc_tax         },
        { field: "withholding_tax_amount", pil: row.pil_withholding, pc: row.pc_withholding },
        { field: "retention_amount",       pil: row.pil_retention,   pc: row.pc_retention   },
      ];

      for (const c of checks) {
        const diff = Math.abs(parseFloat(c.pil) - parseFloat(c.pc));
        if (diff > TOLERANCE) {
          drifts.push({
            tenant_id:           row.tenant_id,
            purchase_invoice_id: row.purchase_invoice_id,
            pil_id:              row.pil_id,
            field:               c.field,
            pil_value:           c.pil,
            pc_aggregated:       c.pc,
            drift:               diff.toFixed(6),
          });
        }
      }
    }

    // Also count invoices in shadow mode (have PIL but no PC) — informational
    const shadowCountResult = await pool.query<{ shadow_invoices: string }>(`
      SELECT COUNT(DISTINCT pi.id)::text AS shadow_invoices
        FROM document.purchase_invoice pi
        JOIN document.purchase_invoice_line pil ON pil.purchase_invoice_id = pi.id
       WHERE pi.tenant_id = COALESCE($1::uuid, pi.tenant_id)
         AND NOT EXISTS (
           SELECT 1 FROM document.pricing_component pc
            WHERE pc.source_doc_type = 'PURCHASE_INVOICE_LINE'
              AND pc.source_doc_id   = pi.id
              AND pc.tenant_id       = pi.tenant_id
         )
    `, [TENANT_ID ?? null]);
    const shadowCount = shadowCountResult.rows[0]?.shadow_invoices ?? "0";

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:               drifts.length === 0,
        tolerance:        TOLERANCE,
        drift_count:      drifts.length,
        shadow_invoices:  shadowCount,
        drifts,
      }, null, 2));
    } else {
      console.log("=== PC ↔ PIL Cache Consistency Check ===");
      console.log(`Tolerance:                ±${TOLERANCE}`);
      console.log(`Shadow invoices (no PC):  ${shadowCount}`);
      console.log(`Drift records:            ${drifts.length}`);
      console.log();
      if (drifts.length > 0) {
        console.log("--- Drift records (first 20) ---");
        for (const d of drifts.slice(0, 20)) {
          console.log(`  pil=${d.pil_id.slice(0, 8)}… field=${d.field}`);
          console.log(`    PIL=${d.pil_value}  PC=${d.pc_aggregated}  drift=${d.drift}`);
        }
        console.log();
        console.log("FAIL — PC and PIL caches diverge. Investigate before P5 drop.");
      } else {
        console.log("OK — no PC/PIL drift detected.");
      }
    }

    process.exit(drifts.length > 0 ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
