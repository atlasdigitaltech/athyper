/**
 * @athyper/content-ui — Drawer helpers (projection + validation)
 *
 * Pure functions for:
 *   • Computing live apportionment projections for header-scope PC drafts
 *   • Validating PC drafts against DDL coherence rules (pc_basis_value_chk,
 *     pc_apportion_basis_chk, pc_tax_fields_scope_chk, etc.)
 *
 * No React imports — easy to unit-test in isolation.
 */

import type {
  PcBasis,
  PcApportionBasis,
  PcTermType,
  PurchaseInvoiceLine,
} from "../../../purchase-invoice/types";

// ── Projection compute ─────────────────────────────────────────────

export interface ApportionmentInput {
  /** Header-scope PC value to apportion. */
  amount: number;
  basis: PcApportionBasis;
  /** Lines participating in the apportionment. */
  lines: ReadonlyArray<
    Pick<PurchaseInvoiceLine, "id" | "line_no" | "item_description" | "net_amount" | "quantity">
  >;
  /** Optional per-line weight (when basis = "weight"). */
  weights?: Record<string, number | undefined>;
  /** Tolerance for rounding (in document-currency minor units). */
  rounding_tolerance?: number;
}

export interface ApportionmentRow {
  line_id: string;
  line_no: number;
  item_description: string;
  basis_value: number;
  share: number;
  allocated_amount: number;
}

export interface ApportionmentResult {
  rows: ApportionmentRow[];
  total_basis: number;
  total_allocated: number;
  /** allocated - amount; non-zero means rounding diverted to one line. */
  rounding_adjustment: number;
  /** line_no of the line that absorbed any rounding (largest basis value). */
  rounding_absorbed_by_line_no: number | null;
  /** Validity flags surfacing basis incompatibilities. */
  incompatibility: ApportionmentIncompatibility | null;
}

export type ApportionmentIncompatibility =
  | { kind: "mixed_uoms"; uoms: string[] }
  | { kind: "missing_weights"; line_nos: number[] }
  | { kind: "zero_basis_total"; basis: PcApportionBasis };

/**
 * Compute per-line allocations for a header-scope PC value across a
 * set of lines. Surfaces incompatibility states (mixed UoMs for
 * quantity basis, missing weights for weight basis) per §B3.
 *
 * Per §C7, rounding is absorbed by the line with the largest basis
 * value (deterministic, reversible).
 */
export function computeApportionment(input: ApportionmentInput): ApportionmentResult {
  const { amount, basis, lines, weights } = input;

  // Derive per-line basis value.
  const perLine = lines.map((line) => {
    let basis_value: number;
    let missingWeight = false;
    switch (basis) {
      case "value":
        basis_value = line.net_amount;
        break;
      case "quantity":
        basis_value = line.quantity;
        break;
      case "weight": {
        const w = weights?.[line.id];
        if (w == null) {
          missingWeight = true;
          basis_value = 0;
        } else {
          basis_value = w;
        }
        break;
      }
      case "equal":
        basis_value = 1;
        break;
    }
    return { line, basis_value, missingWeight };
  });

  // Incompatibility detection.
  let incompatibility: ApportionmentIncompatibility | null = null;
  if (basis === "weight") {
    const missing = perLine.filter((p) => p.missingWeight).map((p) => p.line.line_no);
    if (missing.length > 0) {
      incompatibility = { kind: "missing_weights", line_nos: missing };
    }
  }

  const total_basis = perLine.reduce((acc, p) => acc + p.basis_value, 0);
  if (incompatibility == null && total_basis === 0) {
    incompatibility = { kind: "zero_basis_total", basis };
  }

  // Allocate proportionally; track the highest-basis line as the canonical
  // residual absorber (matches design plan §C7 and the UI caption).
  // First-encountered tie-breaker for equal basis values.
  const rows: ApportionmentRow[] = [];
  let highest_basis_value = -Infinity;
  let highest_basis_index = -1;

  perLine.forEach((p) => {
    const share = total_basis > 0 ? p.basis_value / total_basis : 0;
    const allocated = round2(amount * share);
    if (p.basis_value > highest_basis_value) {
      highest_basis_value = p.basis_value;
      highest_basis_index = rows.length;
    }
    rows.push({
      line_id: p.line.id,
      line_no: p.line.line_no,
      item_description: p.line.item_description,
      basis_value: p.basis_value,
      share,
      allocated_amount: allocated,
    });
  });

  // Compute the cent-level residual left over from per-line rounding, then
  // absorb it on the highest-basis row. After absorption sum equals input
  // amount within rounding tolerance and the caption ("absorbed by Line N")
  // matches reality — §7.1 in plan v5.
  const naive_total = rows.reduce((acc, r) => acc + r.allocated_amount, 0);
  const residual = round2(amount - naive_total);
  if (residual !== 0 && highest_basis_index !== -1) {
    rows[highest_basis_index]!.allocated_amount = round2(
      rows[highest_basis_index]!.allocated_amount + residual,
    );
  }

  const total_allocated = rows.reduce((acc, r) => acc + r.allocated_amount, 0);
  const rounding_absorbed_by_line_no = residual !== 0 && highest_basis_index !== -1
    ? rows[highest_basis_index]!.line_no
    : null;

  return {
    rows,
    total_basis,
    total_allocated,
    // The residual that was absorbed — never the post-absorption delta. UI
    // reads non-zero values as "rounding happened on line N".
    rounding_adjustment: residual,
    rounding_absorbed_by_line_no,
    incompatibility,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Form validation ────────────────────────────────────────────────

export interface PcDraft {
  term_type: PcTermType;
  basis: PcBasis;
  rate_value: number | null;
  amount_value: number | null;
  /** Base used for percent/per-unit previews; passed through to the writer. */
  base_for_calculation?: number | null;
  // Tax-specific
  tax_group_id: string | null;
  is_inclusive: boolean | null;
  recoverable_pct: number | null;
  tax_section_code: string | null;
  /**
   * WHT-specific metadata snapshot (D8). Required for term_type='withholding'
   * — must contain rate_schedule_id, wht_basis, resolved_rate so server-side
   * pc_wht_metadata_snapshot_chk passes. Optional for other term types.
   */
  metadata?: Record<string, unknown> | null;
  // Scope
  entry_level: "header" | "line";
  source_line_id: string | null;
  apportion_basis: PcApportionBasis | null;
  // Lifecycle
  condition_type_id: string | null;
  sequence: number;
}

/**
 * Optional context the caller can supply to validate WHT jurisdiction-specific
 * requirements (currently: section-code mandate). Resolved from the chosen
 * tax_group's jurisdiction via the tax-group lookup adapter; WhtDrawer passes
 * it after the group selection settles.
 */
export interface PcValidateContext {
  wht_section_required?: boolean;
}

export type PcDraftError =
  | { code: "REQUIRED"; field: keyof PcDraft; message: string }
  | { code: "BASIS_VALUE_INCOHERENT"; message: string }
  | { code: "VALUE_NEGATIVE"; field: "rate_value" | "amount_value"; message: string }
  | { code: "TAX_GROUP_REQUIRED"; message: string }
  | { code: "TAX_FIELDS_OUT_OF_SCOPE"; message: string }
  | { code: "RECOVERABLE_OUT_OF_RANGE"; message: string }
  | { code: "APPORTION_BASIS_REQUIRED"; message: string }
  | { code: "SOURCE_LINE_REQUIRED"; message: string }
  // WS-B audit-gate WHT-specific codes (server-authoritative; mirrored here
  // so the WhtDrawer can fail-fast before POST).
  | { code: "WHT_IS_INCLUSIVE_FORBIDDEN"; message: string }
  | { code: "WHT_RECOVERABLE_PCT_FORBIDDEN"; message: string }
  | { code: "WHT_SECTION_CODE_REQUIRED"; message: string }
  | { code: "WHT_METADATA_SNAPSHOT_REQUIRED"; message: string };

/**
 * Validates a PC draft against the DDL constraints. Returns the
 * complete list of errors (empty = valid). Callers gate Submit on
 * `errors.length === 0`.
 *
 * `ctx.wht_section_required` should be supplied by the caller for
 * term_type='withholding' drafts so the section-code mandate is enforced;
 * absent that flag the section code stays optional.
 */
export function validatePcDraft(draft: PcDraft, ctx: PcValidateContext = {}): PcDraftError[] {
  const errors: PcDraftError[] = [];

  if (!draft.condition_type_id) {
    errors.push({ code: "REQUIRED", field: "condition_type_id", message: "Condition type is required" });
  }

  // pc_basis_value_chk: basis ↔ value coherence
  switch (draft.basis) {
    case "percent":
    case "per_unit":
      if (draft.rate_value == null) {
        errors.push({ code: "BASIS_VALUE_INCOHERENT", message: "Rate value is required for percent/per-unit basis" });
      }
      if (draft.amount_value != null) {
        errors.push({ code: "BASIS_VALUE_INCOHERENT", message: "Amount value must be empty for percent/per-unit basis" });
      }
      break;
    case "amount":
    case "flat":
      if (draft.amount_value == null) {
        errors.push({ code: "BASIS_VALUE_INCOHERENT", message: "Amount value is required for amount/flat basis" });
      }
      if (draft.rate_value != null) {
        errors.push({ code: "BASIS_VALUE_INCOHERENT", message: "Rate value must be empty for amount/flat basis" });
      }
      break;
  }

  // Non-negative checks (pc_*_nonneg_chk)
  if (draft.rate_value != null && draft.rate_value < 0) {
    errors.push({ code: "VALUE_NEGATIVE", field: "rate_value", message: "Rate cannot be negative" });
  }
  if (draft.amount_value != null && draft.amount_value < 0) {
    errors.push({ code: "VALUE_NEGATIVE", field: "amount_value", message: "Amount cannot be negative" });
  }

  // pc_tax_fields_scope_chk
  const isTax = draft.term_type === "tax" || draft.term_type === "withholding";
  if (isTax) {
    if (!draft.tax_group_id) {
      errors.push({ code: "TAX_GROUP_REQUIRED", message: "Tax group is required for tax/withholding" });
    }
  } else {
    if (draft.tax_group_id != null
        || draft.is_inclusive != null
        || draft.recoverable_pct != null
        || draft.tax_section_code != null) {
      errors.push({ code: "TAX_FIELDS_OUT_OF_SCOPE", message: "Tax fields only valid for tax/withholding term types" });
    }
  }

  // pc_recoverable_chk
  if (draft.recoverable_pct != null && (draft.recoverable_pct < 0 || draft.recoverable_pct > 100)) {
    errors.push({ code: "RECOVERABLE_OUT_OF_RANGE", message: "Recoverable percentage must be between 0 and 100" });
  }

  // WS-B WHT-specific invariants — mirror the server-side validateWhtInput()
  // gate so the drawer fails fast before POST. Server remains authoritative.
  if (draft.term_type === "withholding") {
    if (draft.is_inclusive === true) {
      errors.push({
        code:    "WHT_IS_INCLUSIVE_FORBIDDEN",
        message: "Withholding tax is always exclusive — inclusive mode is not permitted",
      });
    }
    if (draft.recoverable_pct != null && draft.recoverable_pct !== 0) {
      errors.push({
        code:    "WHT_RECOVERABLE_PCT_FORBIDDEN",
        message: "Withholding is a payment-time deduction, not an input credit — recoverable % must be 0 or blank",
      });
    }
    if (ctx.wht_section_required && !draft.tax_section_code) {
      errors.push({
        code:    "WHT_SECTION_CODE_REQUIRED",
        message: "This jurisdiction requires a section code on every withholding component",
      });
    }
    const meta = draft.metadata ?? {};
    if (!("rate_schedule_id" in meta) || !("wht_basis" in meta) || !("resolved_rate" in meta)) {
      errors.push({
        code:    "WHT_METADATA_SNAPSHOT_REQUIRED",
        message: "Withholding rows must snapshot { rate_schedule_id, wht_basis, resolved_rate } at create-time",
      });
    }
  }

  // pc_entry_level_scope_chk
  if (draft.entry_level === "line" && !draft.source_line_id) {
    errors.push({ code: "SOURCE_LINE_REQUIRED", message: "Line scope requires a target line" });
  }

  // Header-scope rows should declare apportion_basis (soft-required —
  // DDL allows NULL, but UX requires it for visible projection).
  if (draft.entry_level === "header" && draft.apportion_basis == null) {
    errors.push({ code: "APPORTION_BASIS_REQUIRED", message: "Header-scope components must declare an apportionment basis" });
  }

  return errors;
}

/**
 * Compute the "Δ" hint string for a PC row (rate or basis label).
 */
export function describeBasisHint(draft: Pick<PcDraft, "basis" | "rate_value" | "amount_value">): string {
  switch (draft.basis) {
    case "percent":  return draft.rate_value != null ? `${draft.rate_value}%` : "%";
    case "per_unit": return draft.rate_value != null ? `${draft.rate_value}/unit` : "per unit";
    case "amount":
    case "flat":     return draft.amount_value != null ? `flat ${draft.amount_value}` : "flat";
  }
}

// ── Computes-on resolver ───────────────────────────────────────────

/**
 * Determines the base for calculation given:
 *   - Line net amount
 *   - Prior PC computed amounts in the same waterfall (running sum)
 *   - The "computes on" mode chosen in the drawer
 */
export type ComputesOnMode = "net_before_adjustments" | "running_after_prior";

export function resolveBaseForCalculation({
  lineNet,
  priorSum,
  mode,
}: {
  lineNet: number;
  priorSum: number;
  mode: ComputesOnMode;
}): number {
  switch (mode) {
    case "net_before_adjustments": return lineNet;
    case "running_after_prior":    return round2(lineNet + priorSum);
  }
}

/**
 * Compute the change (Δ) preview for a single new PC row:
 *   computed_amount = basis × value applied to base_for_calculation.
 */
export function previewComputedAmount({
  base,
  draft,
}: {
  base: number;
  draft: Pick<PcDraft, "basis" | "rate_value" | "amount_value">;
}): number {
  switch (draft.basis) {
    case "percent":
      return draft.rate_value != null ? round2((base * draft.rate_value) / 100) : 0;
    case "per_unit":
      // Per-unit needs quantity to multiply against — drawer caller passes
      // base as already (quantity × per-unit-rate); UI normalises ahead of time.
      return draft.rate_value != null ? round2(base * draft.rate_value) : 0;
    case "amount":
    case "flat":
      return draft.amount_value ?? 0;
  }
}
