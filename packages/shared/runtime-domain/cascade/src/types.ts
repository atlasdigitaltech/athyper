/**
 * @athyper/cascade — type definitions
 *
 * Shape of `control.entity_field.defaults` JSONB column. Drives form runtime
 * pre-fill, BFF inheritance projection, UI override-detection chip, and
 * same-row field dependency triggers.
 *
 * Specs:
 *   docs/specs/entity_field_defaults.md            (consolidated grammar)
 *   docs/specs/purchase_invoice_field_design.md §4 (parent-row cascade)
 *   docs/specs/source-change-resolver-registry.md  (resolver codes)
 */

export type DefaultValueSourceKind =
  | "parent_field"
  | "tenant_config"
  | "supplier_config"
  | "static"
  | "current_actor";

export type OnParentChange = "preserve" | "prompt" | "inherit" | "recompute";

export type ChipPosition = "field_label" | "field_value" | "none";

export interface DefaultValueSource {
  kind:           DefaultValueSourceKind;
  parent_entity?: string;
  parent_field?:  string;
  static_value?:  unknown;
  config_key?:    string;
  apply_on?:      Array<"create" | "reset">;
}

export interface OverrideDetection {
  compare_to:                  string;        // e.g. "parent.cost_center_id"
  label_when_inherited?:       string;
  label_when_overridden?:      string;
  label_when_inherited_null?:  string;
}

export interface UiAffordance {
  show_reset_to_default?:  boolean;
  show_inheritance_chip?:  boolean;
  chip_position?:          ChipPosition;
}

// =============================================================================
// Same-row field dependency (on_source_change)
// Spec: docs/specs/entity_field_defaults.md
// =============================================================================

export type OnSourceChangeAction =
  | "clear"
  | "rederive"
  | "refilter"
  | "validate"
  | "warn"
  | "lock";

export type OnSourceChangeLayer =
  | "client_on_change"
  | "bff_on_load_hydrate"
  | "server_on_save";

export type RederiveMode = "always" | "if_empty_or_derived";

/** Per-field provenance tracked client-side. Server has no provenance. */
export type FieldProvenance = "unset" | "user_input" | "derived" | "loaded";

export interface OnSourceChangeWhen {
  source_changed?:             boolean;
  source_value_in?:            unknown[] | null;
  source_value_not_in?:        unknown[];
  target_was_user_overridden?: boolean;
  status_in?:                  string[];
}

export interface OnSourceChangeRule {
  sources:   string[];
  action:    OnSourceChangeAction;
  layers:    OnSourceChangeLayer[];
  when?:     OnSourceChangeWhen;
  resolver?: string;
  mode?:     RederiveMode;
  message?:  string;
}

export type SourceChangeReason =
  | "source_changed"
  | "source_value_blank"
  | "target_stale"
  | "target_locked";

/**
 * Evaluator output. The `target` is the owning entity_field row name —
 * always present in output even though it is implicit in storage.
 */
export interface SourceChangeIntent {
  target:    string;
  sources:   string[];
  action:    OnSourceChangeAction;
  reason:    SourceChangeReason;
  resolver?: string;
  mode?:     RederiveMode;
  message?:  string;
}

export interface EntityFieldDefaults {
  default_value_source?: DefaultValueSource;
  override_detection?:   OverrideDetection | null;
  on_parent_change?:     OnParentChange;
  on_source_change?:     OnSourceChangeRule[];
  ui_affordance?:        UiAffordance;
}

/**
 * Computed at projection time — never persisted.
 * - `unset`             — both child and parent are null
 * - `inherited_null`    — child null, parent has value (default has not propagated)
 * - `inherited_match`   — child === parent (inheriting cleanly)
 * - `overridden`        — child differs from parent
 */
export type InheritanceLabel =
  | "unset"
  | "inherited_null"
  | "inherited_match"
  | "overridden";

/**
 * The virtual `_inheritance` block attached to BFF responses.
 * Key = field name on the child row; value = label.
 */
export type InheritanceMap = Record<string, InheritanceLabel>;

/**
 * Map of field name → cascade rule. Typically loaded once per entity from
 * `control.entity_field` rows where `defaults IS NOT NULL`.
 */
export type DefaultsMap = Record<string, EntityFieldDefaults>;
