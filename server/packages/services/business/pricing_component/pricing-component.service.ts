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
import {
  apportion as apportionDeterministic,
  defaultSequenceFor,
} from "./pc-precedence.js";

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
  | "purchase_requisition_line"
  | "commitment_line"
  | "purchase_invoice_line"
  | "receipt_line"
  | "service_sheet_line";

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

  /**
   * WHT snapshot metadata (D8). For term_type='withholding' the caller MUST
   * supply { rate_schedule_id, wht_basis, resolved_rate, jurisdiction_id?,
   * effective_from? } so the determination stays stable if upstream rate
   * schedules mutate later. Enforced by pc_wht_metadata_snapshot_chk and the
   * validateWhtInput() guard in createComponent/supersedeComponent.
   */
  metadata?:                Record<string, unknown> | null;

  currency_code:            string;
  base_currency_code:       string;
  exchange_rate:            number;
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
  code:
    | "PC_BASIS_VALUE_DRIFT"
    | "PC_APPORTION_SUM_DRIFT"
    | "PC_SUPERSEDE_CHAIN_BROKEN"
    | "PC_BASE_REQUIRED_FOR_BASIS";
  message: string;
  details: Record<string, unknown>;
}

export interface SavePricingComponentsInput {
  source_doc_type: SourceDocType;
  source_doc_id:   string;
  source_line_id:  string | null;
  rows:            CreateComponentInput[];
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
// WHT validation (WS-B audit gate)
// =============================================================================

export type PcValidationErrorCode =
  | "WHT_TAX_GROUP_REQUIRED"
  | "WHT_TAX_GROUP_NOT_WITHHOLDING"
  | "WHT_IS_INCLUSIVE_FORBIDDEN"
  | "WHT_RECOVERABLE_PCT_FORBIDDEN"
  | "WHT_SECTION_CODE_REQUIRED"
  | "WHT_METADATA_SNAPSHOT_REQUIRED"
  | "WHT_ENTITY_CLASS_NOT_ALLOWED";

export class PcValidationError extends Error {
  readonly code: PcValidationErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: PcValidationErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

interface WhtGroupContext {
  isWhtGroup:           boolean;
  jurisdictionId:       string | null;
  whtSectionRequired:   boolean;
}

/**
 * Resolve whether the given tax_group is configured for withholding and whether
 * its jurisdiction requires a section code on every WHT PC row.
 *
 * A "WHT group" is one that has at least one tax_group_component whose underlying
 * tax_rate_schedule carries a non-null wht_basis. This is the same discriminator
 * tax-calculation.service.ts uses to split tax vs WHT amounts.
 */
async function resolveWhtGroupContext(
  db:       AnyDb,
  tenantId: string,
  taxGroupId: string,
): Promise<WhtGroupContext> {
  const result = await sql<{
    is_wht_group:           boolean;
    jurisdiction_id:        string | null;
    wht_section_required:   boolean | null;
  }>`
    SELECT
      EXISTS (
        SELECT 1
        FROM control.tax_group_component tgc
        JOIN control.tax_rate_schedule trs
          ON trs.tenant_id = tgc.tenant_id
         AND trs.id        = tgc.tax_rate_schedule_id
        WHERE tgc.tenant_id    = ${tenantId}::uuid
          AND tgc.tax_group_id = ${taxGroupId}::uuid
          AND trs.wht_basis IS NOT NULL
      ) AS is_wht_group,
      tg.jurisdiction_id,
      EXISTS (
        SELECT 1
        FROM control.tax_group_component tgc
        JOIN control.tax_rate_schedule trs
          ON trs.tenant_id = tgc.tenant_id
         AND trs.id        = tgc.tax_rate_schedule_id
        JOIN master.tax_type tt
          ON tt.tenant_id = trs.tenant_id
         AND tt.id        = trs.tax_type_id
        WHERE tgc.tenant_id    = ${tenantId}::uuid
          AND tgc.tax_group_id = ${taxGroupId}::uuid
          AND trs.wht_basis IS NOT NULL
          AND tt.status = 'active'
          AND tt.section_code_mode = 'required'
      ) AS wht_section_required
    FROM control.tax_group tg
    WHERE tg.tenant_id = ${tenantId}::uuid
      AND tg.id        = ${taxGroupId}::uuid
  `.execute(db);

  const row = result.rows[0];
  return {
    isWhtGroup:         row?.is_wht_group         ?? false,
    jurisdictionId:     row?.jurisdiction_id      ?? null,
    whtSectionRequired: row?.wht_section_required ?? false,
  };
}

/**
 * Hard validation for term_type='withholding' inputs. Mirrors the DDL CHECK
 * constraints (pc_wht_not_inclusive_chk, pc_wht_no_recoverable_chk,
 * pc_wht_metadata_snapshot_chk) but throws structured errors with codes the
 * route layer can surface as 400-class problem-details. Authoritative source
 * of truth — never trust client-side validation alone.
 *
 * Required for WHT:
 *   • tax_group_id set
 *   • the tax_group is a WHT group (has wht_basis IS NOT NULL on a component)
 *   • is_inclusive ∈ {false, null} — WHT is always exclusive
 *   • recoverable_pct ∈ {0, null} — WHT is not an input-credit
 *   • tax_section_code set when the jurisdiction requires it
 *   • metadata snapshot contains rate_schedule_id, wht_basis, resolved_rate
 *
 * No-op for non-WHT term types.
 */
async function validateWhtInput(
  db:       AnyDb,
  tenantId: string,
  input:    Pick<CreateComponentInput,
    "term_type" | "tax_group_id" | "is_inclusive" | "recoverable_pct"
    | "tax_section_code" | "metadata">,
): Promise<void> {
  if (input.term_type !== "withholding") return;

  if (!input.tax_group_id) {
    throw new PcValidationError(
      "WHT_TAX_GROUP_REQUIRED",
      "WHT pricing component requires a tax_group_id.",
    );
  }
  if (input.is_inclusive === true) {
    throw new PcValidationError(
      "WHT_IS_INCLUSIVE_FORBIDDEN",
      "WHT pricing components must be exclusive (is_inclusive=false or null).",
    );
  }
  if (input.recoverable_pct != null && input.recoverable_pct !== 0) {
    throw new PcValidationError(
      "WHT_RECOVERABLE_PCT_FORBIDDEN",
      "WHT is a payment-time deduction, not an input credit; recoverable_pct must be 0 or null.",
      { recoverable_pct: input.recoverable_pct },
    );
  }

  const meta = input.metadata ?? {};
  if (!("rate_schedule_id" in meta) || !("wht_basis" in meta) || !("resolved_rate" in meta)) {
    throw new PcValidationError(
      "WHT_METADATA_SNAPSHOT_REQUIRED",
      "WHT pricing component metadata must snapshot { rate_schedule_id, wht_basis, resolved_rate } at create-time (D8 immutability guarantee).",
      { missing: ["rate_schedule_id","wht_basis","resolved_rate"].filter((k) => !(k in meta)) },
    );
  }

  const ctx = await resolveWhtGroupContext(db, tenantId, input.tax_group_id);
  if (!ctx.isWhtGroup) {
    throw new PcValidationError(
      "WHT_TAX_GROUP_NOT_WITHHOLDING",
      "Selected tax_group has no component carrying wht_basis; cannot be used for term_type='withholding'.",
      { tax_group_id: input.tax_group_id },
    );
  }
  if (ctx.whtSectionRequired && !input.tax_section_code) {
    throw new PcValidationError(
      "WHT_SECTION_CODE_REQUIRED",
      "This jurisdiction requires a withholding section code on every WHT pricing component.",
      { jurisdiction_id: ctx.jurisdictionId },
    );
  }
}

// =============================================================================
// createComponent
// =============================================================================

/**
 * INSERT a new PC row + refresh PIL/PI flat caches. Thin wrapper over
 * `createComponentRow` so single-row callers don't have to remember the
 * trailing refresh.
 *
 * Returns the new PC row id.
 */
export async function createComponent(
  db:       AnyDb,
  tenantId: string,
  actor:    string,
  input:    CreateComponentInput,
): Promise<string> {
  return await db.transaction().execute(async (trx) => {
    await validateWhtInput(trx, tenantId, input);
    const id = await createComponentRow(trx, tenantId, actor, input);
    await refreshSourceCaches(trx, tenantId, input.source_doc_type, input.source_doc_id);
    await writePricingComponentAudit(trx, {
      tenantId,
      actor,
      sourceDocType: input.source_doc_type,
      sourceDocId: input.source_doc_id,
      oldValues: null,
      newValues: { action: "create", id, input },
    });
    return id;
  });
}

/**
 * Replace all current PC rows for one source in a single parent-gated command.
 * PC history is captured through log.audit_log and lifecycle snapshots instead
 * of a PC-specific lifecycle chain.
 */
export async function savePricingComponents(
  db:       AnyDb,
  tenantId: string,
  actor:    string,
  input:    SavePricingComponentsInput,
): Promise<{ insertedIds: string[]; deletedCount: number }> {
  return await db.transaction().execute(async (trx) => {
    for (const row of input.rows) {
      await validateWhtInput(trx, tenantId, row);
    }

    const before = await loadPricingComponentsForSource(
      trx,
      tenantId,
      input.source_doc_type,
      input.source_doc_id,
      input.source_line_id,
    );

    const deleted = await sql<{ id: string }>`
      DELETE FROM document.pricing_component
       WHERE tenant_id       = ${tenantId}::uuid
         AND source_doc_type = ${input.source_doc_type}
         AND source_doc_id   = ${input.source_doc_id}::uuid
         AND (
           (${input.source_line_id}::uuid IS NULL AND source_line_id IS NULL)
           OR source_line_id = ${input.source_line_id}::uuid
         )
       RETURNING id
    `.execute(trx);

    const insertedIds: string[] = [];
    for (const row of input.rows) {
      insertedIds.push(await createComponentRow(trx, tenantId, actor, row));
    }

    await refreshSourceCaches(trx, tenantId, input.source_doc_type, input.source_doc_id);

    const after = await loadPricingComponentsForSource(
      trx,
      tenantId,
      input.source_doc_type,
      input.source_doc_id,
      input.source_line_id,
    );

    await writePricingComponentAudit(trx, {
      tenantId,
      actor,
      sourceDocType: input.source_doc_type,
      sourceDocId: input.source_doc_id,
      oldValues: { action: "replace", rows: before },
      newValues: { action: "replace", rows: after },
    });

    return { insertedIds, deletedCount: deleted.rows.length };
  });
}

/**
 * Pure INSERT — no cache refresh. Internal helper used by `createComponent`
 * (single-row) and `supersedeComponent` (refresh deferred to after the
 * supersede UPDATE flips v1 inactive). Multi-row apportionment uses its own
 * bulk INSERT path instead of calling this in a loop.
 *
 * The validation trigger (fn_pc_validate_polymorphic_source) verifies the
 * source parent exists; basis/value CHECK constraints verify shape. This
 * helper computes computed_amount and computed_base_amount before INSERT.
 * company_code_id is sourced from the parent PI to keep PC + PI consistent.
 */
async function createComponentRow(
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
  // WS-PRECEDENCE: term_type-aware default sequence (100/200/300/400) so
  // discount→charge→tax→withholding ordering is deterministic without
  // requiring the caller to remember the policy.
  const sequence     = input.sequence ?? defaultSequenceFor(input.term_type);
  const origin       = input.origin ?? "manual";

  const metadataJson = JSON.stringify(input.metadata ?? {});

  const companyCodeId = await resolveSourceCompanyCodeId(db, tenantId, input.source_doc_type, input.source_doc_id);
  if (!companyCodeId) {
    throw new Error(`PC_CREATE_FAILED: parent ${input.source_doc_type} ${input.source_doc_id} not found in tenant ${tenantId}`);
  }

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
      metadata,
      currency_code, base_currency_code, exchange_rate,
      created_by
    )
    VALUES (
      ${tenantId}::uuid,
      ${companyCodeId}::uuid,
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
      ${metadataJson}::jsonb,
      ${input.currency_code},
      ${input.base_currency_code},
      ${input.exchange_rate},
      ${actor}::uuid
    )
    RETURNING id
  `.execute(db);

  const firstRow = result.rows[0];
  if (!firstRow) {
    throw new Error(`PC_CREATE_FAILED: insert returned no row for ${input.source_doc_type} ${input.source_doc_id}`);
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
    // WS-B audit gate: same strict validation as createComponent. The DDL
    // CHECK constraints would catch shape violations, but throwing a typed
    // PcValidationError here gives the route a clean 400-class response
    // instead of a 23514 surfacing.
    await validateWhtInput(trx, tenantId, replacement);

    // Order matters: INSERT v2 without refresh, supersede UPDATE flips v1
    // inactive, THEN single refresh. If we refreshed between the INSERT and
    // the UPDATE we'd see both v1 and v2 active for a moment and double-
    // count the value. This is also the hot-path simplification — one
    // refresh per service entry, not two.
    const newId = await createComponentRow(trx, tenantId, actor, replacement);

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

    await refreshSourceCaches(trx, tenantId, replacement.source_doc_type, replacement.source_doc_id);

    return { oldId: oldPcId, newId };
  });
}

// =============================================================================
// deleteComponent
// =============================================================================

/**
 * Hard-delete a manually-added pricing_component row.
 *
 * Allowed only in mutable parent statuses (draft / rejected / proforma) and
 * only for `origin = 'manual'` rows — inherited / vendor_default / system_resolved
 * rows must be superseded, not deleted. Already-superseded rows are
 * left alone (the chain is preserved for audit).
 *
 * The generic records API blocks hard-delete on `pricing_component` because
 * the table is audit-tracked. This dedicated helper enforces the same
 * gates as `createComponent` + `supersedeComponent` and bypasses the
 * generic guard with raw SQL.
 */
export async function deleteComponent(
  db:        AnyDb,
  tenantId:  string,
  actor:     string,
  pcId:      string,
  invoiceId: string,
): Promise<{ deletedId: string }> {
  return await db.transaction().execute(async (trx) => {
    // ── Step 1: resolve the full supersession chain ────────────────────
    // The target row may have earlier versions pointing to it via
    // `superseded_by_id` (Edit-mode supersession creates a v1 → v2
    // chain). The self-FK `pc_superseded_by_fk` blocks a naive
    // `DELETE WHERE id = pcId` whenever any predecessor row still
    // references it. We have to remove the whole chain:
    //   - Deleting only the active (latest) row would orphan v1's FK.
    //   - Nulling v1's `superseded_by_id` would resurrect v1 as the
    //     new active row — exactly NOT what the user asked for when
    //     they clicked Delete.
    // So we walk the chain and tear down both ends.
    const chainRows = await sql<{ id: string }>`
      WITH RECURSIVE chain AS (
        SELECT id
          FROM document.pricing_component
         WHERE id        = ${pcId}::uuid
           AND tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT pc.id
          FROM document.pricing_component pc
          JOIN chain c ON pc.superseded_by_id = c.id
         WHERE pc.tenant_id = ${tenantId}::uuid
      )
      SELECT id FROM chain
    `.execute(trx);
    const chainIds = chainRows.rows.map((r) => r.id);
    const beforeDelete = chainIds.length === 0
      ? { rows: [] as Record<string, unknown>[] }
      : await sql<Record<string, unknown>>`
          SELECT * FROM document.pricing_component
           WHERE id        = ANY(${sql.val(chainIds)}::uuid[])
             AND tenant_id = ${tenantId}::uuid
           ORDER BY source_line_id, sequence, created_at
        `.execute(trx);
    if (chainIds.length === 0) {
      throw new Error(
        `PC_DELETE_FAILED: pricing_component ${pcId} not found in tenant ${tenantId}`,
      );
    }

    // ── Step 2: break the supersession links ───────────────────────────
    // Null out the supersession tuple on every row in the chain so the
    // FK constraint stops blocking the DELETE. The check constraint
    // `pc_supersede_consistency_chk` requires all three of
    // (superseded_by_id, superseded_at, superseded_by_user) to be NULL
    // together — we set them as a unit.
    //
    // The BEFORE UPDATE trigger `fn_pc_supersede_only_update` is fine
    // with this UPDATE because the AP route only allows DELETE in
    // PC_MUTABLE_STATUSES (draft / rejected / proforma), and the
    // trigger lets free edits through in draft / rejected.
    await sql`
      UPDATE document.pricing_component
         SET superseded_by_id   = NULL,
             superseded_at      = NULL,
             superseded_by_user = NULL
       WHERE id        = ANY(${sql.val(chainIds)}::uuid[])
         AND tenant_id = ${tenantId}::uuid
         AND superseded_by_id IS NOT NULL
    `.execute(trx);

    // ── Step 2b: drop apportionment children of any chain row ──────────
    // If any row in the chain is header-scope, it may have line-scope
    // children with `is_apportioned_from_id = <header_id>`. The self-FK
    // `pc_apportioned_from_fk` blocks the DELETE in Step 3 otherwise.
    // Children are leaves in the apportionment graph (apportionToLines
    // never creates grandchildren — `entry_level='line'` rows don't
    // apportion further) so a single DELETE drains them safely.
    //
    // Triggers: fn_pc_supersede_only_update is BEFORE UPDATE only;
    // DELETE bypasses it, so this works in any parent status the route
    // permits. line-scope children are `origin='system_resolved'` which
    // the route's user-driven delete normally forbids — but we're doing
    // it here as part of a cascade, not a direct user delete.
    await sql`
      DELETE FROM document.pricing_component
       WHERE tenant_id              = ${tenantId}::uuid
         AND is_apportioned_from_id = ANY(${sql.val(chainIds)}::uuid[])
    `.execute(trx);

    // ── Step 3: drop the entire chain ──────────────────────────────────
    const result = await sql<{ id: string }>`
      DELETE FROM document.pricing_component
       WHERE id        = ANY(${sql.val(chainIds)}::uuid[])
         AND tenant_id = ${tenantId}::uuid
      RETURNING id
    `.execute(trx);
    if (result.rows.length === 0) {
      throw new Error(
        `PC_DELETE_FAILED: chain resolved but no rows deleted (tenant=${tenantId}, pc=${pcId})`,
      );
    }

    // ── Step 4: refresh the cached PIL/PI totals ───────────────────────
    const sourceDocType = typeof beforeDelete.rows[0]?.["source_doc_type"] === "string"
      ? beforeDelete.rows[0]["source_doc_type"] as SourceDocType
      : "purchase_invoice_line";
    await refreshSourceCaches(trx, tenantId, sourceDocType, invoiceId);
    await writePricingComponentAudit(trx, {
      tenantId,
      actor,
      sourceDocType,
      sourceDocId: invoiceId,
      oldValues: { action: "delete", rows: beforeDelete.rows },
      newValues: null,
    });

    return { deletedId: pcId };
  });
}

// =============================================================================
// updateComponentInPlace
// =============================================================================

/**
 * In-place UPDATE of a pricing_component row. Used by the AP route's
 * PATCH handler in DRAFT mode where the line spec allows free edits
 * (see fn_pc_supersede_only_update — draft / rejected let any column
 * change). This is the alternative to `supersedeComponent` for the case
 * where preserving v1 as an audit row adds no value because no audit
 * obligation exists yet.
 *
 * Recomputes `computed_amount` + `computed_base_amount` from the new
 * basis/rate/amount so the line caches end up correct after the
 * `refreshInvoiceCaches` call at the end.
 *
 * Caller (the AP route) is responsible for gating: parent invoice
 * status must be in `PC_MUTABLE_STATUSES`. The DDL trigger fires too
 * but only as a safety net.
 */
export async function updateComponentInPlace(
  db:        AnyDb,
  tenantId:  string,
  actor:     string,
  pcId:      string,
  invoiceId: string,
  patch:     CreateComponentInput,
): Promise<{ id: string }> {
  const computed     = computeMagnitude(
    patch.basis,
    patch.rate_value ?? null,
    patch.amount_value ?? null,
    patch.base_for_calculation ?? null,
  );
  const computedBase = computed * patch.exchange_rate;
  const metadataJson = JSON.stringify(patch.metadata ?? {});

  return await db.transaction().execute(async (trx) => {
    // WS-B audit gate — same validation as create/supersede.
    await validateWhtInput(trx, tenantId, patch);
    const before = await sql<Record<string, unknown>>`
      SELECT * FROM document.pricing_component
       WHERE id = ${pcId}::uuid AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(trx);

    const result = await sql<{ id: string }>`
      UPDATE document.pricing_component
         SET term_type             = ${patch.term_type},
             condition_type_id     = ${patch.condition_type_id}::uuid,
             sequence              = ${patch.sequence ?? 100},
             basis                 = ${patch.basis},
             rate_value            = ${patch.rate_value},
             amount_value          = ${patch.amount_value},
             base_for_calculation  = ${patch.base_for_calculation},
             computed_amount       = ${computed},
             computed_base_amount  = ${computedBase},
             entry_level           = ${patch.entry_level},
             apportion_basis       = ${patch.apportion_basis ?? null},
             tax_group_id          = ${patch.tax_group_id ?? null}::uuid,
             is_inclusive          = ${patch.is_inclusive ?? null},
             recoverable_pct       = ${patch.recoverable_pct ?? null},
             tax_section_code      = ${patch.tax_section_code ?? null},
             metadata              = ${metadataJson}::jsonb,
             updated_by            = ${actor}::uuid,
             updated_at            = now()
       WHERE id        = ${pcId}::uuid
         AND tenant_id = ${tenantId}::uuid
      RETURNING id
    `.execute(trx);

    const row = result.rows[0];
    if (!row) {
      throw new Error(
        `PC_UPDATE_FAILED: pricing_component ${pcId} not found in tenant ${tenantId}`,
      );
    }

    await refreshSourceCaches(trx, tenantId, patch.source_doc_type, invoiceId);
    const after = await sql<Record<string, unknown>>`
      SELECT * FROM document.pricing_component
       WHERE id = ${pcId}::uuid AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(trx);
    await writePricingComponentAudit(trx, {
      tenantId,
      actor,
      sourceDocType: patch.source_doc_type,
      sourceDocId: invoiceId,
      oldValues: { action: "update", row: before.rows[0] ?? null },
      newValues: { action: "update", row: after.rows[0] ?? null },
    });

    return { id: row.id };
  });
}

// =============================================================================
// refreshInvoiceCaches — internal helper, single source of truth for the
// PC → PIL → PI cache refresh call. Each public mutator (create / update /
// supersede / delete) calls this AFTER its write so the next read sees
// fresh totals (discount_amount, tax_amount, gross_amount, etc.).
//
// Design intent (per 01y_ap_p4_pc_cache_refresh.sql header): service-gated
// during P4 dual-write; AFTER trigger on document.pricing_component lands
// in P5 once verify-pc-cache-consistency.ts proves drift-free.
// =============================================================================

async function loadPricingComponentsForSource(
  db:            AnyDb,
  tenantId:      string,
  sourceDocType: SourceDocType,
  sourceDocId:   string,
  sourceLineId:  string | null,
): Promise<Record<string, unknown>[]> {
  const result = await sql<Record<string, unknown>>`
    SELECT * FROM document.pricing_component
     WHERE tenant_id       = ${tenantId}::uuid
       AND source_doc_type = ${sourceDocType}
       AND source_doc_id   = ${sourceDocId}::uuid
       AND (
         (${sourceLineId}::uuid IS NULL AND source_line_id IS NULL)
         OR source_line_id = ${sourceLineId}::uuid
       )
     ORDER BY source_line_id, sequence, created_at
  `.execute(db);
  return result.rows;
}

async function writePricingComponentAudit(
  db: AnyDb,
  ctx: {
    tenantId:   string;
    actor:      string;
    sourceDocType: SourceDocType;
    sourceDocId:   string;
    oldValues:  Record<string, unknown> | null;
    newValues:  Record<string, unknown> | null;
  },
): Promise<void> {
  const oldJson = ctx.oldValues == null ? null : JSON.stringify(ctx.oldValues);
  const newJson = ctx.newValues == null ? null : JSON.stringify(ctx.newValues);
  const entityType = sourceDocTypeToHeaderEntity(ctx.sourceDocType);
  const companyCodeId = await resolveSourceCompanyCodeId(db, ctx.tenantId, ctx.sourceDocType, ctx.sourceDocId);
  if (!companyCodeId) return;
  await sql`
    INSERT INTO log.audit_log (
      tenant_id, entity_type, entity_id, operation,
      actor_id, actor_type, company_code_id,
      old_values, new_values, changed_fields,
      created_by
    )
    VALUES (
      ${ctx.tenantId}::uuid,
      ${entityType},
      ${ctx.sourceDocId}::uuid,
      'update',
      ${ctx.actor}::uuid,
      'principal',
      ${companyCodeId}::uuid,
      ${oldJson}::jsonb,
      ${newJson}::jsonb,
      ARRAY['pricing_components']::text[],
      ${ctx.actor}::uuid
    )
  `.execute(db);
}

function sourceDocTypeToHeaderEntity(sourceDocType: SourceDocType): string {
  switch (sourceDocType) {
    case "commitment_line":
      return "purchase_order";
    case "purchase_invoice_line":
      return "purchase_invoice";
    case "purchase_requisition_line":
      return "purchase_requisition";
    case "receipt_line":
      return "receipt";
    case "service_sheet_line":
      return "service_sheet";
  }
}

export async function refreshInvoiceCaches(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
): Promise<void> {
  await sql`
    SELECT document.refresh_invoice_amounts_from_pc(
      ${tenantId}::uuid,
      ${invoiceId}::uuid
    )
  `.execute(db);
}

async function refreshSourceCaches(
  db:            AnyDb,
  tenantId:      string,
  sourceDocType: SourceDocType,
  sourceDocId:   string,
): Promise<void> {
  if (sourceDocType !== "purchase_invoice_line") return;
  await refreshInvoiceCaches(db, tenantId, sourceDocId);
}

async function resolveSourceCompanyCodeId(
  db:            AnyDb,
  tenantId:      string,
  sourceDocType: SourceDocType,
  sourceDocId:   string,
): Promise<string | null> {
  if (sourceDocType === "purchase_invoice_line") {
    const result = await sql<{ company_code_id: string }>`
      SELECT company_code_id
        FROM document.purchase_invoice
       WHERE id = ${sourceDocId}::uuid
         AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);
    return result.rows[0]?.company_code_id ?? null;
  }
  if (sourceDocType === "commitment_line") {
    const result = await sql<{ company_code_id: string }>`
      SELECT company_code_id
        FROM document.commitment
       WHERE id = ${sourceDocId}::uuid
         AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);
    return result.rows[0]?.company_code_id ?? null;
  }
  return null;
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
      tax_group_id:         string | null;
      is_inclusive:         boolean | null;
      recoverable_pct:      string | null;
      tax_section_code:     string | null;
      metadata:             unknown;
    }>`
      SELECT id, source_doc_type, source_doc_id, term_type, condition_type_id,
             sequence, computed_amount,
             entry_level, apportion_basis, is_apportioned,
             origin, currency_code, base_currency_code, exchange_rate,
             tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
             metadata
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
    if (header.source_doc_type !== "purchase_invoice_line" && header.source_doc_type !== "commitment_line") {
      throw new Error(`PC_APPORTION_UNSUPPORTED_SOURCE: ${header.source_doc_type}`);
    }

    const basis = input.basisOverride ?? (header.apportion_basis as ApportionBasis | null);
    if (basis == null) {
      throw new Error(`PC_APPORTION_BASIS_MISSING: PC ${input.headerPcId} has no apportion_basis`);
    }
    if (basis === "weight") {
      throw new Error("PC_APPORTION_WEIGHT_UNSUPPORTED: weight basis is Phase 2");
    }

    // Idempotency — inferred from the existence of active child rows
    // pointing at this header. We deliberately do NOT read
    // `header.is_apportioned`: the pc_apportion_chk CHECK constraint
    // restricts `is_apportioned=true` to child rows (`entry_level='line'
    // AND is_apportioned_from_id IS NOT NULL`), so the header's flag is
    // always false by schema. The presence of unsuperseded children is
    // the canonical "this header has been apportioned" signal.
    const existing = await sql<{ id: string }>`
      SELECT id FROM document.pricing_component
       WHERE tenant_id              = ${input.tenantId}::uuid
         AND is_apportioned_from_id = ${input.headerPcId}::uuid
         AND superseded_by_id IS NULL
    `.execute(trx);
    if (existing.rows.length > 0) {
      return {
        source_pc_id:      input.headerPcId,
        line_pc_ids:       existing.rows.map((r) => r.id),
        total_apportioned: parseFloat(header.computed_amount),
      };
    }

    const lineQuery = header.source_doc_type === "purchase_invoice_line"
      ? await sql<{ id: string; net_amount: string; quantity: string }>`
          SELECT id, net_amount, quantity
            FROM document.purchase_invoice_line
           WHERE tenant_id           = ${input.tenantId}::uuid
             AND purchase_invoice_id = ${header.source_doc_id}::uuid
           ORDER BY line_no
        `.execute(trx)
      : await sql<{ id: string; net_amount: string; quantity: string }>`
          SELECT id, net_amount, quantity
            FROM document.commitment_line
           WHERE tenant_id     = ${input.tenantId}::uuid
             AND commitment_id = ${header.source_doc_id}::uuid
           ORDER BY line_no
        `.execute(trx);

    const pils = lineQuery.rows;
    if (pils.length === 0) {
      return { source_pc_id: input.headerPcId, line_pc_ids: [], total_apportioned: 0 };
    }

    const totalAmount = parseFloat(header.computed_amount);

    // WS-PRECEDENCE: delegate to pc-precedence.apportion, which:
    //   • uses banker's rounding (round-half-even) at 2dp
    //   • assigns residue to argmax(net_amount), tie-break argmin(line_no)
    //   • throws DEGENERATE_BASIS when the chosen basis sums to zero
    // The previous "last row absorbs remainder" rule was surprising in audit
    // because line order could vary; the new policy is deterministic across
    // re-ordered inputs.
    const exchangeRate = parseFloat(header.exchange_rate);
    const lineIds:     string[] = new Array(pils.length);
    let allocResults;
    try {
      allocResults = apportionDeterministic(
        totalAmount,
        pils.map((p, idx) => ({
          id:         p.id,
          line_no:    idx, // pils already ORDER BY line_no — index preserves order
          net_amount: parseFloat(p.net_amount),
          quantity:   parseFloat(p.quantity),
        })),
        basis as "value" | "quantity" | "equal",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `PC_APPORTION_DEGENERATE_BASIS: ${msg} (invoice=${header.source_doc_id}, pc=${input.headerPcId})`,
      );
    }
    const allocations: number[] = allocResults.map((r) => r.allocated);

    // Single bulk INSERT via unnest. All header-inherited columns become
    // CROSS-JOIN constants from the parent PI (so company_code_id stays
    // consistent with PI). Only (source_line_id, allocated) vary per row;
    // computed_amount, base_for_calculation, amount_value all equal allocated.
    const pilIds = pils.map((p) => p.id);
    // WS-SNAPSHOT: line PCs inherit the header's metadata snapshot verbatim so
    // pc_wht_metadata_snapshot_chk passes on each apportioned child without
    // forcing the apportioner to re-resolve the rate schedule per line.
    const headerMetaJson = JSON.stringify(header.metadata ?? {});
    const insertResult = header.source_doc_type === "purchase_invoice_line"
      ? await sql<{ id: string; source_line_id: string }>`
      INSERT INTO document.pricing_component (
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, amount_value, base_for_calculation,
        computed_amount, computed_base_amount,
        entry_level, apportion_basis,
        is_apportioned, is_apportioned_from_id,
        origin,
        tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
        metadata,
        currency_code, base_currency_code, exchange_rate,
        created_by
      )
      SELECT
        ${input.tenantId}::uuid,
        pi.company_code_id,
        ${header.source_doc_type},
        ${header.source_doc_id}::uuid,
        a.pil_id,
        ${header.term_type},
        ${header.condition_type_id}::uuid,
        ${header.sequence},
        'amount',
        a.allocated,
        a.allocated,
        a.allocated,
        a.allocated * ${exchangeRate},
        'line',
        NULL,
        true,
        ${input.headerPcId}::uuid,
        'system_resolved',
        ${header.tax_group_id}::uuid,
        ${header.is_inclusive},
        ${header.recoverable_pct == null ? null : parseFloat(header.recoverable_pct)},
        ${header.tax_section_code},
        ${headerMetaJson}::jsonb,
        ${header.currency_code},
        ${header.base_currency_code},
        ${exchangeRate},
        ${input.actor}::uuid
      FROM unnest(${sql.val(pilIds)}::uuid[], ${sql.val(allocations)}::numeric[])
        WITH ORDINALITY AS a(pil_id, allocated, ord)
      CROSS JOIN document.purchase_invoice pi
       WHERE pi.id        = ${header.source_doc_id}::uuid
         AND pi.tenant_id = ${input.tenantId}::uuid
       ORDER BY a.ord
       RETURNING id, source_line_id
    `.execute(trx)
      : await sql<{ id: string; source_line_id: string }>`
      INSERT INTO document.pricing_component (
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, amount_value, base_for_calculation,
        computed_amount, computed_base_amount,
        entry_level, apportion_basis,
        is_apportioned, is_apportioned_from_id,
        origin,
        tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
        metadata,
        currency_code, base_currency_code, exchange_rate,
        created_by
      )
      SELECT
        ${input.tenantId}::uuid,
        po.company_code_id,
        ${header.source_doc_type},
        ${header.source_doc_id}::uuid,
        a.line_id,
        ${header.term_type},
        ${header.condition_type_id}::uuid,
        ${header.sequence},
        'amount',
        a.allocated,
        a.allocated,
        a.allocated,
        a.allocated * ${exchangeRate},
        'line',
        NULL,
        true,
        ${input.headerPcId}::uuid,
        'system_resolved',
        ${header.tax_group_id}::uuid,
        ${header.is_inclusive},
        ${header.recoverable_pct == null ? null : parseFloat(header.recoverable_pct)},
        ${header.tax_section_code},
        ${headerMetaJson}::jsonb,
        ${header.currency_code},
        ${header.base_currency_code},
        ${exchangeRate},
        ${input.actor}::uuid
      FROM unnest(${sql.val(pilIds)}::uuid[], ${sql.val(allocations)}::numeric[])
        WITH ORDINALITY AS a(line_id, allocated, ord)
      CROSS JOIN document.commitment po
       WHERE po.id        = ${header.source_doc_id}::uuid
         AND po.tenant_id = ${input.tenantId}::uuid
       ORDER BY a.ord
       RETURNING id, source_line_id
    `.execute(trx);

    if (insertResult.rows.length !== pils.length) {
      throw new Error(
        `PC_APPORTION_INSERT_INCOMPLETE: expected ${pils.length} rows, got ${insertResult.rows.length} `
        + `(invoice=${header.source_doc_id}, pc=${input.headerPcId})`,
      );
    }

    // Preserve return-order matches input PIL order so callers can correlate.
    const idByPil = new Map(insertResult.rows.map((r) => [r.source_line_id, r.id]));
    for (let i = 0; i < pils.length; i++) {
      lineIds[i] = idByPil.get(pils[i]!.id)!;
    }

    // Header's `is_apportioned` flag stays false — see pc_apportion_chk:
    // only child rows (entry_level='line', is_apportioned_from_id NOT
    // NULL) may carry the flag. The header's "apportioned-ness" is
    // inferred from the existence of unsuperseded child rows; the
    // idempotency check at the top of this function uses that signal.

    // Single trailing refresh — covers all inserted line PCs in one shot.
    // Previously the per-PIL loop fired this N times (O(N²) PIL writes on
    // big invoices); now it's exactly once.
    if (header.source_doc_type === "purchase_invoice_line") {
      await refreshInvoiceCaches(trx, input.tenantId, header.source_doc_id);
    }

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
 *   • PC_APPORTION_SUM_DRIFT     — apportioned children sum ≠ parent header
 *   • PC_SUPERSEDE_CHAIN_BROKEN  — superseded_by_id points at missing row
 *   • PC_BASE_REQUIRED_FOR_BASIS — percent/per_unit PC row persisted with
 *                                  computed_amount=0 because rate or base
 *                                  was missing; surfaces silent-zero bug
 *                                  in computeMagnitude (returns 0 when
 *                                  rate_value or base_for_calculation is
 *                                  null). Carve-out: origin='system_resolved'
 *                                  is allowed to be a zero placeholder for
 *                                  the rule engine.
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

  // PC_BASE_REQUIRED_FOR_BASIS
  // computeMagnitude returns 0 when rate_value or base_for_calculation is null
  // for percent/per_unit basis. A malformed caller can therefore persist a
  // zero-value PC silently. At submit/post time, surface any such row whose
  // origin is not 'system_resolved' (the rule engine is allowed to write a
  // placeholder PC that is resolved later).
  const baseMissing = await sql<{
    id:                   string;
    basis:                string;
    rate_value:           string | null;
    base_for_calculation: string | null;
    origin:               string;
    term_type:            string;
  }>`
    SELECT pc.id, pc.basis, pc.rate_value, pc.base_for_calculation,
           pc.origin, pc.term_type
      FROM document.pricing_component pc
     WHERE pc.tenant_id        = ${tenantId}::uuid
       AND pc.source_doc_id    = ${invoiceId}::uuid
       AND pc.superseded_by_id IS NULL
       AND pc.basis            IN ('percent', 'per_unit')
       AND pc.computed_amount  = 0
       AND (pc.rate_value IS NULL OR pc.base_for_calculation IS NULL)
       AND pc.origin           <> 'system_resolved'
  `.execute(db);

  for (const row of baseMissing.rows) {
    const missing = [
      row.rate_value           == null ? "rate_value"           : null,
      row.base_for_calculation == null ? "base_for_calculation" : null,
    ].filter((x): x is string => x != null);

    violations.push({
      code:    "PC_BASE_REQUIRED_FOR_BASIS",
      message: `PC ${row.id} (${row.term_type}/${row.basis}) persisted with computed_amount=0 because ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} null. Either supply the missing input or mark origin='system_resolved' to declare an intentional placeholder.`,
      details: {
        id:                   row.id,
        basis:                row.basis,
        term_type:            row.term_type,
        rate_value:           row.rate_value,
        base_for_calculation: row.base_for_calculation,
        origin:               row.origin,
        missing,
      },
    });
  }

  return violations;
}
