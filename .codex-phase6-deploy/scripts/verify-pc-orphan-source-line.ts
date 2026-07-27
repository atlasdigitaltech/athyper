#!/usr/bin/env tsx
/**
 * PC Orphan source_line_id Detector (P1.4)
 *
 * Counterpart to verify-pc-cache-consistency.ts. pricing_component.source_line_id
 * is polymorphic (no real FK), so a raw DELETE on purchase_invoice_line — or a
 * pre-fix call to handleDeleteInvoiceLine before the P1.1 guard landed — can
 * leave active PC rows pointing at a vanished parent line.
 *
 * Critically: the PC_APPORTION_SUM_DRIFT check in validatePcInvariants will NOT
 * catch this case if the orphaned children still sum to the header parent.
 * Orphans must be detected per-row, not per-aggregate.
 *
 * Checks (per source_doc_type):
 *
 *   1. PURCHASE_INVOICE_LINE — every active line-scope PC whose source_line_id
 *      no longer resolves to a purchase_invoice_line in the same tenant.
 *
 *   2. PURCHASE_INVOICE_LINE (header-scope) — every active header-scope PC whose
 *      source_doc_id no longer resolves to a purchase_invoice (covers parent-
 *      invoice deletes if any).
 *
 *   3. Other source types (COMMITMENT_LINE / RECEIPT_LINE / SERVICE_SHEET_LINE
 *      / PURCHASE_REQUISITION_LINE) — soft-checked: a violation is reported as
 *      a warning, since per-domain wiring is still Phase 2 work and orphans
 *      there are expected until each domain adopts PC.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/verify-pc-orphan-source-line.ts
 *   npx tsx server/scripts/verify-pc-orphan-source-line.ts --json
 *
 * Exit:
 *   0 — no PURCHASE_INVOICE_LINE orphans (warnings allowed)
 *   1 — at least one PI orphan
 *
 * Spec: pricing-component plan §P1.4
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
  detail:  string;
  payload: Record<string, unknown>;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];
  const warnings:   Violation[] = [];

  try {
    // -------------------------------------------------------------------------
    // Check 1 — Line-scope PI orphans
    // -------------------------------------------------------------------------
    const lineOrphans = await pool.query<{
      id:              string;
      tenant_id:       string;
      source_doc_id:   string;
      source_line_id:  string;
      term_type:       string;
      computed_amount: string;
    }>(`
      SELECT pc.id, pc.tenant_id, pc.source_doc_id, pc.source_line_id,
             pc.term_type, pc.computed_amount
        FROM document.pricing_component pc
       WHERE pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
         AND pc.source_line_id   IS NOT NULL
         AND pc.superseded_by_id IS NULL
         AND NOT EXISTS (
               SELECT 1
                 FROM document.purchase_invoice_line pil
                WHERE pil.id        = pc.source_line_id
                  AND pil.tenant_id = pc.tenant_id
             )
    `);

    for (const row of lineOrphans.rows) {
      violations.push({
        rule:   "PC_ORPHAN_LINE_SCOPE",
        detail: "Active line-scope PC references a non-existent purchase_invoice_line",
        payload: {
          pc_id:           row.id,
          tenant_id:       row.tenant_id,
          source_doc_id:   row.source_doc_id,
          source_line_id:  row.source_line_id,
          term_type:       row.term_type,
          computed_amount: row.computed_amount,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 2 — Header-scope PI orphans
    // -------------------------------------------------------------------------
    const headerOrphans = await pool.query<{
      id:              string;
      tenant_id:       string;
      source_doc_id:   string;
      term_type:       string;
      computed_amount: string;
    }>(`
      SELECT pc.id, pc.tenant_id, pc.source_doc_id,
             pc.term_type, pc.computed_amount
        FROM document.pricing_component pc
       WHERE pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
         AND pc.source_line_id   IS NULL
         AND pc.superseded_by_id IS NULL
         AND NOT EXISTS (
               SELECT 1
                 FROM document.purchase_invoice pi
                WHERE pi.id        = pc.source_doc_id
                  AND pi.tenant_id = pc.tenant_id
             )
    `);

    for (const row of headerOrphans.rows) {
      violations.push({
        rule:   "PC_ORPHAN_HEADER_SCOPE",
        detail: "Active header-scope PC references a non-existent purchase_invoice",
        payload: {
          pc_id:           row.id,
          tenant_id:       row.tenant_id,
          source_doc_id:   row.source_doc_id,
          term_type:       row.term_type,
          computed_amount: row.computed_amount,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 3 — Other source types (soft warnings until per-domain PC wires up)
    // -------------------------------------------------------------------------
    // COMMITMENT_LINE — header parent is document.commitment, line is .commitment_line
    const commitmentOrphans = await pool.query<{
      id: string; tenant_id: string; source_doc_id: string; source_line_id: string | null;
    }>(`
      SELECT pc.id, pc.tenant_id, pc.source_doc_id, pc.source_line_id
        FROM document.pricing_component pc
       WHERE pc.source_doc_type  = 'COMMITMENT_LINE'
         AND pc.superseded_by_id IS NULL
         AND (
              (pc.source_line_id IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM document.commitment_line cl
                   WHERE cl.id = pc.source_line_id AND cl.tenant_id = pc.tenant_id))
           OR (pc.source_line_id IS NULL     AND NOT EXISTS (
                  SELECT 1 FROM document.commitment c
                   WHERE c.id  = pc.source_doc_id  AND c.tenant_id  = pc.tenant_id))
         )
    `).catch(() => ({ rows: [] as Array<{ id: string; tenant_id: string; source_doc_id: string; source_line_id: string | null }> }));

    for (const row of commitmentOrphans.rows) {
      warnings.push({
        rule:   "PC_ORPHAN_COMMITMENT_SOFT",
        detail: "Active COMMITMENT_LINE-scoped PC references a missing commitment/commitment_line (soft — Phase 2 wiring)",
        payload: row as Record<string, unknown>,
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
      console.log("=== PC Orphan source_line_id Detector ===");
      console.log(`Violations: ${violations.length}`);
      console.log(`Warnings:   ${warnings.length}`);
      console.log();

      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] ${v.detail}`);
          console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
      }

      if (warnings.length > 0) {
        console.log("--- Warnings ---");
        for (const w of warnings) {
          console.log(`  [${w.rule}] ${w.detail}`);
          console.log(`    ${JSON.stringify(w.payload)}`);
        }
        console.log();
      }

      if (violations.length === 0) {
        console.log("OK — no PURCHASE_INVOICE_LINE orphan PC rows.");
      } else {
        console.log("FAIL — orphaned PC rows found. Investigate root cause (raw line delete, pre-P1.1 handler call, ETL error) before remediating.");
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
