/**
 * Retention / Advance Seeder Service (P2 v1.2).
 *
 * At invoice submit, reads PC rows of term_type IN ('retention','withholding')
 * and creates corresponding rows in document.payment_term_application (PTA).
 *
 * This service makes PC the FIRST-CLASS origin for ad-hoc retention/withholding
 * terms at the invoice, while reusing the existing PTA/PAB machinery for
 * evaluation, override, reversal, and rollup.
 *
 * NON-GOALS
 *   • Does NOT replace invoice-payment-term.service.ts. The clause-driven path
 *     (PTC → PTA) continues to run for supplier-term clauses.
 *   • Does NOT update PAB. PAB updates happen at posting via
 *     invoice-posting.service.ts (downstream). PC → PTA at submit just
 *     captures the intent; posting moves balances.
 *
 * SEEDING SHAPE
 *   PC row (term_type='retention')   →   PTA row (clause_type='RETENTION')
 *   PC row (term_type='withholding') →   PTA row (clause_type='WITHHOLDING-?'  ← NOTE)
 *
 *   The PTA clause_type CHECK currently covers RETENTION / RETENTION_RELEASE /
 *   ADVANCE / ADVANCE_RECOVERY / DUE_DATE. There is no 'WITHHOLDING' value yet;
 *   withholding seeding is deferred until the PTA CHECK is extended in a
 *   follow-on migration. P2 emits only the RETENTION rows.
 *
 *   For 'advance' application — that is, an existing advance INVOICE being
 *   applied against a new invoice — see applyAdvanceDocuments() (separate
 *   service for non-PO advance application). The PC origin path covers
 *   invoice-line retention; advance is its own flow.
 *
 * IDEMPOTENCY
 *   ON CONFLICT DO NOTHING using a UNIQUE(invoice_id, pricing_component_id,
 *   clause_code, evaluation_sequence_no) — we re-use the existing
 *   pta_invoice_clause_uq unique index on (invoice_id, clause_code,
 *   COALESCE(invoice_line_id,...), evaluation_sequence_no). For PC-origin
 *   rows we synthesize a stable clause_code from the PC id so re-submits
 *   produce the same key.
 *
 * Spec: docs/specs/pta_pab_retention_advance_overlap.md
 *       docs/specs/purchase_invoice_field_design.md §3.5 (revised)
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// =============================================================================
// Types
// =============================================================================

export interface SeederResult {
  /** Number of retention PC rows discovered. */
  retention_pc_count:  number;
  /** Number of PTA rows created. */
  pta_rows_created:    number;
  /** PTA row ids created. */
  pta_row_ids:         string[];
  /** Warnings (e.g. skipped withholding rows, missing data). */
  warnings:            string[];
}

export interface SeederLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
}

interface PcRow {
  id:                 string;
  source_doc_type:    string;
  source_doc_id:      string;
  source_line_id:     string | null;
  term_type:          string;
  condition_type_id:  string;
  computed_amount:    string;     // numeric serialized
  basis:              string;
  rate_value:         string | null;
  amount_value:       string | null;
  currency_code:      string;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Synthesize a stable clause_code for a PC-origin PTA row. The format is
 * 'PC-<term_type>-<short-uuid>' so it's recognizable in audit and unique per PC.
 */
function synthClauseCode(pcId: string, termType: string): string {
  // First 8 chars of the UUID give us ~32 bits of entropy — adequate for
  // uniqueness within one invoice.
  const short = pcId.replace(/-/g, "").slice(0, 8);
  return `PC-${termType.toUpperCase()}-${short}`;
}

/**
 * Compute the next evaluation_sequence_no for an invoice + line scope.
 * PTA's UNIQUE includes (invoice_id, clause_code, COALESCE(invoice_line_id,...),
 * evaluation_sequence_no); we assign sequences starting at 1000 + offset to
 * keep PC-origin sequences distinct from clause-driven ones (which usually
 * start at 1).
 */
function pcOriginSequence(index: number): number {
  return 1000 + index;
}

/**
 * Seed PTA rows from PC retention components for one invoice.
 *
 * Runs in the submit-handler transaction, AFTER the clause-driven
 * payment-term evaluator has populated PTA rows for the supplier term.
 */
export async function seedRetentionFromPricingComponents(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
  actor:     string,
  logger?:   SeederLogger,
): Promise<SeederResult> {
  const result: SeederResult = {
    retention_pc_count: 0,
    pta_rows_created:   0,
    pta_row_ids:        [],
    warnings:           [],
  };

  // 1) Find active PC rows for retention terms (line-scope only; header rows
  //    must be apportioned BEFORE this runs — see pricing-component.service.ts)
  const pcRows = await sql<PcRow>`
    SELECT pc.id,
           pc.source_doc_type,
           pc.source_doc_id,
           pc.source_line_id,
           pc.term_type,
           pc.condition_type_id,
           pc.computed_amount,
           pc.basis,
           pc.rate_value,
           pc.amount_value,
           pc.currency_code
      FROM document.pricing_component pc
     WHERE pc.tenant_id        = ${tenantId}::uuid
       AND pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
       AND pc.source_doc_id    = ${invoiceId}::uuid
       AND pc.term_type        IN ('retention','withholding')
       AND pc.superseded_by_id IS NULL
       AND pc.computed_amount  > 0
       AND (pc.entry_level = 'line' OR pc.is_apportioned = false)
     ORDER BY pc.source_line_id NULLS FIRST, pc.sequence
  `.execute(db);

  result.retention_pc_count = pcRows.rows.length;

  if (pcRows.rows.length === 0) {
    logger?.info("retention-advance-seeder.no-pc-rows", { invoiceId });
    return result;
  }

  // 2) For each PC row, emit a PTA row. Withholding is deferred until the
  //    PTA clause_type CHECK is extended in a follow-on migration.
  let seqOffset = 0;
  for (const pc of pcRows.rows) {
    if (pc.term_type === "withholding") {
      result.warnings.push(
        `PC ${pc.id}: term_type=withholding not yet seeded into PTA (clause_type CHECK extension pending)`,
      );
      logger?.warn("retention-advance-seeder.withholding-skipped", { pc_id: pc.id });
      continue;
    }

    // Skip header-scope rows that haven't been apportioned yet
    if (pc.source_line_id === null) {
      result.warnings.push(
        `PC ${pc.id}: header-scope retention row not apportioned to lines; skipping`,
      );
      logger?.warn("retention-advance-seeder.header-unapportioned", { pc_id: pc.id });
      continue;
    }

    const clauseCode  = synthClauseCode(pc.id, pc.term_type);
    const sequenceNo  = pcOriginSequence(seqOffset++);
    const appliedAmt  = parseFloat(pc.computed_amount);
    const basisAmt    = appliedAmt;   // PC computed_amount is already the result
    const defaultPct  = pc.basis === "percent" && pc.rate_value !== null
      ? parseFloat(pc.rate_value)
      : null;
    const defaultAmt  = pc.basis === "amount" || pc.basis === "flat"
      ? parseFloat(pc.amount_value ?? "0")
      : appliedAmt;

    // INSERT idempotently. Existing pta_invoice_clause_uq covers
    // (invoice_id, clause_code, line_id, sequence) so re-runs are no-ops.
    const inserted = await sql<{ id: string }>`
      INSERT INTO document.payment_term_application (
        tenant_id, invoice_id, invoice_line_id, commitment_id,
        payment_term_id, clause_id, pricing_component_id,
        term_snapshot, clause_snapshot,
        application_status, clause_type, clause_code,
        calculated_basis_amount, default_pct, applied_pct,
        default_amount, applied_amount,
        is_user_editable, evaluation_sequence_no,
        running_total_amount, remaining_balance_amount, is_effective,
        metadata, created_by
      )
      VALUES (
        ${tenantId}::uuid, ${invoiceId}::uuid, ${pc.source_line_id}::uuid, NULL,
        NULL, NULL, ${pc.id}::uuid,
        jsonb_build_object(
          'origin', 'PRICING_COMPONENT',
          'pc_id', ${pc.id}::text,
          'pc_term_type', ${pc.term_type}::text,
          'condition_type_id', ${pc.condition_type_id}::text,
          'pc_basis', ${pc.basis}::text
        )::jsonb,
        NULL,
        'APPLIED', 'RETENTION', ${clauseCode},
        ${basisAmt}, ${defaultPct}, ${defaultPct},
        ${defaultAmt}, ${appliedAmt},
        false, ${sequenceNo},
        0, ${appliedAmt}, true,
        '{}'::jsonb, ${actor}::uuid
      )
      ON CONFLICT (invoice_id, clause_code, COALESCE(invoice_line_id, '00000000-0000-0000-0000-000000000000'::uuid), evaluation_sequence_no)
      DO NOTHING
      RETURNING id
    `.execute(db);

    if (inserted.rows[0]) {
      result.pta_rows_created++;
      result.pta_row_ids.push(inserted.rows[0].id);
      logger?.info("retention-advance-seeder.pta-created", {
        pc_id: pc.id,
        pta_id: inserted.rows[0].id,
        applied_amount: appliedAmt,
      });
    } else {
      logger?.info("retention-advance-seeder.pta-already-exists", {
        pc_id: pc.id,
        clause_code: clauseCode,
      });
    }
  }

  logger?.info("retention-advance-seeder.complete", {
    invoiceId,
    retention_pc_count: result.retention_pc_count,
    pta_rows_created:   result.pta_rows_created,
    warnings_count:     result.warnings.length,
  });

  return result;
}


// =============================================================================
// Helper — read the synthesized clause_code for a PC row (for tests, callers)
// =============================================================================

export function synthesizedClauseCodeFor(pcId: string, termType: string): string {
  return synthClauseCode(pcId, termType);
}
