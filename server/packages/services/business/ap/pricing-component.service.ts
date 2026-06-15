/**
 * Pricing Component Service (P1 v1.2).
 *
 * The waterfall engine for procurement-document pricing terms. Replaces the
 * flat discount/charge/tax/withholding/retention columns on parent documents
 * (PI, PIL; future: PO, SO, SI) with rows in document.pricing_component (PC).
 *
 * P1 SCOPE — SHADOW MODE
 *   • This service writes PC rows but does NOT yet drive AD generation or
 *     update parent flat-amount columns. P3 wires posting; P4 wires the cache
 *     refresh trigger.
 *   • Existing posting paths (invoice-posting.service.ts) continue to read
 *     header/line flat amounts directly. PC is captured in parallel for
 *     validation and future migration.
 *
 * RESPONSIBILITIES
 *   1. createComponent      — INSERT a PC row with computed amounts.
 *   2. supersedeComponent   — Mark a PC row superseded; insert a replacement.
 *   3. apportionToLines     — Header-scope PC → line-scope sibling rows by
 *                              apportion_basis (value/quantity/weight/equal).
 *   4. resolveWaterfall     — Read the active PC rows for a source line in
 *                              sequence order; return computed totals.
 *   5. validatePcInvariants — PC-specific drift checks for submit/post phases.
 *
 * SIGN CONVENTION
 *   computed_amount is stored as a non-negative magnitude. The signed effect
 *   on totals derives from term_type at posting:
 *     discount, withholding, retention → subtract from base
 *     charge, tax                      → add to base
 *     principal_marker                 → neutral (audit anchor)
 *
 * TENANCY
 *   Every call requires tenantId; the service NEVER assumes RLS will cover
 *   missing predicates. All queries explicitly filter tenant_id.
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §3.3, §6, §8
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// =============================================================================
// Types
// =============================================================================

export type TermType =
  | "discount"
  | "charge"
  | "tax"
  | "withholding"
  | "retention"
  | "principal_marker";

export type Basis = "percent" | "amount" | "per_unit" | "flat";

export type EntryLevel = "header" | "line";

export type ApportionBasis = "value" | "quantity" | "weight" | "equal";

export type Origin = "manual" | "inherited" | "vendor_default" | "system_resolved";

export type SourceDocType =
  | "PURCHASE_REQUISITION_LINE"
  | "COMMITMENT_LINE"
  | "PURCHASE_INVOICE_LINE"
  | "GOODS_RECEIPT_LINE"
  | "SERVICE_ENTRY_SHEET_LINE";

export type AccountSource =
  | "POSTING_ROLE"
  | "FIXED"
  | "FROM_INTENT"
  | "FROM_CATEGORY";

export interface CreateComponentInput {
  source_doc_type:          SourceDocType;
  source_doc_id:            string;
  source_line_id:           string | null;

  term_type:                TermType;
  condition_type_id:        string;
  sequence?:                number;

  basis:                    Basis;
  rate_value?:              number | null;
  amount_value?:            number | null;
  base_for_calculation?:    number | null;

  entry_level:              EntryLevel;
  apportion_basis?:         ApportionBasis | null;

  origin?:                  Origin;
  ref_source_doc_type?:     string | null;
  ref_source_doc_id?:       string | null;
  ref_source_line_id?:      string | null;
  ref_value?:               number | null;

  tax_group_id?:            string | null;
  is_inclusive?:            boolean | null;
  recoverable_pct?:         number | null;
  tax_section_code?:        string | null;

  currency_code:            string;
  base_currency_code:       string;
  exchange_rate:            number;

  business_intent_id?:      string | null;
  posting_role_code?:       string | null;
  gl_account_id?:           string | null;
  account_source?:          AccountSource | null;
}

export interface ApportionInput {
  tenantId:        string;
  /** The header-scope PC row to apportion. */
  headerPcId:      string;
  /** Optional explicit basis override; otherwise the row's apportion_basis. */
  basisOverride?:  ApportionBasis;
  /** Actor performing the apportionment (audit). */
  actor:           string;
}

export interface ApportionResult {
  source_pc_id:      string;
  line_pc_ids:       string[];
  total_apportioned: number;
}

export interface WaterfallTotals {
  discount:    number;
  charge:      number;
  tax:         number;
  withholding: number;
  retention:   number;
}

export interface WaterfallRowSummary {
  id:                 string;
  term_type:          TermType;
  condition_type_id:  string;
  sequence:           number;
  computed_amount:    number;
  computed_base_amount: number;
}

export interface WaterfallResult {
  source_doc_type:   SourceDocType;
  source_doc_id:     string;
  source_line_id:    string | null;
  rows:              WaterfallRowSummary[];
  totals:            WaterfallTotals;
}

export interface PcInvariantViolation {
  code:    "PC_BASIS_VALUE_DRIFT" | "PC_APPORTION_SUM_DRIFT" | "PC_SUPERSEDE_CHAIN_BROKEN";
  message: string;
  details: Record<string, unknown>;
}

// =============================================================================
// Pure helpers
// =============================================================================

/**
 * Compute the magnitude of a PC term given its basis and a base amount.
 *
 *   percent  → base * (rate / 100)
 *   per_unit → rate * baseValue  (baseValue carries quantity)
 *   amount / flat → amount_value verbatim
 *
 * Returned value is always non-negative; the signed effect on parent totals
 * derives from term_type at posting.
 */
export function computeMagnitude(
  basis:        Basis,
  rateValue:    number | null,
  amountValue:  number | null,
  baseValue:    number | null,
): number {
  switch (basis) {
    case "percent":
      if (rateValue == null || baseValue == null) return 0;
      return Math.max(0, baseValue * (rateValue / 100));
    case "per_unit":
      if (rateValue == null || baseValue == null) return 0;
      return Math.max(0, rateValue * baseValue);
    case "amount":
    case "flat":
      if (amountValue == null) return 0;
      return Math.max(0, amountValue);
    default:
      return 0;
  }
}

// =============================================================================
// createComponent
// =============================================================================

/**
 * INSERT a new PC row. The validation trigger
 * (fn_pc_validate_polymorphic_source) verifies the source parent exists; the
 * basis/value CHECK constraints verify shape. This service computes
 * computed_amount and computed_base_amount before INSERT.
 *
 * company_code_id is sourced from the parent PI to keep PC + PI consistent.
 *
 * Returns the new PC row id.
 */
export async function createComponent(
  db:       AnyDb,
  tenantId: string,
  actor:    string,
  input:    CreateComponentInput,
): Promise<string> {
  const computed     = computeMagnitude(
    input.basis,
    input.rate_value ?? null,
    input.amount_value ?? null,
    input.base_for_calculation ?? null,
  );
  const computedBase = computed * input.exchange_rate;
  const sequence     = input.sequence ?? 100;
  const origin       = input.origin ?? "manual";

  const result = await sql<{ id: string }>`
    INSERT INTO document.pricing_component (
      tenant_id, company_code_id,
      source_doc_type, source_doc_id, source_line_id,
      term_type, condition_type_id, sequence,
      basis, rate_value, amount_value, base_for_calculation,
      computed_amount, computed_base_amount,
      entry_level, apportion_basis,
      origin, ref_source_doc_type, ref_source_doc_id, ref_source_line_id, ref_value,
      tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
      currency_code, base_currency_code, exchange_rate,
      business_intent_id, posting_role_code, gl_account_id, account_source,
      created_by
    )
    SELECT
      ${tenantId}::uuid,
      pi.company_code_id,
      ${input.source_doc_type},
      ${input.source_doc_id}::uuid,
      ${input.source_line_id}::uuid,
      ${input.term_type},
      ${input.condition_type_id}::uuid,
      ${sequence},
      ${input.basis},
      ${input.rate_value},
      ${input.amount_value},
      ${input.base_for_calculation},
      ${computed},
      ${computedBase},
      ${input.entry_level},
      ${input.apportion_basis ?? null},
      ${origin},
      ${input.ref_source_doc_type ?? null},
      ${input.ref_source_doc_id ?? null}::uuid,
      ${input.ref_source_line_id ?? null}::uuid,
      ${input.ref_value ?? null},
      ${input.tax_group_id ?? null}::uuid,
      ${input.is_inclusive ?? null},
      ${input.recoverable_pct ?? null},
      ${input.tax_section_code ?? null},
      ${input.currency_code},
      ${input.base_currency_code},
      ${input.exchange_rate},
      ${input.business_intent_id ?? null}::uuid,
      ${input.posting_role_code ?? null},
      ${input.gl_account_id ?? null}::uuid,
      ${input.account_source ?? null},
      ${actor}::uuid
    FROM document.purchase_invoice pi
   WHERE pi.id        = ${input.source_doc_id}::uuid
     AND pi.tenant_id = ${tenantId}::uuid
   RETURNING id
  `.execute(db);

  const firstRow = result.rows[0];
  if (!firstRow) {
    throw new Error(`PC_CREATE_FAILED: parent PI ${input.source_doc_id} not found in tenant ${tenantId}`);
  }
  return firstRow.id;
}

// =============================================================================
// supersedeComponent
// =============================================================================

/**
 * Mark a PC row as superseded by inserting a replacement and pointing the old
 * row's supersede tuple at the new row.
 *
 * Allowed in parent statuses: draft, rejected, pending_approval, approved,
 * on_hold (i.e., everywhere except posted / terminal — the supersede-only
 * trigger enforces this).
 */
export async function supersedeComponent(
  db:           AnyDb,
  tenantId:     string,
  actor:        string,
  oldPcId:      string,
  replacement:  CreateComponentInput,
): Promise<{ oldId: string; newId: string }> {
  return await db.transaction().execute(async (trx) => {
    const newId = await createComponent(trx, tenantId, actor, replacement);

    await sql`
      UPDATE document.pricing_component
         SET superseded_by_id   = ${newId}::uuid,
             superseded_at      = now(),
             superseded_by_user = ${actor}::uuid,
             updated_by         = ${actor}::uuid,
             updated_at         = now()
       WHERE id        = ${oldPcId}::uuid
         AND tenant_id = ${tenantId}::uuid
    `.execute(trx);

    return { oldId: oldPcId, newId };
  });
}

// =============================================================================
// apportionToLines
// =============================================================================

/**
 * Apportion a header-scope PC row to line-scope sibling rows.
 *
 *   - Reads the header PC row and the active PILs under its source_doc_id.
 *   - For each PIL, computes a share per apportion_basis:
 *       value    → share = PIL.net_amount / SUM(PIL.net_amount)
 *       quantity → share = PIL.quantity   / SUM(PIL.quantity)
 *       equal    → share = 1 / N
 *       weight   → currently unsupported (raises) — Phase 2
 *   - INSERTs N line-scope PC rows with is_apportioned=true,
 *     is_apportioned_from_id=<header_pc_id>.
 *   - Marks the header row is_apportioned=true.
 *
 * Idempotent: re-running on an already-apportioned header is a no-op
 * (it returns the existing line PC ids).
 */
export async function apportionToLines(
  db:    AnyDb,
  input: ApportionInput,
): Promise<ApportionResult> {
  return await db.transaction().execute(async (trx) => {
    const headerQuery = await sql<{
      id:                   string;
      source_doc_type:      string;
      source_doc_id:        string;
      term_type:            string;
      condition_type_id:    string;
      sequence:             number;
      computed_amount:      string;
      entry_level:          string;
      apportion_basis:      string | null;
      is_apportioned:       boolean;
      origin:               string;
      currency_code:        string;
      base_currency_code:   string;
      exchange_rate:        string;
      business_intent_id:   string | null;
      posting_role_code:    string | null;
      account_source:       string | null;
      tax_group_id:         string | null;
      is_inclusive:         boolean | null;
      recoverable_pct:      string | null;
      tax_section_code:     string | null;
    }>`
      SELECT id, source_doc_type, source_doc_id, term_type, condition_type_id,
             sequence, computed_amount,
             entry_level, apportion_basis, is_apportioned,
             origin, currency_code, base_currency_code, exchange_rate,
             business_intent_id, posting_role_code, account_source,
             tax_group_id, is_inclusive, recoverable_pct, tax_section_code
        FROM document.pricing_component
       WHERE id        = ${input.headerPcId}::uuid
         AND tenant_id = ${input.tenantId}::uuid
    `.execute(trx);

    const header = headerQuery.rows[0];
    if (!header) {
      throw new Error(`PC_NOT_FOUND: ${input.headerPcId} (tenant ${input.tenantId})`);
    }
    if (header.entry_level !== "header") {
      throw new Error(`PC_APPORTION_NOT_HEADER: ${input.headerPcId} entry_level=${header.entry_level}`);
    }
    if (header.source_doc_type !== "PURCHASE_INVOICE_LINE") {
      throw new Error(`PC_APPORTION_UNSUPPORTED_SOURCE: ${header.source_doc_type}`);
    }

    const basis = input.basisOverride ?? (header.apportion_basis as ApportionBasis | null);
    if (basis == null) {
      throw new Error(`PC_APPORTION_BASIS_MISSING: PC ${input.headerPcId} has no apportion_basis`);
    }
    if (basis === "weight") {
      throw new Error("PC_APPORTION_WEIGHT_UNSUPPORTED: weight basis is Phase 2");
    }

    // Idempotency
    if (header.is_apportioned) {
      const existing = await sql<{ id: string }>`
        SELECT id FROM document.pricing_component
         WHERE tenant_id              = ${input.tenantId}::uuid
           AND is_apportioned_from_id = ${input.headerPcId}::uuid
           AND superseded_by_id IS NULL
      `.execute(trx);
      return {
        source_pc_id:      input.headerPcId,
        line_pc_ids:       existing.rows.map((r) => r.id),
        total_apportioned: parseFloat(header.computed_amount),
      };
    }

    const pilsQuery = await sql<{ id: string; net_amount: string; quantity: string }>`
      SELECT id, net_amount, quantity
        FROM document.purchase_invoice_line
       WHERE tenant_id           = ${input.tenantId}::uuid
         AND purchase_invoice_id = ${header.source_doc_id}::uuid
       ORDER BY line_no
    `.execute(trx);

    const pils = pilsQuery.rows;
    if (pils.length === 0) {
      return { source_pc_id: input.headerPcId, line_pc_ids: [], total_apportioned: 0 };
    }

    const totalAmount = parseFloat(header.computed_amount);
    const sumValue    = pils.reduce((acc, p) => acc + parseFloat(p.net_amount), 0);
    const sumQty      = pils.reduce((acc, p) => acc + parseFloat(p.quantity),   0);

    const lineIds: string[] = [];
    let runningAllocated = 0;

    for (let i = 0; i < pils.length; i++) {
      const pil = pils[i]!;
      let share: number;
      switch (basis) {
        case "value":
          share = sumValue > 0 ? parseFloat(pil.net_amount) / sumValue : 0;
          break;
        case "quantity":
          share = sumQty > 0 ? parseFloat(pil.quantity) / sumQty : 0;
          break;
        case "equal":
          share = 1 / pils.length;
          break;
        default:
          share = 0;
      }

      // Last row absorbs rounding remainder
      let allocated: number;
      if (i === pils.length - 1) {
        allocated = totalAmount - runningAllocated;
      } else {
        allocated = Math.round(totalAmount * share * 100) / 100;
        runningAllocated += allocated;
      }

      const lineId = await createComponent(trx, input.tenantId, input.actor, {
        source_doc_type:      header.source_doc_type as SourceDocType,
        source_doc_id:        header.source_doc_id,
        source_line_id:       pil.id,
        term_type:            header.term_type as TermType,
        condition_type_id:    header.condition_type_id,
        sequence:             header.sequence,
        basis:                "amount",
        amount_value:         allocated,
        entry_level:          "line",
        origin:               "system_resolved",
        currency_code:        header.currency_code,
        base_currency_code:   header.base_currency_code,
        exchange_rate:        parseFloat(header.exchange_rate),
        business_intent_id:   header.business_intent_id,
        posting_role_code:    header.posting_role_code,
        account_source:       header.account_source as AccountSource | null,
        tax_group_id:         header.tax_group_id,
        is_inclusive:         header.is_inclusive,
        recoverable_pct:      header.recoverable_pct == null ? null : parseFloat(header.recoverable_pct),
        tax_section_code:     header.tax_section_code,
      });

      // Stamp apportionment lineage
      await sql`
        UPDATE document.pricing_component
           SET is_apportioned         = true,
               is_apportioned_from_id = ${input.headerPcId}::uuid,
               updated_by             = ${input.actor}::uuid,
               updated_at             = now()
         WHERE id        = ${lineId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
      `.execute(trx);

      lineIds.push(lineId);
    }

    // Mark header as apportioned
    await sql`
      UPDATE document.pricing_component
         SET is_apportioned = true,
             updated_by     = ${input.actor}::uuid,
             updated_at     = now()
       WHERE id        = ${input.headerPcId}::uuid
         AND tenant_id = ${input.tenantId}::uuid
    `.execute(trx);

    return {
      source_pc_id:      input.headerPcId,
      line_pc_ids:       lineIds,
      total_apportioned: totalAmount,
    };
  });
}

// =============================================================================
// resolveWaterfall
// =============================================================================

/**
 * Read the active waterfall for a source (PIL or PI-header). Returns rows in
 * sequence order with aggregated magnitudes per term_type.
 */
export async function resolveWaterfall(
  db:             AnyDb,
  tenantId:       string,
  sourceDocType:  SourceDocType,
  sourceDocId:    string,
  sourceLineId:   string | null,
): Promise<WaterfallResult> {
  const result = await sql<{
    id:                   string;
    term_type:            string;
    condition_type_id:    string;
    sequence:             number;
    computed_amount:      string;
    computed_base_amount: string;
  }>`
    SELECT id, term_type, condition_type_id, sequence,
           computed_amount, computed_base_amount
      FROM document.pricing_component
     WHERE tenant_id        = ${tenantId}::uuid
       AND source_doc_type  = ${sourceDocType}
       AND source_doc_id    = ${sourceDocId}::uuid
       AND (
         (${sourceLineId}::uuid IS NULL AND source_line_id IS NULL)
         OR source_line_id = ${sourceLineId}::uuid
       )
       AND superseded_by_id IS NULL
     ORDER BY sequence ASC, created_at ASC
  `.execute(db);

  const totals: WaterfallTotals = {
    discount:    0,
    charge:      0,
    tax:         0,
    withholding: 0,
    retention:   0,
  };
  const rows: WaterfallRowSummary[] = [];

  for (const r of result.rows) {
    const amt    = parseFloat(r.computed_amount);
    const amtBase = parseFloat(r.computed_base_amount);

    rows.push({
      id:                   r.id,
      term_type:            r.term_type as TermType,
      condition_type_id:    r.condition_type_id,
      sequence:             r.sequence,
      computed_amount:      amt,
      computed_base_amount: amtBase,
    });

    switch (r.term_type as TermType) {
      case "discount":         totals.discount    += amt; break;
      case "charge":           totals.charge      += amt; break;
      case "tax":              totals.tax         += amt; break;
      case "withholding":      totals.withholding += amt; break;
      case "retention":        totals.retention   += amt; break;
      case "principal_marker": /* skip — audit anchor only */ break;
    }
  }

  return {
    source_doc_type:  sourceDocType,
    source_doc_id:    sourceDocId,
    source_line_id:   sourceLineId,
    rows,
    totals,
  };
}

// =============================================================================
// validatePcInvariants
// =============================================================================

/**
 * PC-specific invariant checks for the cross-entity invariants service.
 * Aggregates violations; the caller decides whether to throw.
 *
 *   • PC_APPORTION_SUM_DRIFT   — apportioned children sum ≠ parent header
 *   • PC_SUPERSEDE_CHAIN_BROKEN — superseded_by_id points at missing row
 *
 * PC_BASIS_VALUE_DRIFT is enforced by computeMagnitude at create-time and
 * therefore omitted from runtime drift checks; future writers that bypass
 * the service should be detected by a separate scan.
 */
export async function validatePcInvariants(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
): Promise<PcInvariantViolation[]> {
  const violations: PcInvariantViolation[] = [];

  // PC_APPORTION_SUM_DRIFT
  const apportionDrift = await sql<{
    parent_id:     string;
    parent_amount: string;
    child_sum:     string;
    drift:         string;
  }>`
    SELECT parent.id                                            AS parent_id,
           parent.computed_amount                               AS parent_amount,
           SUM(child.computed_amount)                           AS child_sum,
           abs(parent.computed_amount - SUM(child.computed_amount)) AS drift
      FROM document.pricing_component parent
      JOIN document.pricing_component child
        ON child.is_apportioned_from_id = parent.id
       AND child.superseded_by_id IS NULL
     WHERE parent.tenant_id        = ${tenantId}::uuid
       AND parent.source_doc_id    = ${invoiceId}::uuid
       AND parent.entry_level      = 'header'
       AND parent.is_apportioned   = true
       AND parent.superseded_by_id IS NULL
     GROUP BY parent.id, parent.computed_amount
    HAVING abs(parent.computed_amount - SUM(child.computed_amount)) > 0.01
  `.execute(db);

  for (const row of apportionDrift.rows) {
    violations.push({
      code:    "PC_APPORTION_SUM_DRIFT",
      message: `PC ${row.parent_id}: apportioned children sum ${row.child_sum} drifts from parent ${row.parent_amount} by ${row.drift}`,
      details: {
        parent_id:     row.parent_id,
        parent_amount: row.parent_amount,
        child_sum:     row.child_sum,
        drift:         row.drift,
      },
    });
  }

  // PC_SUPERSEDE_CHAIN_BROKEN
  const brokenSupersede = await sql<{ id: string; superseded_by_id: string }>`
    SELECT p.id, p.superseded_by_id
      FROM document.pricing_component p
     WHERE p.tenant_id        = ${tenantId}::uuid
       AND p.source_doc_id    = ${invoiceId}::uuid
       AND p.superseded_by_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM document.pricing_component s
          WHERE s.id = p.superseded_by_id AND s.tenant_id = p.tenant_id
       )
  `.execute(db);

  for (const row of brokenSupersede.rows) {
    violations.push({
      code:    "PC_SUPERSEDE_CHAIN_BROKEN",
      message: `PC ${row.id}: superseded_by_id ${row.superseded_by_id} not found`,
      details: { id: row.id, superseded_by_id: row.superseded_by_id },
    });
  }

  return violations;
}
