/**
 * @athyper/content-ui — Purchase Invoice UI types
 *
 * UI-facing types mirroring the document.purchase_invoice domain DDL.
 * Authority: docs/specs/purchase_invoice_field_design.md (v1.2).
 *
 * Tables represented:
 *   document.purchase_invoice         — PiHeader
 *   document.purchase_invoice_line    — PiLine
 *   document.pricing_component        — PricingComponent
 *   document.accounting_distribution  — AccountingDistribution
 *   document.payment_term_application — PaymentTermApplication
 *   document.payment_term_discount_result — PaymentTermDiscountResult
 *
 * These are presentation types — server-side schemas (zod) live in
 * @athyper/api-contracts and are the source of truth for transport.
 *
 * ─── P1b audit — overlap with @athyper/api-contracts/documents ───
 *
 * Sprint 2 P1b audit identified three categories of relationship
 * between the types below and @athyper/api-contracts/documents:
 *
 * 1. SHAPES WITH TRANSPORT CANONICAL IN api-contracts:
 *
 *    `AccountingDistribution` (this file) is the UI DISPLAY variant of
 *    `AccountingDistributionSchema` in api-contracts. The two differ:
 *      • Transport: source_doc_type, source_doc_id, tenant_id, *_id
 *        FK fields (gl_account_id, cost_center_id, …), no labels
 *      • Display: hydrated *_label fields,
 *        nullable source_line_id (transport requires it)
 *    The server-side records pipeline hydrates IDs → labels via
 *    `hydrateDisplayValues` before producing this display shape.
 *
 *    Proper intersection-type adoption is deferred to P2c (when
 *    types relocate to document-components/distributions/types.ts
 *    alongside the panel).
 *
 * 2. DISPLAY-ONLY CONTRACTS THAT ALREADY LIVE IN api-contracts:
 *
 *    The runtime-canvas amount summary uses `AmountBreakdownLineSchema`
 *    from api-contracts (display-shaped, not a transport mirror).
 *    `PiAmountSummary` below is a different scope — a typed object of
 *    PI-specific cached rollup fields rather than a row-set, so no
 *    intersection applies.
 *
 *    `StatusDimension`, `SatelliteCard`, `ProcessChainNode`,
 *    `DocumentException` from api-contracts are all display contracts
 *    consumed by runtime-canvas surfaces directly — content-ui does not
 *    re-declare them.
 *
 * 3. PI-SPECIFIC PROJECTIONS WITH NO TRANSPORT EQUIVALENT:
 *
 *    `PurchaseInvoiceHeader` is a flat display rollup that does not
 *    correspond to api-contracts' generic `DocumentHeaderSchema`
 *    (which carries a runtime `data: Record<string, unknown>` for
 *    descriptor-driven fields). Adoption would require flattening
 *    PI-specific fields, which is out of scope for this audit.
 *
 *    `PurchaseInvoiceLine` similarly omits api-contracts' tax_code /
 *    discount_pct / retention_pct / withholding_tax_amount fields
 *    because PI v1.2 sources those through PCs (pricing_component).
 *    The shapes are structurally incompatible.
 *
 * 4. TYPES WITH NO api-contracts EQUIVALENT (tracked as follow-up):
 *
 *    • `PricingComponent` — canonical schema in api-contracts/documents
 *      is the next workstream (v5 plan §13 out-of-scope item).
 *    • `PaymentTermApplication`, `PaymentTermDiscountResult` — same.
 *    • PI enums (PiStatus, PiMatchStatus, PiMatchType) stay PI-specific
 *      because their value sets are pi_* CHECK constraints, not shared.
 *
 * Adoption ladder for P2c: `AccountingDistributionDisplay` becomes
 * an Omit + intersection over the api-contracts transport shape;
 * the rename + relocation happens at the same time.
 */

// ── Status / lifecycle ──────────────────────────────────────────────

/** purchase_invoice.status (pi_status_chk). */
export type PiStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "posted"
  | "partially_paid"
  | "fully_paid"
  | "on_hold"
  | "reversed"
  | "cancelled";

/** purchase_invoice.match_status (pi_match_status_chk). */
export type PiMatchStatus =
  | "unmatched"
  | "partially_matched"
  | "fully_matched"
  | "match_exception";

/** purchase_invoice.match_type (pi_match_type_chk). */
export type PiMatchType =
  | "three_way"
  | "two_way"
  | "no_match"
  | "evaluated_receipt";

// ── Pricing Component (PC) ──────────────────────────────────────────

/** pricing_component.term_type (pc_term_type_chk). */
export type PcTermType =
  | "discount"
  | "charge"
  | "tax"
  | "withholding"
  | "retention"
  | "principal_marker";

/** pricing_component.basis (pc_basis_chk). */
export type PcBasis = "percent" | "amount" | "per_unit" | "flat";

/** pricing_component.entry_level (pc_entry_level_chk). */
export type PcEntryLevel = "header" | "line";

/** pricing_component.origin (pc_origin_chk). */
export type PcOrigin = "manual" | "inherited" | "vendor_default" | "system_resolved";

/** pricing_component.apportion_basis (pc_apportion_basis_chk). */
export type PcApportionBasis = "value" | "quantity" | "weight" | "equal";

/**
 * One pricing_component row, hydrated for display.
 *
 * Convention: when `chain` is present, the row IS the active version
 * (superseded_by_id IS NULL) and `chain` holds prior versions ordered
 * newest-first (v1, v0, …). The drawer nests `chain` under the active
 * row in the same waterfall slot.
 */
export interface PricingComponent {
  id: string;
  /** pricing_component.sequence — load-bearing waterfall order. */
  sequence: number;
  term_type: PcTermType;

  /**
   * UUID FK to master.condition_type. Stored directly on the row;
   * label/code below are hydrated client-side from the lookup data
   * the surface already fetches (records API doesn't enrich PC rows).
   */
  condition_type_id: string;
  /** Display label resolved from master.condition_type. */
  condition_type_label: string;
  /** Stable code (e.g. "DISC_TRADE", "TAX_IGST_18"). */
  condition_type_code: string;
  /** Hydrated defaults from master.condition_type for accounting preview. */
  cost_effect?: "REDUCE_COST" | "ADD_TO_COST" | "NO_COST_EFFECT";
  posting_pattern?: "INHERIT_LINE_ACCOUNT" | "SEPARATE_ACCOUNT" | "TAX_RECOVERABLE" | "LIABILITY_SPLIT" | "TAX_SELF_ASSESSED" | "MEMO_ONLY";
  distribution_policy?: "INHERIT_LINE" | "APPORTION_TO_LINES" | "NO_COST_DISTRIBUTION";

  basis: PcBasis;
  rate_value: number | null;
  amount_value: number | null;
  base_for_calculation: number | null;
  computed_amount: number;
  computed_base_amount: number;

  entry_level: PcEntryLevel;
  origin: PcOrigin;

  /**
   * Polymorphic source key (PIL for line-scope, NULL for header-scope).
   * Mirrors pricing_component.source_line_id; consumers use this to
   * decide if the row is line-scoped or header-scoped.
   */
  source_line_id: string | null;

  /** Set for header-scope rows that apportion to lines. */
  apportion_basis: PcApportionBasis | null;
  is_apportioned: boolean;
  is_apportioned_from_id: string | null;

  // Tax/withholding metadata
  tax_group_label: string | null;
  is_inclusive: boolean | null;
  recoverable_pct: number | null;
  tax_section_code: string | null;

  // Currency triad
  currency_code: string;
  base_currency_code: string;
  exchange_rate: number;

  // Supersession
  superseded_by_id: string | null;
  superseded_at: string | null;
  superseded_by_user_label: string | null;
  /** Pre-loaded prior versions for inline-nested display. */
  chain?: PricingComponent[];

  /** Optional metadata (replacement_reason, override_reason, etc.). */
  metadata?: Record<string, unknown>;
}

// ── Accounting Distribution (AD) ────────────────────────────────────

/** accounting_distribution.distribution_basis (ad_basis_chk). */
export type AdDistributionBasis = "PERCENT" | "AMOUNT" | "QUANTITY";

/**
 * accounting_distribution.account_source (ad_source_chk).
 * Provenance of the resolved gl_account_id.
 * - PENDING:  AD row created, not yet posted, GL unresolved
 * - OVERRIDE: user-authored GL via the distribution drawer; posting service
 *             skips profile resolution and keeps this value
 * - PROFILE:  resolved at posting via control.acct_profile_entry_template
 * - FALLBACK: resolved at posting via the hardcoded posting-service path
 */
export type AdAccountSource = "PENDING" | "OVERRIDE" | "PROFILE" | "FALLBACK";

/** accounting_distribution.budget_check_result (ad_budget_chk). */
export type AdBudgetCheckResult = "passed" | "warned" | "override" | "blocked" | "exempt";

/**
 * One accounting_distribution row, hydrated for display.
 *
 * Account resolution inputs stay on the accounting_distribution row.
 */
export interface AccountingDistribution {
  id: string;
  distribution_no: number;
  /**
   * Polymorphic source key — the PIL (or other line entity) this AD row
   * is scoped to. Required by Postings Preview drill-back so each
   * aggregated GL row can list its contributing source lines.
   */
  source_line_id: string | null;
  distribution_basis: AdDistributionBasis;
  split_pct: number | null;
  split_amount: number | null;
  split_quantity: number | null;
  distributed_amount: number;
  currency_code: string;

  account_source: AdAccountSource;
  /** Resolved GL account FK — needed by the AD drawer for pre-fill on edit. */
  gl_account_id: string | null;
  /** Resolved account label (e.g. "5301 Freight & Carriage"). */
  gl_account_label: string | null;

  // Dimension FKs — required for drawer pre-fill; pair with the
  // resolved labels below for display.
  cost_center_id: string | null;
  profit_center_id: string | null;
  project_id: string | null;

  // Dimensions (resolved labels)
  cost_center_label: string | null;
  profit_center_label: string | null;
  project_label: string | null;

  asset_id: string | null;

  budget_check_result: AdBudgetCheckResult | null;

}

// ── Payment Terms ───────────────────────────────────────────────────

/** payment_term_application.clause_type (pta_clause_type_chk). */
export type PtaClauseType =
  | "ADVANCE"
  | "ADVANCE_RECOVERY"
  | "RETENTION"
  | "RETENTION_RELEASE"
  | "DUE_DATE";

/** payment_term_application.application_status (pta_status_chk). */
export type PtaApplicationStatus =
  | "APPLIED"
  | "SKIPPED"
  | "CLAMPED"
  | "EXHAUSTED"
  | "NOT_YET_ELIGIBLE";

/** payment_term_application.system_reason_code (pta_system_reason_chk). */
export type PtaSystemReasonCode =
  | "CEILING_CLAMPED"
  | "CEILING_REACHED"
  | "THRESHOLD_NOT_MET"
  | "CAP_EXHAUSTED"
  | "CATCH_UP"
  | "FLEXIBILITY_APPLIED";

export interface PaymentTermApplication {
  id: string;
  clause_type: PtaClauseType;
  clause_code: string;
  application_status: PtaApplicationStatus;

  calculated_basis_amount: number;
  default_pct: number | null;
  applied_pct: number | null;
  default_amount: number;
  applied_amount: number;

  evaluation_sequence_no: number;
  running_total_amount: number;
  remaining_balance_amount: number;
  is_effective: boolean;

  // DUE_DATE-specific
  base_event_date: string | null;
  days_applied: number | null;
  resolved_due_date: string | null;

  // Override
  system_reason_code: PtaSystemReasonCode | null;
  manual_override_reason: string | null;
}

/** payment_term_discount_result.application_status (ptdr_status_chk). */
export type PtdrApplicationStatus =
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "PARTIAL"
  | "WAIVED"
  | "EXPIRED"
  | "REVERSED";

/**
 * Settlement-time discount realization.
 * Append-only — only present when payments have occurred.
 */
export interface PaymentTermDiscountResult {
  id: string;
  payment_id: string;
  qualification_date: string;
  qualified_tier_no: number | null;
  qualified_days_actual: number;
  discount_basis_amount: number;
  discount_pct: number | null;
  discount_amount: number;
  application_status: PtdrApplicationStatus;
  is_reversal: boolean;
}

// ── Purchase Invoice header / line projections ─────────────────────

export interface PiAmountSummary {
  subtotal_amount: number;
  discount_amount: number;
  charges_amount: number;
  tax_amount: number;
  withholding_tax_amount: number;
  retention_amount: number;
  advance_deduction_amount: number;
  payable_amount: number;
  outstanding_amount: number;
}

export interface PurchaseInvoiceHeader {
  id: string;
  code: string;

  supplier_invoice_number: string;
  supplier_invoice_date: string;

  /** Display label from purchase_invoice.supplier_id joined to master.supplier/business_partner. */
  supplier_label: string;

  status: PiStatus;

  // Currency triad
  currency_code: string;
  base_currency_code: string;
  exchange_rate: number;

  amounts: PiAmountSummary;

  match_type: PiMatchType;
  match_status: PiMatchStatus;
  match_exception_count: number;
}

export interface PurchaseInvoiceLine {
  id: string;
  line_no: number;
  item_description: string;
  uom_code: string;
  quantity: number;
  unit_price: number;
  /** GENERATED — qty × price / price_unit. */
  net_amount: number;
  /** Cached after PC waterfall + AD. */
  gross_amount: number;
  match_status: PiMatchStatus;
  matched_quantity?: number;

  currency_code: string;
  base_currency_code: string;
  exchange_rate: number;

  status: string;
}

// ── Drawer affordance gate ──────────────────────────────────────────

/**
 * Edit mode for a single band/row, derived from parent status +
 * field-rule registry + permission. Source of truth lives server-side
 * in `entity_field.editable_in_status`; this enum surfaces the
 * resolved affordance to the UI.
 */
export type EditAffordance =
  /** Full edit (add / edit / delete). */
  | "edit"
  /** Supersession only — fn_pc_supersede_only_update applies. */
  | "replace"
  /** Read-only display with audit links surfaced. */
  | "read_only";

/** Header-scope PC + projected lines, for HeaderScopePcStrip. */
export interface HeaderPcProjection {
  /** The header-scope PC row. */
  component: PricingComponent;
  /** Per-line allocations after apportionment. */
  allocations: Array<{
    line_id: string;
    line_no: number;
    item_description: string;
    /** The basis value (net amount, quantity, weight, or 1 for equal). */
    basis_value: number;
    /** Decimal share (0..1). */
    share: number;
    /** Resolved allocated amount for this line. */
    allocated_amount: number;
    /** True if this line has a manual override of the same condition_type. */
    overridden: boolean;
    /** When overridden, the override amount (else null). */
    override_amount: number | null;
  }>;
  /** Last computed timestamp (ISO) or null when pending submit. */
  last_computed_at: string | null;
  /** Sum-of-allocations vs. component value; used by the projection footer. */
  rounding_adjustment: number;
  /** Line which absorbed the rounding (for caption). */
  rounding_absorbed_by_line_no: number | null;
}
