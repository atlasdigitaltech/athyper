#!/usr/bin/env tsx
/**
 * PTA ↔ PC Link Verification (P2 pre-check + ongoing audit)
 *
 * Pre-check before VALIDATEing pta_pc_origin_clause_type_chk on existing data,
 * and a CI audit that detects drift between PC retention rows and PTA rows.
 *
 * Checks:
 *   1. pta_pc_origin_clause_type_chk pre-check — every PTA row that has
 *      pricing_component_id NOT NULL must use a retention/advance clause_type.
 *
 *   2. Orphan PTA — pricing_component_id points at a row that doesn't exist
 *      in document.pricing_component (FK should prevent this, but check
 *      across tenant boundary).
 *
 *   3. Drift — every PC row of term_type='retention' with positive
 *      computed_amount and source_line_id NOT NULL should have at least one
 *      corresponding PTA row with pricing_component_id = PC.id and
 *      clause_type='RETENTION'.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/verify-pta-pc-link.ts
 *   npx tsx server/scripts/verify-pta-pc-link.ts --json
 *
 * Exit:
 *   0 — all checks pass
 *   1 — violations found
 *
 * Spec: docs/specs/pta_pab_retention_advance_overlap.md
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
    // Check 1 — pta_pc_origin_clause_type_chk pre-check
    // -------------------------------------------------------------------------
    const wrongClauseType = await pool.query<{
      id: string;
      pricing_component_id: string;
      clause_type: string;
    }>(`
      SELECT id, pricing_component_id, clause_type
        FROM document.payment_term_application
       WHERE pricing_component_id IS NOT NULL
         AND clause_type NOT IN ('RETENTION','RETENTION_RELEASE','ADVANCE','ADVANCE_RECOVERY')
    `);

    for (const row of wrongClauseType.rows) {
      violations.push({
        rule:   "PTA_PC_ORIGIN_WRONG_CLAUSE_TYPE",
        detail: "PTA row with pricing_component_id has non-retention/non-advance clause_type",
        payload: {
          pta_id:                row.id,
          pricing_component_id:  row.pricing_component_id,
          clause_type:           row.clause_type,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 2 — Orphan PTA.pricing_component_id (FK should prevent, but verify)
    // -------------------------------------------------------------------------
    const orphans = await pool.query<{ id: string; pricing_component_id: string; tenant_id: string }>(`
      SELECT pta.id, pta.pricing_component_id, pta.tenant_id
        FROM document.payment_term_application pta
   LEFT JOIN document.pricing_component pc
          ON pc.id = pta.pricing_component_id
         AND pc.tenant_id = pta.tenant_id
       WHERE pta.pricing_component_id IS NOT NULL
         AND pc.id IS NULL
    `);

    for (const row of orphans.rows) {
      violations.push({
        rule:   "PTA_PC_ORPHAN",
        detail: "PTA.pricing_component_id points at non-existent PC row",
        payload: {
          pta_id:               row.id,
          pricing_component_id: row.pricing_component_id,
          tenant_id:            row.tenant_id,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Check 3 — PC retention without corresponding PTA (drift warning)
    // -------------------------------------------------------------------------
    const drift = await pool.query<{
      pc_id: string;
      invoice_id: string;
      computed_amount: string;
    }>(`
      SELECT pc.id AS pc_id, pc.source_doc_id AS invoice_id, pc.computed_amount
        FROM document.pricing_component pc
       WHERE pc.term_type        = 'retention'
         AND pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
         AND pc.source_line_id   IS NOT NULL
         AND pc.superseded_by_id IS NULL
         AND pc.computed_amount  > 0
         AND NOT EXISTS (
              SELECT 1 FROM document.payment_term_application pta
               WHERE pta.pricing_component_id = pc.id
                 AND pta.tenant_id            = pc.tenant_id
                 AND pta.clause_type          = 'RETENTION'
                 AND pta.is_effective         = true
         )
        -- Only flag for invoices past draft (the seeder runs at submit; drafts haven't submitted yet)
         AND EXISTS (
              SELECT 1 FROM document.purchase_invoice pi
               WHERE pi.id        = pc.source_doc_id
                 AND pi.tenant_id = pc.tenant_id
                 AND pi.status NOT IN ('draft','rejected','cancelled')
         )
    `);

    for (const row of drift.rows) {
      warnings.push({
        rule:   "PC_RETENTION_PTA_DRIFT",
        detail: "PC retention row has no corresponding PTA — seeder may not have run",
        payload: {
          pc_id:           row.pc_id,
          invoice_id:      row.invoice_id,
          computed_amount: row.computed_amount,
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
      console.log("=== PTA ↔ PC Link Verification ===");
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
        console.log("OK — PTA ↔ PC link integrity clean.");
      } else {
        console.log("FAIL — fix violations before issuing VALIDATE CONSTRAINT.");
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
