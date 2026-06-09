"use client";

/**
 * Composite intake types — shared between CompositeFlowWizard (client) and
 * the composite intake route (server via api-contracts).
 *
 * These extend the existing FlowBundle / FlowStep shapes with section-level
 * metadata for repeater and singleton child-entity sections.
 */

import type { FlowFieldBinding } from "@athyper/api-contracts/documents";

// ── Section descriptor ────────────────────────────────────────────────────────

export type SectionType = "fields" | "repeater" | "singleton" | "summary";

/**
 * A minimal field spec for a child entity's field.
 * Built from control.entity_field rows for repeater/singleton sections.
 * Compatible with FlowFieldBinding so ChildRecordRepeater can use
 * FlowFieldBinding for rendering (avoids a parallel field renderer).
 */
export interface ChildFieldSpec {
  entity_field_id: string;
  field_name: string;
  field_label: string;
  data_type: string;
  enum_domain_code?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
  is_required: boolean;
  cardinality: string;
  ui_variant: string | null;
  visible_when: unknown | null;
  sort_order: number;
}

/**
 * Resolves a ChildFieldSpec into a FlowFieldBinding for use in FlowFieldBinding.
 * The mode is derived from is_required; no derivation or overrides apply.
 */
export function childFieldToBinding(
  spec: ChildFieldSpec,
  rowIndex: number,
  sectionKey: string,
): FlowFieldBinding {
  return {
    id: `${sectionKey}__${spec.field_name}__${rowIndex}`,
    entity_field_id: spec.entity_field_id,
    field_name: spec.field_name,
    field_label: spec.field_label,
    data_type: spec.data_type,
    enum_domain_code: spec.enum_domain_code ?? null,
    reference_config: spec.reference_config ?? null,
    lookup_config: spec.lookup_config ?? null,
    mode: spec.is_required ? "required" : "editable",
    span: 1,
    sort_order: spec.sort_order,
    derivation_mode: null,
    visible_when: spec.visible_when ?? null,
    required_when: null,
    default_source: null,
    derive_expression: null,
    override_permission: null,
    summary_role: null,
    ui_variant: spec.ui_variant,
    help_text: null,
    placeholder: null,
    is_overridden: false,
  };
}

/**
 * One section within a composite flow step.
 *
 * - type=fields    → flat field bindings from entity_flow_field (fields array)
 * - type=repeater  → add/remove child-entity rows (child_fields + payload_key)
 * - type=singleton → single editable child-entity record (child_fields + payload_key)
 * - type=summary   → read-only review / completion panel (no editable fields)
 */
export interface FlowSectionDescriptor {
  section_key: string;
  label: string;
  section_type: SectionType;

  /** For type=repeater/singleton: which child entity to manage. */
  entity_code?: string;
  /** Key in the composite payload (e.g. "identifiers", "tax_profiles"). */
  payload_key?: string;

  /** type=fields: resolved FlowFieldBinding rows (from entity_flow_field). */
  fields: FlowFieldBinding[];
  /** type=repeater/singleton: field specs resolved from child entity_field. */
  child_fields?: ChildFieldSpec[];

  min_rows?: number;
  max_rows?: number;
  default_row?: Record<string, unknown>;

  /** User must hold this permission code to interact with the section. */
  permission_code?: string | null;
  /** Render section but disable all inputs (compliance/system-owned data). */
  restricted_view_only?: boolean;

  /** JSON-Logic predicate evaluated against the wizard's flat-field state. */
  visible_when?: unknown | null;

  sort_order: number;
  collapse_default?: boolean;
  icon_key?: string | null;
  help_text?: string | null;
}

/**
 * Composite flow step — extends the standard FlowStep with a sections array.
 * The legacy `fields` array on each step is retained for backward compatibility
 * with FlowWizard, but CompositeFlowWizard uses `sections` instead.
 */
export interface CompositeFlowStep {
  id: string;
  step_key: string;
  label: string;
  icon_key?: string | null;
  sort_order: number;
  skip_when?: unknown | null;
  advance_rule: {
    required_fields: string[];
    predicate?: unknown | null;
  };
  layout_hint: string;
  /** Sections for this step — drives CompositeFlowWizard rendering. */
  sections: FlowSectionDescriptor[];
  /** Legacy flat fields — kept for FlowWizard compat but unused in composite mode. */
  fields: FlowFieldBinding[];
}

/**
 * Full composite flow bundle returned by the extended flow bundle API.
 * config.persistence_mode = 'composite_supplier_intake' signals composite mode.
 */
export interface CompositeFlowBundle {
  flow_id: string;
  flow_code: string;
  label: string;
  description?: string | null;
  config: {
    persistence_mode?: string;
    [key: string]: unknown;
  };
  steps: CompositeFlowStep[];
  user_permissions: string[];
}

// ── Composite intake payload ──────────────────────────────────────────────────

export interface SupplierIntakePayload {
  /** Stable UUID generated on wizard mount — prevents duplicate creates on retry. */
  idempotency_key: string;

  supplier: {
    name?: string;
    display_name?: string;
    legal_name?: string;
    supplier_type?: string;
    legal_form?: string;
    registration_no?: string;
    registration_country_code?: string;
    website_url?: string;
    description?: string;
    external_ref?: string;
    /** Driver field (UI-only, stripped server-side): triggers banking section visibility. */
    is_payment_ready?: boolean;
    /** Driver field: triggers governance section visibility. Compliance reconciles later. */
    anticipated_risk_tier?: string;
    [key: string]: unknown;
  };

  identifiers: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  tax_profiles: Record<string, unknown>[];
  /** Always {} — backend owns all qualification defaults. */
  qualification: Record<string, never>;
  contacts: Record<string, unknown>[];
  contact_channels: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  bank_accounts: Record<string, unknown>[];
  governance: Record<string, unknown>[];
}

// ── Section completion report ─────────────────────────────────────────────────

export type SectionCompletionStatus = "complete" | "partial" | "empty" | "optional_empty";

export interface SectionCompletionReport {
  step_key: string;
  section_key: string;
  label: string;
  status: SectionCompletionStatus;
  required_field_count: number;
  filled_field_count: number;
  row_count: number;
  min_rows: number;
  is_required: boolean;
  is_restricted: boolean;
}

// ── Duplicate check ───────────────────────────────────────────────────────────

export type DuplicateMatchSeverity = "blocker" | "warning" | "info";

export interface DuplicateMatch {
  business_partner_id?: string;
  business_partner_code?: string;
  supplier_id?: string | null;
  supplier_code?: string | null;
  customer_id?: string | null;
  customer_code?: string | null;
  role_codes?: string[];
  supplier_company_code_ids?: string[];
  customer_company_code_ids?: string[];
  href?: string;
  code: string;
  name: string;
  match_type: "exact_match" | "strong_match" | "weak_match";
  severity: DuplicateMatchSeverity;
  matched_field: string;
  score: number;
  recommended_action?: "edit_existing" | "extend_role" | "extend_company_code" | "review";
}

export interface DuplicateCheckResult {
  notices: Array<{
    code: string;
    level: "blocked" | "warning" | "info";
    message: string;
    action_hint?: string;
  }>;
  matches: DuplicateMatch[];
  blocking?: boolean;
  duplicate_policy?: {
    source: string;
    exact_fields: string[];
    strong_name_threshold: number;
    weak_name_threshold: number;
    block_on_exact: boolean;
  };
}
