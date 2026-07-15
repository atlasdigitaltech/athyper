/**
 * Form-runtime cascade consumer.
 *
 * Three responsibilities:
 *   1. applyCascadeDefaults — pre-fill child fields from parent at row-create
 *   2. renderInheritanceChipModel — produce a chip descriptor for UI to render
 *   3. handleParentChange — describe the behavior when parent value changes
 *
 * UI implementation (chip component, prompt dialog) lives in the consuming
 * package (e.g. runtime-canvas). This module returns descriptors only — no
 * React/JSX here so the package stays framework-agnostic.
 */

import type {
  DefaultsMap,
  EntityFieldDefaults,
  InheritanceLabel,
  OnParentChange,
} from "./types";

// =============================================================================
// applyCascadeDefaults
// =============================================================================

export type CascadeTrigger = "create" | "reset";

/**
 * Optional session context passed by the caller. Consumed by `current_actor`
 * defaults so header fields like `requested_by` and `responsible_person_id`
 * can pre-fill to the acting user without a per-service side-branch.
 */
export interface CascadeSession {
  actor_id?: string | null;
}

/**
 * Returns a copy of `formRow` with cascade defaults applied for fields whose
 * `default_value_source.apply_on` includes `trigger`. Never overwrites a
 * non-null existing value (so user input is preserved).
 *
 * Supports kinds:
 *   • parent_field   — copies from parent row
 *   • static         — uses static_value
 *   • current_actor  — uses session.actor_id (falls back to null when session
 *                      is absent)
 *
 * Other kinds (tenant_config / supplier_config) are no-ops in this module;
 * the caller must resolve those externally and inject as parentRow entries.
 */
export function applyCascadeDefaults(
  formRow:     Record<string, unknown>,
  parentRow:   Record<string, unknown> | null,
  defaultsMap: DefaultsMap,
  trigger:     CascadeTrigger,
  session?:    CascadeSession,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...formRow };

  for (const [field, defaults] of Object.entries(defaultsMap)) {
    const source = defaults.default_value_source;
    if (!source) continue;
    if (source.apply_on && !source.apply_on.includes(trigger)) continue;

    // Don't overwrite user input
    if (next[field] != null) continue;

    switch (source.kind) {
      case "parent_field": {
        if (parentRow && source.parent_field) {
          next[field] = parentRow[source.parent_field] ?? null;
        }
        break;
      }
      case "static": {
        next[field] = source.static_value ?? null;
        break;
      }
      case "current_actor": {
        next[field] = session?.actor_id ?? null;
        break;
      }
      // tenant_config / supplier_config — caller's responsibility
      default:
        break;
    }
  }

  return next;
}

// =============================================================================
// renderInheritanceChipModel
// =============================================================================

export interface InheritanceChipModel {
  /** Whether to render any chip at all. */
  visible:  boolean;
  /** Display variant — UI maps these to colors / weight. */
  variant:  "neutral" | "inherited" | "overridden" | "muted";
  /** The text content of the chip. */
  label:    string;
  /** Where the chip should anchor in the UI. */
  position: "field_label" | "field_value" | "none";
}

/**
 * Convert an inheritance label into a UI-ready chip model. Variants and labels
 * are driven entirely by the field's `defaults.override_detection` + `ui_affordance`.
 *
 * Caller renders the chip using its UI primitives (no React here).
 */
export function renderInheritanceChipModel(
  label:    InheritanceLabel,
  defaults: EntityFieldDefaults,
): InheritanceChipModel {
  const affordance = defaults.ui_affordance ?? {};
  const detection  = defaults.override_detection;

  if (affordance.show_inheritance_chip !== true || !detection) {
    return { visible: false, variant: "neutral", label: "", position: "none" };
  }

  const position = affordance.chip_position ?? "field_label";

  switch (label) {
    case "inherited_match":
      return {
        visible: true,
        variant: "inherited",
        label:   detection.label_when_inherited ?? "Inherited",
        position,
      };
    case "overridden":
      return {
        visible: true,
        variant: "overridden",
        label:   detection.label_when_overridden ?? "Overridden",
        position,
      };
    case "inherited_null":
      return {
        visible: true,
        variant: "muted",
        label:   detection.label_when_inherited_null ?? "Not set",
        position,
      };
    case "unset":
      return { visible: false, variant: "neutral", label: "", position };
  }
}

// =============================================================================
// handleParentChange
// =============================================================================

export interface ParentChangeAction {
  /** Indices of child rows the runtime should touch. */
  affected_indices: number[];
  /** Behavior the UI should perform. */
  behavior:
    | "silent_preserve"      // do nothing
    | "silent_propagate"     // overwrite child values with new parent value
    | "prompt_user"          // open a dialog asking for confirmation
    | "recompute";           // trigger a re-evaluation (e.g. waterfall)
  /** When behavior=prompt_user, the message body. */
  prompt_message?: string;
}

/**
 * Describes what the form runtime should do with child rows when a parent
 * field changes. Pure function — returns the action descriptor; the caller
 * applies the side effect.
 */
export function handleParentChange(
  fieldName:    string,
  oldValue:     unknown,
  newValue:     unknown,
  childRows:    Array<Record<string, unknown>>,
  defaults:     EntityFieldDefaults,
): ParentChangeAction {
  if (oldValue === newValue) {
    return { affected_indices: [], behavior: "silent_preserve" };
  }

  const policy: OnParentChange = defaults.on_parent_change ?? "preserve";

  switch (policy) {
    case "preserve":
      return { affected_indices: [], behavior: "silent_preserve" };
    case "inherit":
      return {
        affected_indices: childRows.map((_, i) => i),
        behavior:         "silent_propagate",
      };
    case "prompt":
      return {
        affected_indices: childRows.map((_, i) => i),
        behavior:         "prompt_user",
        prompt_message:   `Parent value for "${fieldName}" changed. Update child rows that previously inherited?`,
      };
    case "recompute":
      return {
        affected_indices: childRows.map((_, i) => i),
        behavior:         "recompute",
      };
  }
}
