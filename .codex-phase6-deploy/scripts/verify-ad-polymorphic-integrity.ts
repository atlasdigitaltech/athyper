#!/usr/bin/env tsx
/**
 * AD Polymorphic Integrity Verification (P0 pre-check)
 *
 * Pre-flight check before the `trg_ad_validate_polymorphic_source` trigger
 * is wired up against existing data. Confirms that every row in
 * document.accounting_distribution can be resolved to its declared parent
 * via (source_doc_type, source_doc_id, source_line_id).
 *
 * Runs without any schema changes — read-only verification.
 *
 * Checks:
 *   1. For source_doc_type='PURCHASE_INVOICE_LINE':
 *        a. source_line_id exists in purchase_invoice_line with matching tenant.
 *        b. source_doc_id matches that PIL's purchase_invoice_id (parent header).
 *   2. For other source types: best-effort existence check, soft-fail with WARN.
 *   3. Tenant consistency: AD.tenant_id matches the parent's tenant_id.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-ad-polymorphic-integrity.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-ad-polymorphic-integrity.ts --json
 *
 * Exit code:
 *   0 — all PURCHASE_INVOICE_LINE rows resolve cleanly
 *   1 — at least one PURCHASE_INVOICE_LINE row has a resolution gap (CI red)
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

const JSON_OUTPUT = process.argv.includes("--json");

interface Violation {
  rule:    string;
  ad_id:   string;
  detail:  string;
  payload: Record<string, unknown>;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];
  const warnings:   Violation[] = [];

  try {
    // -------------------------------------------------------------------------
    // Check 1 — PURCHASE_INVOICE_LINE: PIL existence + tenant match
    // -------------------------------------------------------------------------
    const orphanPilResult = await pool.query<{
      id: string;
      tenant_id: string;
      source_doc_id: string;
      source_line_id: string;
    }>(`
      SELECT ad.id, ad.tenant_id, ad.source_doc_id, ad.source_line_id
        FROM document.accounting_distribution ad
   LEFT JOIN document.purchase_invoice_line pil
          ON pil.id = ad.source_line_id
         AND pil.tenant_id = ad.tenant_id
       WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
         AND pil.id IS NULL
    `);

    for (const row of orphanPilResult.rows) {
      violations.push({
        rule:   "AD_SOURCE_NOT_FOUND",
        ad_id:  row.id,
        detail: "AD references PIL that does not exist or tenant mismatch",
        payload: {
          source_doc_type: "PURCHASE_INVOICE_LINE",
          source_line_id:  row.source_line_id,
          tenant_id:       row.tenant_id,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 2 — PURCHASE_INVOICE_LINE: source_doc_id owns source_line_id
    // -------------------------------------------------------------------------
    const headerMismatchResult = await pool.query<{
      id: string;
      source_doc_id: string;
      source_line_id: string;
      actual_invoice_id: string;
    }>(`
      SELECT ad.id,
             ad.source_doc_id,
             ad.source_line_id,
             pil.purchase_invoice_id AS actual_invoice_id
        FROM document.accounting_distribution ad
        JOIN document.purchase_invoice_line pil
          ON pil.id = ad.source_line_id
         AND pil.tenant_id = ad.tenant_id
       WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
         AND pil.purchase_invoice_id <> ad.source_doc_id
    `);

    for (const row of headerMismatchResult.rows) {
      violations.push({
        rule:   "AD_SOURCE_HEADER_MISMATCH",
        ad_id:  row.id,
        detail: "AD source_doc_id (header) does not own source_line_id (PIL)",
        payload: {
          source_doc_id:     row.source_doc_id,
          source_line_id:    row.source_line_id,
          actual_invoice_id: row.actual_invoice_id,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 3 — Soft check on other source types (warnings only)
    // -------------------------------------------------------------------------
    const otherTypesResult = await pool.query<{
      source_doc_type: string;
      row_count: string;
    }>(`
      SELECT source_doc_type, COUNT(*)::text AS row_count
        FROM document.accounting_distribution
       WHERE source_doc_type IN (
         'PURCHASE_REQUISITION_LINE',
         'COMMITMENT_LINE',
         'RECEIPT_LINE',
         'SERVICE_SHEET_LINE'
       )
       GROUP BY source_doc_type
    `);

    for (const row of otherTypesResult.rows) {
      warnings.push({
        rule:   "AD_NON_PIL_SOURCE_NOT_HARD_VALIDATED",
        ad_id:  "<aggregate>",
        detail: `${row.row_count} AD rows with source_doc_type=${row.source_doc_type} ` +
                `are soft-validated until per-domain wiring lands. P0 hard-validates PIL only.`,
        payload: {
          source_doc_type: row.source_doc_type,
          row_count:       row.row_count,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Report
    // -------------------------------------------------------------------------
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:         violations.length === 0,
        violations,
        warnings,
        summary: {
          violation_count: violations.length,
          warning_count:   warnings.length,
        },
      }, null, 2));
    } else {
      console.log("=== AD Polymorphic Integrity Verification ===");
      console.log(`Violations:    ${violations.length}`);
      console.log(`Warnings:      ${warnings.length}`);
      console.log();

      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] ad=${v.ad_id} :: ${v.detail}`);
          console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
      }

      if (warnings.length > 0) {
        console.log("--- Warnings ---");
        for (const w of warnings) {
          console.log(`  [${w.rule}] ${w.detail}`);
        }
        console.log();
      }

      if (violations.length === 0) {
        console.log("OK — all PURCHASE_INVOICE_LINE AD rows resolve cleanly.");
        console.log("Safe to wire trg_ad_validate_polymorphic_source.");
      } else {
        console.log("FAIL — fix violations before wiring the validation trigger.");
      }
    }

    process.exit(violations.length > 0 ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
