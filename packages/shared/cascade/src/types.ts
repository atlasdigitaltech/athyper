/**
 * @athyper/cascade — type definitions
 *
 * Shape of `control.entity_field.defaults` JSONB column. Drives form runtime
 * pre-fill, BFF inheritance projection, and UI override-detection chip.
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §4
 */

export type DefaultValueSourceKind =
  | "parent_field"
  | "tenant_config"
  | "supplier_config"
  | "static";

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

export interface EntityFieldDefaults {
  default_value_source?: DefaultValueSource;
  override_detection?:   OverrideDetection | null;
  on_parent_change?:     OnParentChange;
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
