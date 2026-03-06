/**
 * META Engine Type Definitions
 *
 * Core types for the META Engine system including:
 * - Entity schema definitions
 * - Compiled model structures
 * - Policy definitions
 * - Audit event types
 *
 * These are pure types with no implementation - they define the contracts
 * that all META Engine components must adhere to.
 */

import type { ConditionGroup } from "./validation-rules.js";

// ============================================================================
// Field Types and Definitions
// ============================================================================

/**
 * Supported field types for entity schemas.
 * These are canonical data types — storage + validation + API contract.
 * UI presentation is handled separately via SemanticFormat + FieldUiHint.
 */
export type FieldType =
  | "string"
  | "text"       // long string (multi-line)
  | "integer"    // whole numbers
  | "number"     // floating-point (legacy compat)
  | "decimal"    // fixed-point numeric
  | "boolean"
  | "date"
  | "datetime"
  | "reference"
  | "enum"
  | "json"
  | "uuid"
  | "rich_text";

// ============================================================================
// Semantic Format & Structured Configs
// ============================================================================

/**
 * Core semantic format hints — platform-level, DB-constrained.
 *
 * These are the canonical formats that the platform understands natively.
 * They drive auto-detect UI specialization (e.g., "text" + format="email" → email input)
 * and are validated by a DB CHECK constraint on meta.field.format.
 *
 * For tenant-extensible semantic tags (e.g., "tax_id", "bank_account", "iban",
 * "bic_swift", "attachment", "image", "signature", "duration", "rating"),
 * use `ui_hint.props.semanticTag` — which is unconstrained JSONB and can be
 * extended per-tenant without DDL changes.
 */
export type SemanticFormat =
  | "email"
  | "phone"
  | "url"
  | "money"
  | "percent"
  | "password"
  | "color"
  | "country"
  | "timezone"
  | "markdown"
  | "html"
  | "ip_address"
  | "slug";

/**
 * Core format values as a runtime array — used by Zod schemas and DB constraints.
 */
export const CORE_SEMANTIC_FORMATS: readonly string[] = [
  "email", "phone", "url", "money", "percent", "password",
  "color", "country", "timezone", "markdown", "html",
  "ip_address", "slug",
] as const;

/**
 * Field origin — system-managed vs business-defined.
 * System fields are hidden in business forms by default.
 */
export type FieldOrigin = "system" | "business";

/**
 * Canonical field constraints — single source of truth for validation.
 * Replaces scattered validation JSONB reads in resolve logic.
 *
 * The flat shape is intentional (stored as JSONB in meta.field.constraints).
 * Type-family validation ensures only valid combinations are persisted:
 *
 * | Data Type Family       | Valid Keys                                           |
 * |------------------------|------------------------------------------------------|
 * | base (all types)       | required, nullable                                   |
 * | string, text, rich_text| + minLength, maxLength, pattern                      |
 * | integer, number, decimal| + min, max, precision, scale                        |
 * | date, datetime         | + minDate, maxDate                                   |
 * | enum                   | + allowedValues                                      |
 * | boolean, uuid, json,   | base only (no extra keys)                            |
 * |   reference            |                                                      |
 *
 * Invalid combinations (e.g., pattern on decimal, precision on boolean)
 * are rejected at the Zod validation layer and by DB CHECK constraints.
 */
export type FieldConstraints = {
  // ── Base (all types) ──
  nullable?: boolean;
  required?: boolean;

  // ── String family (string, text, rich_text) ──
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // ── Numeric family (integer, number, decimal) ──
  min?: number;
  max?: number;
  precision?: number;
  scale?: number;

  // ── Date family (date, datetime) ──
  minDate?: string;
  maxDate?: string;

  // ── Enum family ──
  allowedValues?: string[];
};

/**
 * Data-type families for constraint validation.
 * Maps each FieldType to the set of constraint keys it allows beyond base.
 */
export const CONSTRAINT_KEYS_BY_FAMILY: Record<string, readonly string[]> = {
  // String family
  string:    ["minLength", "maxLength", "pattern"],
  text:      ["minLength", "maxLength", "pattern"],
  rich_text: ["minLength", "maxLength", "pattern"],

  // Numeric family
  integer:   ["min", "max", "precision", "scale"],
  number:    ["min", "max", "precision", "scale"],
  decimal:   ["min", "max", "precision", "scale"],

  // Date family
  date:      ["minDate", "maxDate"],
  datetime:  ["minDate", "maxDate"],

  // Enum family
  enum:      ["allowedValues"],

  // Base-only types (no extra constraint keys allowed)
  boolean:   [],
  uuid:      [],
  reference: [],
  json:      [],
};

/** Base constraint keys valid for all data types. */
export const BASE_CONSTRAINT_KEYS: readonly string[] = ["required", "nullable"];

/**
 * Structured UI hint — the override layer for UI presentation.
 * Auto-detect provides defaults; this overrides them at field/view/tenant level.
 *
 * Storage: flat JSONB in meta.field.ui_hint (backward-compatible).
 * Consumption: components should consume ResolvedFieldUiMeta (logically grouped),
 *   never read this raw type ad hoc.
 *
 * Logical sub-groups (for documentation and future splitting):
 *   renderer:  type, viewType, editType, props
 *   form:      placeholder, helpText, hidden, disabled, readOnly, lockOnEdit
 *   layout:    section, group, layout, density, icon
 *   list:      listColumnWidth, listColumnAlignment
 *
 * Note: readOnly and lockOnEdit are Layer 8 (UI advisory) in the mutability
 * precedence chain. They influence rendering but NEVER override domain/security
 * truth from higher layers (is_computed, is_read_only, editability, etc).
 */
export type FieldUiHint = {
  // ── Renderer (which component to use) ──
  /** Generic UI type override */
  type?: string;
  /** Read-mode component (tables, detail views) */
  viewType?: string;
  /** Form edit component */
  editType?: string;
  /** Additional props passed to the UI component */
  props?: Record<string, unknown>;

  // ── Form behavior (how the field behaves in forms) ──
  /** Hide the field entirely */
  hidden?: boolean;
  /** Disable editing (greyed out) — Layer 8 advisory */
  disabled?: boolean;
  /** Input placeholder text */
  placeholder?: string;
  /** Help text shown near field */
  helpText?: string;
  /** Mark as read-only — Layer 8 advisory, never overrides domain truth */
  readOnly?: boolean;
  /** Lock field after first save — Layer 8 advisory */
  lockOnEdit?: boolean;

  // ── Layout (form positioning and density) ──
  /** Section assignment for form layout */
  section?: string;
  /** Group/section name for form layout grouping */
  group?: string;
  /** Layout width in form grid */
  layout?: "full" | "half" | "third";
  /** Visual density */
  density?: "compact" | "normal" | "comfortable";
  /** Icon identifier for field */
  icon?: string;

  // ── List (table/list view config) ──
  /** List column width (px or "auto") */
  listColumnWidth?: number | "auto";
  /** List column alignment */
  listColumnAlignment?: "left" | "center" | "right";
};

// ============================================================================
// Resolved Field UI Meta (consumed by components — never raw ui_hint)
// ============================================================================

/**
 * Renderer sub-group — which component to use for this field.
 */
export type UiRendererConfig = {
  /** Resolved UI type (generic) */
  type?: string;
  /** View-mode component override */
  viewType?: string;
  /** Edit-mode component override */
  editType?: string;
  /** Additional props for the component */
  props: Record<string, unknown>;
};

/**
 * Form behavior sub-group — how the field behaves in entity forms.
 */
export type UiFormConfig = {
  /** Placeholder text for inputs */
  placeholder?: string;
  /** Help text / description shown near field */
  helpText?: string;
  /** Whether the field is visually hidden */
  hidden: boolean;
  /** Whether the field input is disabled (greyed out) */
  disabled: boolean;
};

/**
 * Layout sub-group — form positioning and visual density.
 */
export type UiLayoutConfig = {
  /** Section assignment for form grouping */
  section?: string;
  /** Group name for form sub-grouping */
  group?: string;
  /** Width in form grid: full (12 cols), half (6), third (4) */
  layout: "full" | "half" | "third";
  /** Visual density */
  density: "compact" | "normal" | "comfortable";
  /** Icon identifier */
  icon?: string;
};

/**
 * List/table sub-group — how the field appears in list views.
 */
export type UiListConfig = {
  /** Column width (px or "auto") */
  columnWidth: number | "auto";
  /** Column alignment */
  columnAlignment: "left" | "center" | "right";
};

/**
 * Fully resolved UI metadata — logically grouped, with defaults filled.
 *
 * This is what components should consume. It normalizes the flat FieldUiHint
 * into typed sub-groups so renderers, forms, and tables never parse raw JSONB.
 *
 * Produced by resolveFieldUiMeta() at resolution time.
 */
export type ResolvedFieldUiMeta = {
  /** Renderer selection config */
  renderer: UiRendererConfig;
  /** Form behavior config */
  form: UiFormConfig;
  /** Layout/positioning config */
  layout: UiLayoutConfig;
  /** List/table view config */
  list: UiListConfig;
};

/**
 * Structured enum configuration.
 * Supports static values, dynamic sources, grouping, and i18n.
 */
export type EnumConfig = {
  values: Array<{
    value: string;
    label?: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
    /** Group name for large enum sets (e.g., "Status" vs "Reason") */
    group?: string;
  }>;
  /** Value source: inline static or from another entity/config */
  source?: "static" | "dynamic";
  /** Entity reference when source=dynamic */
  dynamicRef?: string;
  /** i18n key prefix for label localization */
  i18nKey?: string;
};

/**
 * Structured reference configuration — **structural relationship contract**.
 *
 * Owns: what entity, how joined, FK wiring, value resolution strategy.
 * Does NOT own: search UX, display formatting, relevance ranking, debounce,
 *   page size, or anything the user sees in a picker dropdown — that belongs
 *   to LookupProfile (on meta.field) and IdentityConfig (on meta.entity).
 *
 * Legacy search/display fields (displayField, searchFields, filter, cacheMode,
 * defaultSort, typeaheadLimit, serverSearchMode) are retained for backward
 * compatibility but are **deprecated in favor of LookupProfile**. The resolution
 * engine reads them as fallback hints only when lookupProfile is absent.
 */
export type ReferenceConfig = {
  // ── Structural (authoritative) ──────────────────────────────────────

  /** Target entity name (logical, not physical table) */
  entity: string;
  /** Relationship type (drives join strategy and UI picker type) */
  relationshipKind?: "many-to-one" | "one-to-one" | "one-to-many" | "many-to-many";
  /** Junction/join entity for M:N relationships */
  joinEntity?: string;
  /** FK column in join entity pointing to this entity */
  joinLeftKey?: string;
  /** FK column in join entity pointing to target entity */
  joinRightKey?: string;
  /** Target key field (default "id") */
  valueField?: string;
  /** How selected values are resolved for display */
  hydrateStrategy?: "byIds" | "embedded";
  /** Allow creating new referenced records inline */
  allowCreateInline?: boolean;

  // ── Legacy search/display hints (deprecated → use LookupProfile) ───

  /** @deprecated Use LookupProfile.displayTemplate or IdentityConfig.primaryLabelField */
  displayField?: string;
  /** @deprecated Use LookupProfile.searchFields */
  searchFields?: string[];
  /** @deprecated Use LookupProfile.filters */
  filter?: Record<string, unknown>;
  /** @deprecated Use LookupProfile.cacheMode */
  cacheMode?: "none" | "session" | "global";
  /** @deprecated Use LookupProfile.orderBy */
  defaultSort?: string;
  /** @deprecated Use LookupProfile.pageSize */
  typeaheadLimit?: number;
  /** @deprecated Use LookupProfile.matchMode */
  serverSearchMode?: "contains" | "startsWith" | "fts";
};

// ============================================================================
// Lookup System Types
// ============================================================================

/**
 * Identity configuration — **entity-level self-description** for lookups.
 *
 * Declares how an entity identifies itself when used as a lookup target.
 * Consumed server-side by the Lookup Search API to auto-derive search fields
 * and display labels when no field-level LookupProfile exists.
 *
 * Stored in meta.entity.identity_config JSONB.
 *
 * Boundary:
 *   - IdentityConfig = "I am Supplier. My code is 'code', my name is 'name'."
 *   - LookupProfile  = "When picking a Supplier from invoice.supplier_id,
 *                        search code first (weight 10), name second (weight 5),
 *                        show '{{code}} — {{name}}', debounce 200ms."
 */
export type IdentityConfig = {
  /** Primary human-readable label field (e.g., "name") */
  primaryLabelField: string;
  /** Primary code/mnemonic field (e.g., "code", "supplier_code") */
  primaryCodeField?: string;
  /** Alternate unique key fields for search (e.g., ["tax_id", "duns_number"]) */
  alternateKeys?: string[];
  /** Search aliases / synonyms (e.g., ["vendor", "provider"] for Supplier) */
  searchAliases?: string[];
  /** Display template override at entity level: "{{code}} — {{name}}" */
  displayTemplate?: string;
};

/**
 * Search field entry with weight for relevance ranking.
 * Higher weight = higher ranking when matched.
 */
export type LookupSearchField = {
  /** Column name to search */
  field: string;
  /** Weight multiplier for ranking (default 1). Code fields typically get higher weight. */
  weight?: number;
  /** Match modes this field participates in (defaults to all) */
  matchModes?: Array<"exact" | "prefix" | "contains" | "token">;
};

/**
 * Lookup profile — **search/display UX contract** for a reference field.
 *
 * Owns: how the user searches (fields, weights, match modes), how results
 * are displayed (template, sublabel), and all UX tuning (debounce, pageSize,
 * minChars, context-aware filters, caching, security scope).
 *
 * Does NOT own: which entity is referenced, how the FK is joined, value
 * resolution — that belongs to ReferenceConfig (structural relationship).
 *
 * Resolution chain (highest → lowest):
 *   1. field.lookupProfile   — explicit per-field override
 *   2. referenceConfig hints — deprecated fallback (displayField, searchFields, etc.)
 *   3. target entity IdentityConfig — server-side merge in lookup API
 *   4. heuristic defaults    — auto-detect from column naming patterns
 *
 * Merge semantics (see OverlayMergeSemantics for formalization):
 *   - searchFields: UNION (deduplicate by field name, keep highest weight)
 *   - filters/filtersByContext: DEEP_MERGE (keys from higher layer win)
 *   - all scalars: REPLACE (first non-null from highest layer wins)
 */
export type LookupProfile = {
  /** Display template: "{{code}} — {{name}}" */
  displayTemplate?: string;
  /** Ordered search fields with weights */
  searchFields?: LookupSearchField[];
  /** Default match mode */
  matchMode?: "exact" | "prefix" | "contains" | "token";
  /** Static filters always applied to lookup queries */
  filters?: Record<string, unknown>;
  /** Context-aware filters: { create: { is_active: true }, edit: {}, view: {} } */
  filtersByContext?: Record<string, Record<string, unknown>>;
  /** Default result ordering (column name, prepend "-" for desc) */
  orderBy?: string;
  /** Minimum characters before search triggers (default 2) */
  minChars?: number;
  /** Client debounce in milliseconds (default 300) */
  debounceMs?: number;
  /** Results per page (default 20) */
  pageSize?: number;
  /** Cache mode for lookup results */
  cacheMode?: "none" | "session" | "global";
  /** Security scope: "tenant" | "ou" | "custom" */
  securityScope?: string;
};

// ============================================================================
// Overlay Merge Semantics
// ============================================================================

/**
 * Canonical merge strategy for a single property during overlay resolution.
 *
 * When multiple layers contribute a value for the same property (e.g., field
 * lookupProfile vs tenant override vs enterprise overlay), the merge strategy
 * determines which value survives.
 */
export type MergeStrategy =
  /** Higher layer wins outright. Default for scalars. */
  | "replace"
  /** Arrays are concatenated and deduplicated (by key field). Used for searchFields. */
  | "union"
  /** Objects are deep-merged: keys from higher layer overwrite, lower keys preserved. */
  | "deep_merge"
  /** Lower layer value is kept — higher layer can only fill gaps. */
  | "fill";

/**
 * Merge rule for a named property — binds a strategy to an optional dedup key.
 */
export type MergeRule = {
  strategy: MergeStrategy;
  /** For "union" strategy on arrays of objects: field used to deduplicate (e.g., "field" for searchFields). */
  unionKey?: string;
  /** For "union" strategy: when duplicates collide, keep the entry with the higher value of this field (e.g., "weight"). */
  unionPrefer?: "higher" | "lower" | "first";
};

/**
 * Overlay merge semantics — declares per-property merge rules for a config type.
 *
 * This is the canonical, pre-deployment contract that prevents ambiguity
 * when tenant/customer overlays extend base configs. Every JSONB config
 * column (lookup_profile, identity_config, ui_hint, etc.) should have
 * a corresponding MergeSemantics declaration.
 *
 * Example usage in resolution code:
 *   const rules = LOOKUP_PROFILE_MERGE;
 *   for (const [prop, rule] of Object.entries(rules)) {
 *     merged[prop] = applyMergeRule(rule, higher[prop], lower[prop]);
 *   }
 */
export type OverlayMergeSemantics = Record<string, MergeRule>;

/**
 * Canonical merge rules for LookupProfile overlays.
 *
 * Applied when resolving: tenant overlay > field.lookupProfile > referenceConfig hints > defaults.
 */
export const LOOKUP_PROFILE_MERGE: OverlayMergeSemantics = {
  displayTemplate:  { strategy: "replace" },
  searchFields:     { strategy: "union", unionKey: "field", unionPrefer: "higher" },
  matchMode:        { strategy: "replace" },
  filters:          { strategy: "deep_merge" },
  filtersByContext:  { strategy: "deep_merge" },
  orderBy:          { strategy: "replace" },
  minChars:         { strategy: "replace" },
  debounceMs:       { strategy: "replace" },
  pageSize:         { strategy: "replace" },
  cacheMode:        { strategy: "replace" },
  securityScope:    { strategy: "replace" },
};

/**
 * Canonical merge rules for IdentityConfig overlays.
 */
export const IDENTITY_CONFIG_MERGE: OverlayMergeSemantics = {
  primaryLabelField: { strategy: "replace" },
  primaryCodeField:  { strategy: "replace" },
  alternateKeys:     { strategy: "union", unionKey: undefined, unionPrefer: "first" },
  searchAliases:     { strategy: "union", unionKey: undefined, unionPrefer: "first" },
  displayTemplate:   { strategy: "replace" },
};

/**
 * Canonical merge rules for FieldUiHint overlays.
 *
 * Applied when resolving: compiled overlay > field.uiHint > legacy validation.ui.
 *
 * Organized by logical sub-group:
 *   renderer: type, viewType, editType, props
 *   form:     placeholder, helpText, hidden, disabled, readOnly, lockOnEdit
 *   layout:   section, group, layout, density, icon
 *   list:     listColumnWidth, listColumnAlignment
 */
export const UI_HINT_MERGE: OverlayMergeSemantics = {
  // ── Renderer ──
  type:                { strategy: "replace" },
  viewType:            { strategy: "replace" },
  editType:            { strategy: "replace" },
  props:               { strategy: "deep_merge" },

  // ── Form behavior ──
  placeholder:         { strategy: "replace" },
  helpText:            { strategy: "replace" },
  hidden:              { strategy: "replace" },
  disabled:            { strategy: "replace" },
  readOnly:            { strategy: "replace" },
  lockOnEdit:          { strategy: "replace" },

  // ── Layout ──
  section:             { strategy: "replace" },
  group:               { strategy: "replace" },
  layout:              { strategy: "replace" },
  density:             { strategy: "replace" },
  icon:                { strategy: "replace" },

  // ── List ──
  listColumnWidth:     { strategy: "replace" },
  listColumnAlignment: { strategy: "replace" },
};

/**
 * Apply a single merge rule to produce a resolved value.
 *
 * @param rule - The merge rule for this property
 * @param higher - Value from higher-priority layer (overlay / field-level)
 * @param lower - Value from lower-priority layer (base / heuristic)
 * @returns The resolved value
 */
export function applyMergeRule(rule: MergeRule, higher: unknown, lower: unknown): unknown {
  switch (rule.strategy) {
    case "replace":
      return higher ?? lower;

    case "fill":
      return lower ?? higher;

    case "deep_merge": {
      if (higher == null) return lower;
      if (lower == null) return higher;
      if (typeof higher !== "object" || typeof lower !== "object") return higher;
      return { ...(lower as Record<string, unknown>), ...(higher as Record<string, unknown>) };
    }

    case "union": {
      if (higher == null) return lower;
      if (lower == null) return higher;
      if (!Array.isArray(higher) || !Array.isArray(lower)) return higher;

      if (!rule.unionKey) {
        // Primitive arrays: concat + deduplicate
        return [...new Set([...higher, ...lower])];
      }

      // Object arrays: merge by unionKey, prefer higher on collision
      const merged = new Map<string, unknown>();
      for (const item of lower) {
        const key = (item as Record<string, unknown>)[rule.unionKey];
        if (key != null) merged.set(String(key), item);
      }
      for (const item of higher) {
        const key = (item as Record<string, unknown>)[rule.unionKey];
        if (key != null) merged.set(String(key), item);
      }
      return [...merged.values()];
    }

    default:
      return higher ?? lower;
  }
}

/**
 * Apply a full OverlayMergeSemantics to merge two layers.
 *
 * @param semantics - Per-property merge rules
 * @param higher - Higher-priority layer (values win on collision)
 * @param lower - Lower-priority layer (base/defaults)
 * @returns Merged result
 */
export function mergeWithSemantics<T extends Record<string, unknown>>(
  semantics: OverlayMergeSemantics,
  higher: Partial<T> | null | undefined,
  lower: Partial<T> | null | undefined,
): T {
  if (!higher && !lower) return {} as T;
  if (!higher) return (lower ?? {}) as T;
  if (!lower) return (higher ?? {}) as T;

  const result: Record<string, unknown> = {};

  // Process all keys from semantics
  for (const [prop, rule] of Object.entries(semantics)) {
    result[prop] = applyMergeRule(
      rule,
      (higher as Record<string, unknown>)[prop],
      (lower as Record<string, unknown>)[prop],
    );
  }

  // Pass through any keys not in semantics (from higher layer only — safety valve)
  for (const key of Object.keys(higher)) {
    if (!(key in semantics)) {
      result[key] = (higher as Record<string, unknown>)[key];
    }
  }

  return result as T;
}

// ============================================================================
// Capability Flag Defaults (per data type)
// ============================================================================
//
// List-page capabilities (isSortable, isGroupable, isAggregatable) should not
// require manual curation per field. Instead, derive effective capabilities as:
//
//   type default  →  system restrictions  →  explicit field override  →  overlay narrowing
//
// This reduces hand-maintenance and improves consistency.
//

/**
 * Per-type default capability flags.
 *
 * The effective capability is computed as:
 *   1. Start from CAPABILITY_DEFAULTS[dataType]
 *   2. Apply system restrictions (computed/system fields → not aggregatable)
 *   3. Apply explicit field override (field.isSortable overrides default)
 *   4. Apply overlay narrowing (can disable, never enable)
 */
export const CAPABILITY_DEFAULTS: Record<FieldType, {
  sortable: boolean;
  groupable: boolean;
  aggregatable: boolean;
}> = {
  string:    { sortable: true,  groupable: true,  aggregatable: false },
  text:      { sortable: false, groupable: false, aggregatable: false },
  integer:   { sortable: true,  groupable: true,  aggregatable: true  },
  number:    { sortable: true,  groupable: false, aggregatable: true  },
  decimal:   { sortable: true,  groupable: false, aggregatable: true  },
  boolean:   { sortable: true,  groupable: true,  aggregatable: false },
  date:      { sortable: true,  groupable: true,  aggregatable: false },
  datetime:  { sortable: true,  groupable: false, aggregatable: false },
  reference: { sortable: false, groupable: true,  aggregatable: false },
  enum:      { sortable: true,  groupable: true,  aggregatable: false },
  json:      { sortable: false, groupable: false, aggregatable: false },
  uuid:      { sortable: false, groupable: false, aggregatable: false },
  rich_text: { sortable: false, groupable: false, aggregatable: false },
};

/**
 * Resolve effective capability flags for a field.
 *
 * Priority chain:
 *   1. Type defaults from CAPABILITY_DEFAULTS
 *   2. System restrictions (computed → not aggregatable, system origin → not groupable)
 *   3. Explicit field override (isSortable/isGroupable/isAggregatable)
 *
 * Overlay narrowing happens downstream via FIELD_OVERLAY_SAFETY narrowable rules.
 */
export function resolveCapabilityDefaults(
  dataType: FieldType,
  opts?: {
    isComputed?: boolean;
    origin?: FieldOrigin;
    isSortable?: boolean;
    isGroupable?: boolean;
    isAggregatable?: boolean;
  },
): { sortable: boolean; groupable: boolean; aggregatable: boolean } {
  const defaults = CAPABILITY_DEFAULTS[dataType] ?? {
    sortable: false, groupable: false, aggregatable: false,
  };

  // Start from type defaults
  let { sortable, groupable, aggregatable } = defaults;

  // System restrictions — computed fields should not be aggregatable by default
  if (opts?.isComputed) {
    aggregatable = false;
  }

  // System origin — suppress grouping (system fields are not business-meaningful groups)
  if (opts?.origin === "system") {
    groupable = false;
  }

  // Explicit field overrides — can both enable and restrict
  if (opts?.isSortable !== undefined) sortable = opts.isSortable;
  if (opts?.isGroupable !== undefined) groupable = opts.isGroupable;
  if (opts?.isAggregatable !== undefined) aggregatable = opts.isAggregatable;

  return { sortable, groupable, aggregatable };
}

// ============================================================================
// Overlay Safety Policy
// ============================================================================
//
// Classifies field properties by what overlay operations are permitted.
// Used by the overlay resolution engine and compiler to enforce safety.
//
// Overlays can modify UX concerns freely but must never weaken domain/security truth.
//

/**
 * Overlay safety classification for a field property.
 *
 * - `replaceable`: Overlay can freely replace the value (UX concerns)
 * - `narrowable`: Overlay can make more restrictive, never less (business rules)
 * - `immutable`: Overlay cannot change this value (domain/security truth)
 */
export type OverlaySafetyLevel = "replaceable" | "narrowable" | "immutable";

/**
 * Canonical overlay safety policy for field properties.
 *
 * This is the single source of truth for what overlays can do to field metadata.
 * The compiler validates overlay changes against this policy.
 */
export const FIELD_OVERLAY_SAFETY: Record<string, OverlaySafetyLevel> = {
  // ── Freely replaceable (UX concerns) ──
  label:                "replaceable",
  description:          "replaceable",
  placeholder:          "replaceable",   // via ui_hint
  helpText:             "replaceable",   // via ui_hint
  section:              "replaceable",   // via ui_hint
  group:                "replaceable",   // via ui_hint
  icon:                 "replaceable",   // via ui_hint
  layout:               "replaceable",   // via ui_hint
  density:              "replaceable",   // via ui_hint
  listColumnWidth:      "replaceable",   // via ui_hint
  listColumnAlignment:  "replaceable",   // via ui_hint
  displayTemplate:      "replaceable",   // via lookup_profile
  defaultSort:          "replaceable",   // via lookup_profile.orderBy
  debounceMs:           "replaceable",   // via lookup_profile
  minChars:             "replaceable",   // via lookup_profile
  pageSize:             "replaceable",   // via lookup_profile
  defaultValue:         "replaceable",

  // ── Narrowable only (can restrict, never relax) ──
  visibility:           "narrowable",    // can hide, cannot un-hide
  editability:          "narrowable",    // can make read-only, cannot make editable
  isFilterable:         "narrowable",    // can disable filtering, cannot enable
  isSearchable:         "narrowable",    // can disable search, cannot enable
  isSortable:           "narrowable",    // can disable sort, cannot enable
  isGroupable:          "narrowable",    // can disable grouping, cannot enable
  isAggregatable:       "narrowable",    // can disable aggregation, cannot enable

  // ── Immutable (domain/security truth — overlays cannot change) ──
  dataType:             "immutable",
  cardinality:          "immutable",
  columnName:           "immutable",
  origin:               "immutable",
  isComputed:           "immutable",
  isReadOnly:           "immutable",
  writeOnce:            "immutable",
  computeMode:          "immutable",
  computeExpr:          "immutable",
  referenceConfig:      "immutable",     // structural relationship
  constraints:          "immutable",     // validation semantics
  moneyConfig:          "immutable",     // currency governance
  datetimeConfig:       "immutable",     // timezone governance
  enumConfig:           "immutable",     // enum definition
  collectionBehavior:   "immutable",     // ownership/lifecycle
};

// ============================================================================
// Version-Diff Change Classification
// ============================================================================
//
// When publishing a new entity version, each field change must be classified
// for safe migration. This prevents accidental breaking changes in production.
//

/**
 * Change impact classification for a single field modification
 * between two published entity versions.
 */
export type ChangeImpact =
  /** UX-only — no migration needed (label, description, ui_hint, etc.) */
  | "non_breaking"
  /** Data-compatible but may affect queries/views — needs review */
  | "migration_required"
  /** Incompatible change — requires explicit migration plan */
  | "breaking"
  /** Cannot be published without resolving — blocks publish */
  | "publish_blocking";

/**
 * A single classified change between two field versions.
 */
export type FieldVersionDiff = {
  /** Field name (may differ between versions for renames) */
  fieldName: string;
  /** Property that changed */
  property: string;
  /** Previous value (from old version) */
  previousValue?: unknown;
  /** New value (in draft version) */
  newValue?: unknown;
  /** Impact classification */
  impact: ChangeImpact;
  /** Human-readable reason for the classification */
  reason: string;
};

/**
 * Classification of an entire entity version diff.
 */
export type EntityVersionDiff = {
  entityName: string;
  fromVersion: string;
  toVersion: string;
  /** All field-level changes */
  changes: FieldVersionDiff[];
  /** Highest severity across all changes */
  maxImpact: ChangeImpact;
  /** Summary counts by impact level */
  summary: Record<ChangeImpact, number>;
};

/**
 * Rules for classifying field property changes.
 * Maps property names to their impact when modified on a published version.
 */
export const FIELD_CHANGE_IMPACT: Record<string, ChangeImpact> = {
  // ── Non-breaking (UX-only) ──
  label:                "non_breaking",
  description:          "non_breaking",
  ui:                   "non_breaking",
  placeholder:          "non_breaking",
  helpText:             "non_breaking",
  visibility:           "non_breaking",
  editability:          "non_breaking",
  isSortable:           "non_breaking",
  isGroupable:          "non_breaking",
  isAggregatable:       "non_breaking",
  lookupProfile:        "non_breaking",
  sortOrder:            "non_breaking",

  // ── Migration-required (data-compatible but query/view impact) ──
  isSearchable:         "migration_required",
  isFilterable:         "migration_required",
  isReadOnly:           "migration_required",
  writeOnce:            "migration_required",
  defaultValue:         "migration_required",
  constraints:          "migration_required",
  isDeprecated:         "migration_required",

  // ── Breaking (structural, schema-level) ──
  dataType:             "breaking",
  cardinality:          "breaking",
  columnName:           "breaking",
  referenceConfig:      "breaking",
  computeMode:          "breaking",
  computeExpr:          "breaking",
  collectionBehavior:   "breaking",
  childEntityName:      "breaking",
  childFkField:         "breaking",
  moneyConfig:          "breaking",
  datetimeConfig:       "breaking",
  enumConfig:           "breaking",
};

/**
 * Adding a new required field to a published schema is publish-blocking
 * unless a default value is provided.
 */
export const PUBLISH_BLOCKING_RULES = {
  /** New required field without default on published schema */
  newRequiredFieldWithoutDefault: "publish_blocking" as ChangeImpact,
  /** Removing a field that exists in published version */
  removedField: "breaking" as ChangeImpact,
  /** Adding an optional field (always safe) */
  addedOptionalField: "non_breaking" as ChangeImpact,
} as const;

// ============================================================================
// JSON Field Configuration
// ============================================================================

/**
 * JSON field configuration — distinguishes free-form from schema-validated JSON.
 */
export type JsonFieldConfig = {
  /** Free-form or schema-validated */
  mode?: "free" | "schema";
  /** Reference to JSON Schema definition (when mode=schema) */
  schemaRef?: string;
};

/**
 * Money configuration — ensures consistent storage, validation, UI, and reporting.
 * Same config used by UI, API validation, and posting engine.
 */
export type MoneyConfig = {
  /** How the currency is determined for this field */
  currencyMode: "fixed" | "rowField" | "tenantDefault";
  /** Column name containing currency code (when mode=rowField) */
  currencyField?: string;
  /** How currency is stored in the row field */
  currencyFieldType?: "string" | "reference";
  /** Entity for currency reference (e.g., "core.currency") */
  currencyRefEntity?: string;
  /** Fixed ISO currency code (when mode=fixed) */
  fixedCurrency?: string;
  /** Rounding mode for calculations and display */
  roundingMode?: "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP";
  /** Scale determination: use currency minor units or fixed */
  scaleMode?: "currency" | "fixed";
  /** Fixed decimal places (when scaleMode=fixed) */
  fixedScale?: number;
  /** Whether negative amounts are allowed (default true) */
  allowNegative?: boolean;
};

/**
 * Datetime configuration — explicit timezone handling.
 */
export type DatetimeConfig = {
  /** Timezone display/storage mode */
  timezoneMode: "tenant" | "user" | "utc";
};

// ============================================================================
// Mutability Resolution Order
// ============================================================================
//
// Multiple flags can affect whether a field is editable. They are resolved
// in a strict precedence chain — higher levels CANNOT be relaxed by lower levels.
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ Layer │ Source                  │ Effect                │ Overridable?      │
// ├───────┼─────────────────────────┼───────────────────────┼───────────────────┤
// │  1    │ is_computed = true      │ always read-only      │ NO — hardcoded    │
// │  2    │ is_read_only = true     │ read-only all contexts│ NO — domain flag  │
// │  3    │ origin = "system"       │ read-only in business │ NO — domain rule  │
// │  4    │ write_once = true       │ editable only on      │ NO — domain flag  │
// │       │                         │ create (empty value)  │                   │
// │  5    │ editability { ctx }     │ per-context control   │ YES — by overlay  │
// │       │ + editability overlay   │ (replace / extend)    │                   │
// │  6    │ convention columns      │ lifecycle_managed,    │ NO — convention   │
// │       │                         │ derived_hierarchy, PK │                   │
// │  7    │ is_deprecated = true    │ read-only (safety)    │ NO — domain flag  │
// │  8    │ ui_hint.readOnly /      │ ADVISORY ONLY —       │ n/a — never       │
// │       │ ui_hint.lockOnEdit      │ influences rendering, │ overrides domain  │
// │       │                         │ never overrides above │                   │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// KEY PRINCIPLE: ui_hint flags are RENDERING ADVISORIES. They affect how a field
// looks (greyed out, disabled attribute) but never override domain/security truth.
// If is_computed=true and ui_hint.readOnly=false, the field is still read-only.
//

// ============================================================================
// Context-Aware Visibility & Editability (FR-4)
// ============================================================================

/**
 * Visibility values per UI context.
 * - visible: shown to all users
 * - hidden: not rendered in that context
 * - internal: shown only to admins/internal workbench (policy-gated)
 */
export type FieldVisibilityValue = "visible" | "hidden" | "internal";

/**
 * Per-context visibility map. Contexts: create, view, edit.
 * If a context key is omitted, defaults to "visible".
 */
export type FieldVisibility = {
  create?: FieldVisibilityValue;
  view?: FieldVisibilityValue;
  edit?: FieldVisibilityValue;
};

/**
 * Overlay merge mode for visibility/editability policy.
 *
 * - "replace": Overlay completely replaces base values for specified contexts.
 *              Unspecified contexts inherit from base.
 * - "extend":  Overlay can only add restrictions — never relax.
 *              hidden > internal > visible (visibility restrictiveness order).
 *              computed > system_managed > read_only > editable (editability order).
 *              The more restrictive value wins.
 */
export type OverlayMode = "replace" | "extend";

/**
 * Visibility overlay — customer/tenant override with explicit merge strategy.
 *
 * Three-layer model:
 *   Layer 1: base standard (field.visibility on meta.field)
 *   Layer 2: customer overlay (field.visibilityOverlay on overlay change)
 *   Layer 3: runtime resolved (computed by resolveVisibilityWithOverlay)
 *
 * Example — extend mode (can only make MORE restrictive):
 *   base:    { create: "visible", view: "visible", edit: "visible" }
 *   overlay: { mode: "extend", rules: { create: "hidden", edit: "internal" } }
 *   result:  { create: "hidden",  view: "visible", edit: "internal" }
 *
 * Example — replace mode (full takeover of specified contexts):
 *   base:    { create: "hidden",  view: "visible", edit: "hidden" }
 *   overlay: { mode: "replace", rules: { create: "visible" } }
 *   result:  { create: "visible", view: "visible", edit: "hidden" }
 */
export type FieldVisibilityOverlay = {
  mode: OverlayMode;
  rules: FieldVisibility;
};

/**
 * Editability values per UI context.
 * - editable: user can input/change
 * - read_only: displayed but not editable
 * - system_managed: server owns value (UI shows but disables input)
 * - computed: derived — never editable
 */
export type FieldEditabilityValue = "editable" | "read_only" | "system_managed" | "computed";

/**
 * Per-context editability map. Contexts: create, edit.
 * If a context key is omitted, defaults to "editable".
 */
export type FieldEditability = {
  create?: FieldEditabilityValue;
  edit?: FieldEditabilityValue;
};

/**
 * Editability overlay — customer/tenant override with explicit merge strategy.
 *
 * Example — extend mode (can only make MORE restrictive):
 *   base:    { create: "editable", edit: "editable" }
 *   overlay: { mode: "extend", rules: { edit: "read_only" } }
 *   result:  { create: "editable", edit: "read_only" }
 *
 * Example — replace mode:
 *   base:    { create: "editable", edit: "system_managed" }
 *   overlay: { mode: "replace", rules: { edit: "editable" } }
 *   result:  { create: "editable", edit: "editable" }
 */
export type FieldEditabilityOverlay = {
  mode: OverlayMode;
  rules: FieldEditability;
};

// ── Restrictiveness ordinals (higher = more restrictive) ──

/** @internal Restrictiveness ranking for visibility values. */
export const VISIBILITY_RESTRICTIVENESS: Record<FieldVisibilityValue, number> = {
  visible: 0,
  internal: 1,
  hidden: 2,
};

/** @internal Restrictiveness ranking for editability values. */
export const EDITABILITY_RESTRICTIVENESS: Record<FieldEditabilityValue, number> = {
  editable: 0,
  read_only: 1,
  system_managed: 2,
  computed: 3,
};

/**
 * Resolve a visibility value with overlay, respecting the merge mode.
 *
 * - replace: overlay value wins for specified contexts, base for unspecified.
 * - extend:  more restrictive value wins (hidden > internal > visible).
 */
export function resolveVisibilityValue(
  base: FieldVisibilityValue,
  overlay: FieldVisibilityValue | undefined,
  mode: OverlayMode,
): FieldVisibilityValue {
  if (overlay == null) return base;
  if (mode === "replace") return overlay;
  // extend: pick most restrictive
  return VISIBILITY_RESTRICTIVENESS[overlay] >= VISIBILITY_RESTRICTIVENESS[base]
    ? overlay
    : base;
}

/**
 * Resolve an editability value with overlay, respecting the merge mode.
 *
 * - replace: overlay value wins for specified contexts, base for unspecified.
 * - extend:  more restrictive value wins (computed > system_managed > read_only > editable).
 */
export function resolveEditabilityValue(
  base: FieldEditabilityValue,
  overlay: FieldEditabilityValue | undefined,
  mode: OverlayMode,
): FieldEditabilityValue {
  if (overlay == null) return base;
  if (mode === "replace") return overlay;
  // extend: pick most restrictive
  return EDITABILITY_RESTRICTIVENESS[overlay] >= EDITABILITY_RESTRICTIVENESS[base]
    ? overlay
    : base;
}

/**
 * Merge base visibility with an overlay to produce fully resolved visibility.
 */
export function resolveVisibilityWithOverlay(
  base: FieldVisibility | undefined,
  overlay: FieldVisibilityOverlay | undefined,
): Required<FieldVisibility> {
  const defaults: Required<FieldVisibility> = { create: "visible", view: "visible", edit: "visible" };
  const effective: Required<FieldVisibility> = {
    create: base?.create ?? defaults.create,
    view: base?.view ?? defaults.view,
    edit: base?.edit ?? defaults.edit,
  };

  if (!overlay) return effective;

  return {
    create: resolveVisibilityValue(effective.create, overlay.rules.create, overlay.mode),
    view: resolveVisibilityValue(effective.view, overlay.rules.view, overlay.mode),
    edit: resolveVisibilityValue(effective.edit, overlay.rules.edit, overlay.mode),
  };
}

/**
 * Merge base editability with an overlay to produce fully resolved editability.
 */
export function resolveEditabilityWithOverlay(
  base: FieldEditability | undefined,
  overlay: FieldEditabilityOverlay | undefined,
): Required<FieldEditability> {
  const defaults: Required<FieldEditability> = { create: "editable", edit: "editable" };
  const effective: Required<FieldEditability> = {
    create: base?.create ?? defaults.create,
    edit: base?.edit ?? defaults.edit,
  };

  if (!overlay) return effective;

  return {
    create: resolveEditabilityValue(effective.create, overlay.rules.create, overlay.mode),
    edit: resolveEditabilityValue(effective.edit, overlay.rules.edit, overlay.mode),
  };
}

// ============================================================================
// Validation Overlay (customer override model)
// ============================================================================

/**
 * Validation rules overlay — customer/tenant override with explicit merge strategy.
 *
 * Three-layer model (same as visibility/editability):
 *   Layer 1: base standard (entity version's validation rules)
 *   Layer 2: customer overlay (validationOverlay on overlay change)
 *   Layer 3: runtime resolved (computed by resolveValidationWithOverlay)
 *
 * - replace: overlay's rules completely replace base rules for specified field paths.
 * - extend:  overlay's rules are ADDED to base rules. Duplicate rule IDs from
 *            overlay win (overlay rule replaces base rule with same ID).
 *            This allows customers to add stricter validations without losing base ones.
 *
 * Example — extend mode (add customer-specific validations on top of standard):
 *   base:    [{ id: "r1", kind: "required", fieldPath: "name" }]
 *   overlay: { mode: "extend", rules: [{ id: "r2", kind: "regex", fieldPath: "code", pattern: "^CUST-" }] }
 *   result:  [r1, r2]  // both rules active
 *
 * Example — replace mode (customer fully overrides validation for targeted fields):
 *   base:    [{ id: "r1", kind: "required", fieldPath: "name" }, { id: "r2", kind: "length", fieldPath: "code" }]
 *   overlay: { mode: "replace", rules: [{ id: "r3", kind: "length", fieldPath: "code", maxLength: 50 }] }
 *   result:  [r1, r3]  // r2 replaced by r3 (same fieldPath "code")
 */
export type ValidationOverlay = {
  mode: OverlayMode;
  rules: Array<{
    id: string;
    fieldPath: string;
    [key: string]: unknown;
  }>;
};

/**
 * Merge base validation rules with an overlay.
 *
 * - replace: removes all base rules for field paths covered by overlay,
 *            then inserts overlay rules. Base rules for other paths are kept.
 * - extend:  merges by rule ID — overlay rules with matching IDs replace base,
 *            overlay rules with new IDs are added.
 */
export function resolveValidationWithOverlay(
  baseRules: Array<{ id: string; fieldPath: string; [key: string]: unknown }>,
  overlay: ValidationOverlay | undefined,
): Array<{ id: string; fieldPath: string; [key: string]: unknown }> {
  if (!overlay || overlay.rules.length === 0) return baseRules;

  if (overlay.mode === "replace") {
    // Identify field paths covered by overlay
    const overlayPaths = new Set(overlay.rules.map(r => r.fieldPath));
    // Keep base rules for uncovered paths, add all overlay rules
    return [
      ...baseRules.filter(r => !overlayPaths.has(r.fieldPath)),
      ...overlay.rules,
    ];
  }

  // extend: merge by rule ID
  const merged = new Map<string, { id: string; fieldPath: string; [key: string]: unknown }>();
  for (const rule of baseRules) {
    merged.set(rule.id, rule);
  }
  for (const rule of overlay.rules) {
    merged.set(rule.id, rule); // overlay wins on ID collision
  }
  return [...merged.values()];
}

// ============================================================================
// Computed Field Wiring (FR-9) — Dependency Governance
// ============================================================================
//
// Expression Language Constraints:
// ┌──────────┬────────────────────────────────────────────────────────────────┐
// │ type     │ Semantics                                                      │
// ├──────────┼────────────────────────────────────────────────────────────────┤
// │ formula  │ Arithmetic over same-row fields. Only field refs (snake_case), │
// │          │ numeric literals, and operators (+, -, *, /). No function      │
// │          │ calls, no string ops, no conditionals. dependsOn must list     │
// │          │ every referenced field.                                        │
// │ aggregate│ Declarative aggregation over a child collection. expr is       │
// │          │ ignored — wiring is via aggregateOf + aggregateOp.             │
// │ system   │ Platform-provided named function from closed allowlist.        │
// │          │ expr must be a key in SYSTEM_COMPUTE_FUNCTIONS.                │
// └──────────┴────────────────────────────────────────────────────────────────┘
//
// Dependency Graph:
//   Compiler builds DAG from dependsOn → topological sort → rejects cycles.
//   Evaluation order stored on compiled model.
//
// Materialized Governance (computeMode = "materialized"):
//   recomputeTrigger: when to rewrite the stored value
//   stalePolicy: what to serve when dependencies changed before recompute
//   scheduleInterval: cron/interval for "scheduled" trigger
// ============================================================================

/**
 * Computed field mode.
 * - virtual: computed at read time (default)
 * - materialized: stored and recomputed on write/job
 */
export type ComputeMode = "virtual" | "materialized";

/**
 * Closed allowlist of platform-provided system compute functions.
 * For type="system", expr must be one of these values.
 */
export const SYSTEM_COMPUTE_FUNCTIONS = [
  "now",
  "current_user",
  "current_tenant",
  "row_version",
  "gen_random_uuid",
] as const;
export type SystemComputeFunction = (typeof SYSTEM_COMPUTE_FUNCTIONS)[number];

/**
 * When a materialized computed field should be recomputed.
 * - on_dependency_change: recompute when any dependsOn field is written (trigger/hook)
 * - on_save: recompute when the parent record is saved
 * - scheduled: recompute on a cron/interval schedule
 */
export type RecomputeTrigger = "on_dependency_change" | "on_save" | "scheduled";

/**
 * What to serve when a materialized value may be stale.
 * - serve_stale: return the cached value (eventual consistency)
 * - null_until_recomputed: return null until fresh value is computed
 * - recompute_sync: recompute within the same transaction (expensive)
 */
export type StalePolicy = "serve_stale" | "null_until_recomputed" | "recompute_sync";

/**
 * Regex for validating formula expressions.
 * Allows: field references (snake_case), numeric literals (int/decimal),
 * arithmetic operators (+, -, *, /), parentheses, and whitespace.
 * Rejects: function calls, string literals, comparisons, conditionals.
 */
export const FORMULA_EXPR_PATTERN = /^[a-z_][a-z0-9_]*(?:\s*[+\-*/]\s*(?:[a-z_][a-z0-9_]*|\d+(?:\.\d+)?))*$|^\(.*\)$/;

/**
 * Stricter tokenizer: extracts field references from a formula expression.
 * Returns all snake_case identifiers that are not numeric literals.
 */
export function extractFormulaFieldRefs(expr: string): string[] {
  const tokens = expr.match(/[a-z_][a-z0-9_]*/g) ?? [];
  return [...new Set(tokens)];
}

/**
 * Computed field expression definition.
 * References same-record fields, related collections, or system context.
 */
export type ComputeExpression = {
  /** Expression type */
  type: "formula" | "aggregate" | "system";
  /** Expression string or template (e.g., "quantity * unit_price") */
  expr: string;
  /** Fields this expression depends on (for reactivity/invalidation) */
  dependsOn?: string[];
  /** For aggregate type: child entity/collection field to aggregate */
  aggregateOf?: string;
  /** For aggregate type: aggregation operation */
  aggregateOp?: "count" | "sum" | "avg" | "min" | "max";
  /** For aggregate type: optional filter on child rows */
  aggregateFilter?: Record<string, unknown>;
  /** For materialized: when to rewrite the stored value */
  recomputeTrigger?: RecomputeTrigger;
  /** For materialized: what to serve when dependencies changed before recompute */
  stalePolicy?: StalePolicy;
  /** For scheduled trigger: cron expression or interval (e.g., "0 0 * * *", "1h") */
  scheduleInterval?: string;
};

// ============================================================================
// Collection (many) Field Wiring — Option B: Join Table (FR-3)
// ============================================================================

/**
 * Ownership mode for collection children.
 * - `owned`:  Child rows belong to this parent; lifecycle coupled (default).
 * - `linked`: Child rows are independent entities referenced via join; lifecycle decoupled.
 */
export type CollectionOwnership = "owned" | "linked";

/**
 * Persistence mode for collection rows.
 * - `inline`:        Child rows are created/updated/deleted inline with the parent form (default for owned).
 * - `reference_only`: Only FK links are managed; child records are managed independently (default for linked).
 */
export type CollectionPersistenceMode = "inline" | "reference_only";

/**
 * Delete behavior when a parent row is removed.
 * - `cascade`: Delete all child rows (default for owned).
 * - `restrict`: Prevent parent deletion while children exist.
 * - `detach`:  Null-out the FK on children, orphaning them (default for linked).
 */
export type CollectionDeleteMode = "cascade" | "restrict" | "detach";

/**
 * How aggregate values are kept in sync.
 * - `live`: Recomputed on every child change (reactive / trigger-based).
 * - `on_save`: Recomputed when the parent form is saved.
 * - `manual`: Only recomputed on explicit user action or scheduled job.
 */
export type CollectionAggregateStrategy = "live" | "on_save" | "manual";

/**
 * Row-level validation strategy for collection children.
 * - `on_change`: Validate each row immediately on field change (default).
 * - `on_save`: Validate all rows when the parent form is saved.
 * - `on_submit`: Validate only on final form submission (most lenient).
 */
export type CollectionRowValidation = "on_change" | "on_save" | "on_submit";

/**
 * Collection behavior configuration for cardinality=many fields.
 *
 * ┌──────────────────────┬──────────────────────────────────────────────────┐
 * │ Property             │ Purpose                                          │
 * ├──────────────────────┼──────────────────────────────────────────────────┤
 * │ ownership            │ owned (lifecycle coupled) / linked (decoupled)   │
 * │ persistenceMode      │ inline CRUD vs reference-only                    │
 * │ deleteMode           │ cascade / restrict / detach                      │
 * │ ordering             │ Enable row reordering                            │
 * │ orderField           │ Column for sort position                         │
 * │ editorStyle          │ grid / subform / tags                            │
 * │ minItems / maxItems  │ Cardinality bounds                               │
 * │ allowDuplicates      │ Permit duplicate child references (linked mode)  │
 * │ aggregates           │ Summary computations over children               │
 * │ aggregateStrategy    │ live / on_save / manual                          │
 * │ allowDraftRows       │ Permit unsaved rows in the editor                │
 * │ rowValidation        │ on_change / on_save / on_submit                  │
 * └──────────────────────┴──────────────────────────────────────────────────┘
 */
export type CollectionBehavior = {
  /** Ownership mode: owned (default) or linked */
  ownership?: CollectionOwnership;
  /** Persistence mode: inline (default for owned) or reference_only (default for linked) */
  persistenceMode?: CollectionPersistenceMode;
  /** Delete behavior: cascade (default for owned), restrict, or detach (default for linked) */
  deleteMode?: CollectionDeleteMode;
  /** Enable row ordering within the collection */
  ordering?: boolean;
  /** Field used for ordering (e.g., "sort_order", "line_number") */
  orderField?: string;
  /** UI editor style for the collection */
  editorStyle?: "grid" | "subform" | "tags";
  /** Minimum number of child rows */
  minItems?: number;
  /** Maximum number of child rows */
  maxItems?: number;
  /** Allow duplicate child references (only meaningful for linked mode) */
  allowDuplicates?: boolean;
  /** Aggregate definitions for list-page display */
  aggregates?: Array<{
    /** Child field to aggregate */
    field: string;
    /** Aggregation operation */
    op: "count" | "sum" | "avg" | "min" | "max";
    /** Label for the aggregate column */
    label?: string;
  }>;
  /** How aggregate values are kept in sync */
  aggregateStrategy?: CollectionAggregateStrategy;
  /** Allow unsaved/draft rows in the collection editor */
  allowDraftRows?: boolean;
  /** When to validate individual child rows */
  rowValidation?: CollectionRowValidation;
};

/**
 * Field definition in entity schema
 * Defines structure, validation rules, and UI hints for a single field
 */
export type FieldDefinition = {
  /** Field name (camelCase) */
  name: string;

  /** Field data type */
  type: FieldType;

  /** Whether field is required (non-nullable) */
  required: boolean;

  /** Human-readable label for UI */
  label?: string;

  /** Field description/help text */
  description?: string;

  // ===== Type-Specific Options =====

  // ===== Type-Specific Options (legacy — use structured configs below) =====

  /**
   * @deprecated Use `referenceConfig.entity` instead
   * For reference fields: target entity name
   */
  referenceTo?: string;

  /**
   * For reference fields: cascade rule when referenced record is deleted
   * - "CASCADE": Delete this record when referenced record is deleted
   * - "SET_NULL": Set this field to null when referenced record is deleted
   * - "RESTRICT": Prevent deletion of referenced record if this record exists
   * - undefined: No cascade (default) - orphaned references allowed
   */
  onDelete?: "CASCADE" | "SET_NULL" | "RESTRICT";

  /**
   * @deprecated Use `enumConfig.values` instead
   * For enum fields: allowed values
   */
  enumValues?: string[];

  // ===== Validation Rules (legacy — use `constraints` for new code) =====

  /** Min length for string fields */
  minLength?: number;

  /** Max length for string fields */
  maxLength?: number;

  /** Regex pattern for string validation */
  pattern?: string;

  /** Minimum value for number fields */
  min?: number;

  /** Maximum value for number fields */
  max?: number;

  /** Default value (JSON-serializable) */
  defaultValue?: unknown;

  // ===== UI Hints (legacy — use `ui` for new code) =====

  /**
   * @deprecated Use `ui.placeholder` instead
   */
  placeholder?: string;

  /**
   * @deprecated Use `ui.helpText` instead
   */
  helpText?: string;

  /** Whether field should be indexed in database */
  indexed?: boolean;

  /** Whether field is unique */
  unique?: boolean;

  // ===== New Structured Properties (Phase 1) =====

  /** Semantic format hint — drives UI specialization without changing data type */
  format?: SemanticFormat;

  /** Measurement unit (e.g., "kg", "hours", "meters") */
  unit?: string;

  /** Field-level multiplicity: data type is the element type, cardinality is the shape */
  cardinality?: "one" | "many";

  /** Field origin: system-managed (hidden in business forms) or business-defined */
  origin?: FieldOrigin;

  /** Canonical constraints — single source of truth for validation */
  constraints?: FieldConstraints;

  /** UI presentation overrides */
  ui?: FieldUiHint;

  /** Structured enum definition */
  enumConfig?: EnumConfig;

  /** Structured reference/FK configuration */
  referenceConfig?: ReferenceConfig;

  /** JSON field mode and schema */
  jsonConfig?: JsonFieldConfig;

  /** Money formatting, rounding, and currency strategy */
  moneyConfig?: MoneyConfig;

  /** Datetime timezone handling */
  datetimeConfig?: DatetimeConfig;

  /** Whether field is read-only */
  isReadOnly?: boolean;

  /** Whether field is deprecated (shown with warning, may be hidden) */
  isDeprecated?: boolean;

  /** Whether field is computed/derived (always read-only) */
  isComputed?: boolean;

  /** Whether field can only be set on creation (locked after first save) */
  writeOnce?: boolean;

  // ===== Context-Aware Visibility & Editability (FR-4) =====

  /** Per-context visibility (create/view/edit) — defaults to visible everywhere */
  visibility?: FieldVisibility;

  /** Per-context editability (create/edit) — defaults to editable */
  editability?: FieldEditability;

  // ===== List Page Capabilities (FR-8) =====

  /** Field participates in list-page sorting */
  isSortable?: boolean;

  /** Field participates in list-page grouping */
  isGroupable?: boolean;

  /** Field participates in list-page aggregation (count, sum, avg, etc.) */
  isAggregatable?: boolean;

  // ===== Computed Field Wiring (FR-9) =====

  /** Computed field mode: virtual (read-time) or materialized (stored) */
  computeMode?: ComputeMode;

  /** Computed field expression (references fields, collections, or system context) */
  computeExpr?: ComputeExpression;

  // ===== Collection (many) Field Wiring — Option B: Join Table (FR-3) =====

  /** For cardinality=many: logical child entity name */
  childEntityName?: string;

  /** For cardinality=many: parent FK field on child table */
  childFkField?: string;

  /** For cardinality=many: ordering, editor style, cascade rules, aggregates */
  collectionBehavior?: CollectionBehavior;

  // ===== Lookup System (044) =====

  /** Lookup profile for reference field typeahead search behavior */
  lookupProfile?: LookupProfile;
};

// ============================================================================
// Policy Definitions
// ============================================================================

/**
 * Policy effect: allow or deny
 */
export type PolicyEffect = "allow" | "deny";

/**
 * Policy action (CRUD operation)
 */
export type PolicyAction = "create" | "read" | "update" | "delete" | "*";

/**
 * Policy condition operators
 */
export type PolicyOperator =
  | "eq"          // Equal
  | "ne"          // Not equal
  | "in"          // In array
  | "not_in"      // Not in array
  | "gt"          // Greater than
  | "gte"         // Greater than or equal
  | "lt"          // Less than
  | "lte"         // Less than or equal
  | "contains"    // String contains
  | "starts_with" // String starts with
  | "ends_with";  // String ends with

/**
 * Policy condition
 * Evaluates to true/false based on context and record data
 */
export type PolicyCondition = {
  /** Field to check (e.g., "user.role", "record.userId") */
  field: string;

  /** Comparison operator */
  operator: PolicyOperator;

  /** Value to compare against */
  value: unknown;
};

/**
 * Policy definition
 * Defines access control rules for entities
 */
export type PolicyDefinition = {
  /** Policy name (unique within entity) */
  name: string;

  /** Policy effect (allow or deny) */
  effect: PolicyEffect;

  /** Action this policy applies to */
  action: PolicyAction;

  /** Resource (entity name) this policy applies to */
  resource: string;

  /** Conditions that must be met (AND logic) */
  conditions?: PolicyCondition[];

  /**
   * Field-level access control (optional)
   * If specified, this policy grants access only to these fields.
   * - ["*"] = all fields (default if not specified)
   * - ["field1", "field2"] = only these specific fields
   * - Applies to both read and write operations
   */
  fields?: string[];

  /** Policy description */
  description?: string;

  /** Policy priority (higher = evaluated first) */
  priority?: number;
};

// ============================================================================
// Entity Schema
// ============================================================================

/**
 * Complete entity schema definition
 * Defines structure, validation, and policies for an entity
 */
export type EntitySchema = {
  /** Entity fields */
  fields: FieldDefinition[];

  /** Access control policies */
  policies?: PolicyDefinition[];

  /** Schema metadata */
  metadata?: {
    /** Display label */
    label?: string;

    /** Entity description */
    description?: string;

    /** Icon identifier */
    icon?: string;

    /** Color for UI */
    color?: string;

    /** Tags for categorization */
    tags?: string[];

    /** Custom metadata (extensible) */
    [key: string]: unknown;
  };
};

// ============================================================================
// Compiled Model (Optimized IR)
// ============================================================================

/**
 * Compiled field definition
 * Optimized version of FieldDefinition for runtime use
 */
export type CompiledField = {
  /** Field name (camelCase, as in API) */
  name: string;

  /** Database column name (snake_case) */
  columnName: string;

  /** Field type */
  type: FieldType;

  /** Whether field is required */
  required: boolean;

  /** SELECT fragment: "column_name as fieldName" */
  selectAs: string;

  /** Validation function (optional, for runtime validation) */
  validator?: (value: unknown) => boolean;

  /** Transform function (DB → API format) */
  transformer?: (dbValue: unknown) => unknown;

  /** Indexed flag */
  indexed?: boolean;

  /** Unique flag */
  unique?: boolean;

  // ===== Validation Constraints (for runtime validation) =====

  /** For reference fields: target entity name */
  referenceTo?: string;

  /** For reference fields: cascade behavior on delete */
  onDelete?: "CASCADE" | "SET_NULL" | "RESTRICT";

  /** For enum fields: allowed values */
  enumValues?: string[];

  /** Min length for string fields */
  minLength?: number;

  /** Max length for string fields */
  maxLength?: number;

  /** Regex pattern for string validation */
  pattern?: string;

  /** Minimum value for number fields */
  min?: number;

  /** Maximum value for number fields */
  max?: number;
};

// ============================================================================
// Resolved Field Meta (Publish-time Compilation Contract — FR-13)
// ============================================================================

/**
 * Resolved per-field contract produced at publish time.
 * Runtime + UI must consume this (not raw meta tables) for performance and determinism.
 */
export type ResolvedFieldMeta = {
  /** Field name (logical identity, camelCase) */
  name: string;

  /** Physical DB column name (null for computed/virtual/collection) */
  columnName: string | null;

  /** Display label (resolved: explicit label > humanized name) */
  label: string;

  /** Help text / description */
  description?: string;

  // ===== Data Layer =====

  /** Canonical data type */
  dataType: FieldType;

  /** Semantic format hint */
  format?: SemanticFormat;

  /** Measurement unit */
  unit?: string;

  /** Field cardinality */
  cardinality: "one" | "many";

  /** Resolved constraints */
  constraints: FieldConstraints;

  /** Default value */
  defaultValue?: unknown;

  // ===== Resolved Renderer =====

  /** Resolved UI type (from ui_hint.type or auto-detected from dataType + format) */
  uiType: string;

  /** Resolved view-mode component */
  viewType?: string;

  /** Resolved edit-mode component */
  editType?: string;

  /** UI config (merged ui_hint) */
  uiConfig?: FieldUiHint;

  // ===== Effective Visibility & Editability per Context =====

  /** Effective visibility per context (create/view/edit) */
  visibility: Required<FieldVisibility>;

  /** Effective editability per context (create/edit) */
  editability: Required<FieldEditability>;

  // ===== Resolved Validation =====

  /** Resolved validation rules (merged constraints + validation jsonb) */
  validation?: Record<string, unknown>;

  // ===== Lookup / Reference Wiring =====

  /** Resolved lookup config (for reference/enum fields) */
  lookupConfig?: ReferenceConfig;

  /** Resolved lookup profile (for reference field typeahead search) */
  lookupProfile?: LookupProfile;

  /** Resolved enum config */
  enumConfig?: EnumConfig;

  // ===== Collection Wiring (for cardinality=many) =====

  /** Child entity name */
  childEntityName?: string;

  /** Parent FK field on child table */
  childFkField?: string;

  /** Collection behavior (ordering, editor, cascade, aggregates) */
  collectionBehavior?: CollectionBehavior;

  // ===== Computed Wiring =====

  /** Whether field is computed */
  isComputed: boolean;

  /** Computed mode (virtual/materialized) */
  computeMode?: ComputeMode;

  /** Computed expression */
  computeExpr?: ComputeExpression;

  // ===== List Page Capabilities =====

  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  isGroupable: boolean;
  isAggregatable: boolean;

  // ===== Behavior Flags =====

  isRequired: boolean;
  isUnique: boolean;
  isReadOnly: boolean;
  isDeprecated: boolean;
  writeOnce: boolean;
  isActive: boolean;

  /** Sort order for display */
  sortOrder: number;
};

/**
 * Compiled policy definition
 * Optimized version of PolicyDefinition for runtime evaluation
 */
export type CompiledPolicy = {
  /** Policy name */
  name: string;

  /** Policy effect */
  effect: PolicyEffect;

  /** Action */
  action: PolicyAction;

  /** Resource */
  resource: string;

  /** Field-level access control */
  fields?: string[];

  /** Compiled evaluator function */
  evaluate: (ctx: RequestContext, record?: unknown) => boolean;

  /** Policy priority */
  priority: number;

  /** Compiled at timestamp */
  compiledAt: Date;

  /** Schema hash (for cache invalidation) */
  hash: string;
};

/**
 * Compiled model IR (Intermediate Representation)
 * Optimized representation of entity schema for runtime queries
 */
export type CompiledModel = {
  /** Entity name */
  entityName: string;

  /** Schema version */
  version: string;

  /** Physical table name (e.g., "ent_invoice") */
  tableName: string;

  /** Compiled fields */
  fields: CompiledField[];

  /** Compiled policies */
  policies: CompiledPolicy[];

  // ===== Pre-built Query Fragments =====

  /** SELECT clause (all fields) */
  selectFragment: string;

  /** FROM clause with tenant filter */
  fromFragment: string;

  /** WHERE clause for tenant isolation */
  tenantFilterFragment: string;

  // ===== Metadata =====

  /** Database indexes */
  indexes: string[];

  /** Compilation timestamp */
  compiledAt: Date;

  /** Compiled by (user/service) */
  compiledBy: string;

  /** Schema hash (for cache invalidation) */
  hash: string;

  // ===== Compilation Identity (Phase 9.1) =====

  /** Input hash: stable hash of compilation inputs (entity + version + fields + policies + etc.) */
  inputHash?: string;

  /** Output hash: hash of the compiled JSON output */
  outputHash?: string;

  /** Compilation diagnostics */
  diagnostics?: CompileDiagnostic[];

  // ===== Entity Classification (Approvable Core Engine) =====

  /** Entity classification (MASTER/CONTROL/DOCUMENT) */
  entityClass?: EntityClass;

  /** Entity feature flags */
  featureFlags?: EntityFeatureFlags;
};

// ============================================================================
// Compiled Snapshot (Recommendation 17)
// ============================================================================
//
// The canonical immutable snapshot produced by the compiler. This is the
// single artifact that UI, runtime, and search consumers should read —
// never raw field rows.
//
// Snapshot guarantees:
//   - All defaults filled (visibility, editability, capabilities, configs)
//   - All legacy compatibility resolved (validation → constraints, uiType → uiHint)
//   - All overlay merges applied
//   - All provenance retained for debuggability
//   - All contradictions diagnosed
//   - Stable content hash for cache invalidation
//

/**
 * Immutable compiled metadata snapshot for an entity version.
 *
 * This is the boundary between meta-authoring and meta-consuming.
 * All consumers (UI, runtime, search, DDL generators) should consume
 * this snapshot rather than raw DB rows.
 */
export type CompiledSnapshot = {
  /** Entity name (slug) */
  entityName: string;

  /** Published version identifier */
  version: string;

  /** Physical DB table name */
  tableName: string;

  /** Physical DB schema */
  tableSchema: string;

  /** Fully resolved field metadata — all defaults filled, all overlays applied */
  resolvedFields: ResolvedFieldMeta[];

  /** SQL-optimized compiled fields (for query building) */
  compiledFields: CompiledField[];

  /** Compiled policies */
  policies: CompiledPolicy[];

  /** Pre-built SQL query fragments */
  queryFragments: {
    selectFragment: string;
    fromFragment: string;
    tenantFilterFragment: string;
  };

  /** Entity classification */
  entityClass?: EntityClass;

  /** Entity feature flags */
  featureFlags?: EntityFeatureFlags;

  /** Compilation diagnostics (retained for observability) */
  diagnostics: CompileDiagnostic[];

  /** Stable content hash — changes when any input changes */
  contentHash: string;

  /** Input hash of raw compilation inputs */
  inputHash: string;

  /** Compilation timestamp (ISO 8601) */
  compiledAt: string;

  /** Who/what compiled this snapshot */
  compiledBy: string;
};

// ============================================================================
// Compilation Diagnostics (Phase 9.2)
// ============================================================================

/**
 * Compilation diagnostic severity levels
 */
export type DiagnosticSeverity = "ERROR" | "WARN" | "INFO";

/**
 * Compilation diagnostic
 * Similar to TypeScript compiler diagnostics
 */
export type CompileDiagnostic = {
  /** Severity level */
  severity: DiagnosticSeverity;

  /** Diagnostic code (e.g., "missing_mapping", "no_index") */
  code: string;

  /** Human-readable message */
  message: string;

  /** Field or element that triggered the diagnostic */
  field?: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

/**
 * Compilation result with diagnostics
 */
export type CompilationResult = {
  /** Compiled model */
  model: CompiledModel;

  /** Diagnostics collected during compilation */
  diagnostics: CompileDiagnostic[];

  /** Whether compilation succeeded (no ERROR diagnostics) */
  success: boolean;

  /** Input hash for cache key */
  inputHash: string;

  /** Output hash for versioning */
  outputHash: string;

  /** Compilation duration in milliseconds */
  durationMs: number;
};

// ============================================================================
// Request Context
// ============================================================================

/**
 * Request context for tenant isolation and access control
 * Passed to all META Engine operations
 */
export type RequestContext = {
  /** User ID */
  userId: string;

  /** Tenant ID */
  tenantId: string;

  /** Realm ID */
  realmId: string;

  /** User roles */
  roles: string[];

  /** Organization key (optional) */
  orgKey?: string;

  /** Request ID (for tracing) */
  requestId?: string;

  /** Additional context data */
  metadata?: Record<string, unknown>;
};

// ============================================================================
// Audit Events
// ============================================================================

/**
 * Audit event types
 */
export type AuditEventType =
  // Meta entity operations
  | "meta.entity.create"
  | "meta.entity.update"
  | "meta.entity.delete"

  // Meta version operations
  | "meta.version.create"
  | "meta.version.activate"
  | "meta.version.deactivate"

  // Meta field operations
  | "meta.field.add"
  | "meta.field.update"
  | "meta.field.remove"

  // Meta compilation
  | "meta.compile"
  | "meta.compile.error"

  // Policy operations
  | "policy.create"
  | "policy.update"
  | "policy.delete"
  | "policy.evaluate"
  | "policy.allow"
  | "policy.deny"

  // Overlay operations
  | "meta.overlay.create"
  | "meta.overlay.update"
  | "meta.overlay.delete"
  | "meta.overlay.addChange"
  | "meta.overlay.removeChange"
  | "meta.overlay.reorderChanges"

  // Data access operations
  | "data.read"
  | "data.create"
  | "data.update"
  | "data.delete"
  | "data.read.denied"
  | "data.create.denied"
  | "data.update.denied"
  | "data.delete.denied";

/**
 * Audit event
 * Records metadata changes and policy decisions
 */
export type AuditEvent = {
  /** Unique event ID */
  eventId: string;

  /** Event type */
  eventType: AuditEventType;

  /** Event timestamp */
  timestamp: Date;

  // ===== Actor =====

  /** User who triggered the event */
  userId: string;

  /** Tenant context */
  tenantId: string;

  /** Realm context */
  realmId: string;

  // ===== Context =====

  /** Action performed (e.g., "meta.entity.create") */
  action: string;

  /** Resource affected (e.g., entity name) */
  resource: string;

  /** Additional event details (JSON) */
  details?: Record<string, unknown>;

  // ===== Result =====

  /** Event result (success or failure) */
  result: "success" | "failure";

  /** Error message (if failed) */
  errorMessage?: string;
};

// ============================================================================
// Query Options
// ============================================================================

/**
 * List query options
 */
export type ListOptions = {
  /** Page number (1-indexed) */
  page?: number;

  /** Page size (default: 20, max: 100) */
  pageSize?: number;

  /** Sort field */
  orderBy?: string;

  /** Sort direction */
  orderDir?: "asc" | "desc";

  /** Filters (field → value map) */
  filters?: Record<string, unknown>;

  /** Include soft-deleted records */
  includeDeleted?: boolean;

  /** Limit (cursor-based pagination) */
  limit?: number;

  /** Offset (cursor-based pagination) */
  offset?: number;
};

/**
 * Paginated response
 */
export type PaginatedResponse<T> = {
  /** Data records */
  data: T[];

  /** Pagination metadata */
  meta: {
    /** Current page */
    page: number;

    /** Page size */
    pageSize: number;

    /** Total record count */
    total: number;

    /** Total page count */
    totalPages: number;

    /** Has next page */
    hasNext: boolean;

    /** Has previous page */
    hasPrev: boolean;
  };
};

// ============================================================================
// Entity and Version Models (matching Prisma schema)
// ============================================================================

/**
 * Entity record
 * Represents a top-level entity definition (Invoice, Order, etc.)
 */
export type Entity = {
  /** Entity ID */
  id: string;

  /** Entity name (unique) */
  name: string;

  /** Entity description */
  description?: string;

  /** Active version identifier (e.g., "v1") */
  activeVersion?: string;

  /** Entity kind (ref, ent, doc, fin, cfg, int) */
  kind?: string;

  /** Module ID */
  moduleId?: string | null;

  /** Physical table schema (e.g. "ref", "ent", "doc") */
  tableSchema?: string;

  /** Physical table name */
  tableName?: string;

  /** Whether entity is active */
  isActive?: boolean;

  /** Governance level (full, light, audit_only) */
  governanceLevel?: string;

  /** Engine tag for grouping (e.g. "posting-engine") */
  engineTag?: string | null;

  /** Current/latest version summary (populated by list queries) */
  currentVersion?: EntityVersionSummary | null;

  /** Number of fields in current version (populated by list queries) */
  fieldCount?: number;

  /** Number of relations in current version (populated by list queries) */
  relationCount?: number;

  /** Created at timestamp */
  createdAt: Date;

  /** Updated at timestamp */
  updatedAt: Date;

  /** Created by user */
  createdBy: string;
};

/**
 * Lightweight version summary for embedding in entity list responses
 */
export type EntityVersionSummary = {
  id: string;
  versionNo: number;
  status: string;
  label: string | null;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
};

/**
 * Entity version record
 * Represents a specific version of an entity schema
 */
export type EntityVersion = {
  /** Version ID */
  id: string;

  /** Entity name */
  entityName: string;

  /** Version identifier (e.g., "v1", "v2") */
  version: string;

  /** Entity schema (JSON) */
  schema: EntitySchema;

  /** Whether this version is active */
  isActive: boolean;

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;
};

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Validation result for schema validation
 */
export type ValidationResult = {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors (if any) */
  errors?: ValidationError[];
};

/**
 * Validation error
 */
export type ValidationError = {
  /** Field path (dot-separated) */
  field: string;

  /** Error message */
  message: string;

  /** Error code */
  code: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

// ============================================================================
// Health Check
// ============================================================================

/**
 * Health check result
 */
export type HealthCheckResult = {
  /** Whether service is healthy */
  healthy: boolean;

  /** Service name */
  name?: string;

  /** Status message */
  message?: string;

  /** Error message */
  error?: string;

  /** Additional details */
  details?: Record<string, unknown>;
};

// ============================================================================
// Overlay System (Phase 10)
// ============================================================================

/**
 * Overlay change kind
 * Defines the type of modification an overlay change applies
 */
export type OverlayChangeKind =
  | "addField"          // Add a new field to entity
  | "modifyField"       // Modify existing field properties
  | "removeField"       // Remove a field from entity
  | "tweakPolicy"       // Modify policy configuration
  | "addIndex"          // Add database index (future)
  | "removeIndex"       // Remove database index (future)
  | "tweakRelation";    // Modify relationship (future)

/**
 * Overlay conflict resolution mode
 * Defines how to handle conflicts when applying overlays
 */
export type OverlayConflictMode =
  | "fail"      // Throw error if target already exists/conflicts
  | "overwrite" // Replace existing target completely
  | "merge";    // Deep merge with existing target (for objects)

/**
 * Overlay change definition
 * Single atomic change within an overlay
 */
export type OverlayChange = {
  /** Unique change ID */
  id: string;

  /** Overlay ID this change belongs to */
  overlayId: string;

  /** Target entity version ID */
  targetEntityVersionId: string;

  /** Type of change */
  changeKind: OverlayChangeKind;

  /** Change payload (JSON) - structure depends on changeKind */
  changeJson: Record<string, unknown>;

  /** Sort order (changes applied in ascending order) */
  sortOrder: number;

  /** Conflict resolution mode */
  conflictMode: OverlayConflictMode;

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;
};

/**
 * Overlay container
 * Groups related changes that should be applied together
 */
export type Overlay = {
  /** Unique overlay ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Overlay name */
  name: string;

  /** Overlay description */
  description?: string;

  /** Overlay status */
  status: "draft" | "published" | "archived";

  /** Changes in this overlay */
  changes?: OverlayChange[];

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;

  /** Updated at timestamp */
  updatedAt?: Date;

  /** Updated by user */
  updatedBy?: string;
};

/**
 * Overlay set for compilation
 * Ordered list of overlay IDs to apply during compilation
 * Only published overlays are included
 */
export type OverlaySet = string[]; // Array of overlay IDs in application order

/**
 * Compiled model with overlays
 * Result of compiling base entity version + overlay set
 */
export type CompiledModelWithOverlays = {
  /** Base compiled model */
  model: CompiledModel;

  /** Overlay set that was applied */
  overlaySet: OverlaySet;

  /** Unique hash of compiled result with overlays */
  compiledHash: string;

  /** Entity version ID */
  entityVersionId: string;

  /** Generated at timestamp */
  generatedAt: Date;
};

// ============================================================================
// Policy Engine (Phase 11)
// ============================================================================

/**
 * Policy rule scope type
 * Defines the level at which a rule applies
 */
export type PolicyRuleScopeType =
  | "global"           // Applies to all resources
  | "module"           // Applies to a specific module
  | "entity"           // Applies to a specific entity type
  | "entity_version"   // Applies to a specific entity version
  | "record";          // Applies to specific records

/**
 * Policy rule subject type
 * Defines who the rule applies to
 */
export type PolicyRuleSubjectType =
  | "kc_role"    // Keycloak role
  | "kc_group"   // Keycloak group
  | "user"       // Specific user
  | "service";   // Service account

/**
 * Policy condition type
 * Different types of conditions that can be evaluated
 */
export type PolicyConditionType =
  | "ou_check"            // Organizational unit check
  | "numeric_threshold"   // Numeric comparison (e.g., amount < 1000)
  | "attribute_match"     // Principal attribute match
  | "record_field"        // Record field check
  | "expression";         // Custom expression (future)

/**
 * OU (Organizational Unit) check mode
 */
export type OUCheckMode =
  | "single"    // Must be exactly this OU
  | "subtree"   // This OU or any descendant
  | "multi";    // Any of the specified OUs

/**
 * Policy condition definition
 * JSON-defined conditions that are normalized at compile time
 */
export type PolicyConditionDefinition = {
  /** Condition type */
  type: PolicyConditionType;

  /** Condition configuration (varies by type) */
  config: Record<string, unknown>;

  /** Optional description */
  description?: string;
};

/**
 * Compiled policy condition
 * Normalized and optimized for fast evaluation
 */
export type CompiledPolicyCondition = {
  /** Condition type */
  type: PolicyConditionType;

  /** Compiled evaluator function */
  evaluate: (ctx: RequestContext, record?: unknown) => boolean;

  /** Original configuration (for debugging) */
  originalConfig: Record<string, unknown>;
};

/**
 * Policy rule definition
 * Single rule within a policy
 */
export type PolicyRuleDefinition = {
  /** Rule ID */
  id: string;

  /** Policy version ID */
  policyVersionId: string;

  /** Scope */
  scopeType: PolicyRuleScopeType;
  scopeKey?: string;

  /** Subject (who the rule applies to) */
  subjectType: PolicyRuleSubjectType;
  subjectKey: string;

  /** Effect */
  effect: "allow" | "deny";

  /** Conditions */
  conditions?: PolicyConditionDefinition[];

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Operations this rule grants/denies */
  operations: string[]; // Array of operation codes

  /** Optional comment */
  comment?: string;

  /** Active flag */
  isActive: boolean;
};

/**
 * Compiled policy rule
 * Optimized for fast evaluation
 */
export type CompiledPolicyRule = {
  /** Rule ID */
  id: string;

  /** Policy version ID */
  policyVersionId: string;

  /** Scope */
  scopeType: PolicyRuleScopeType;
  scopeKey?: string;

  /** Subject */
  subjectType: PolicyRuleSubjectType;
  subjectKey: string;

  /** Effect */
  effect: "allow" | "deny";

  /** Compiled conditions */
  conditions: CompiledPolicyCondition[];

  /** Priority */
  priority: number;

  /** Operations */
  operations: Set<string>; // Set for O(1) lookup

  /** Comment */
  comment?: string;
};

/**
 * Indexed policy structure
 * Organized for O(1) rule lookup by scope, operation, and subject
 */
export type IndexedPolicy = {
  /** Index by scope type + scope key */
  byScopeIndex: Map<string, CompiledPolicyRule[]>;

  /** Index by operation code */
  byOperationIndex: Map<string, CompiledPolicyRule[]>;

  /** Index by subject type + subject key */
  bySubjectIndex: Map<string, CompiledPolicyRule[]>;

  /** All rules sorted by priority (highest first) */
  allRulesByPriority: CompiledPolicyRule[];

  /** Compiled at timestamp */
  compiledAt: Date;

  /** Compiled hash (for cache invalidation) */
  compiledHash: string;
};

/**
 * Policy decision result
 * Includes decision and explanation for auditability
 */
export type PolicyDecision = {
  /** Whether action is allowed */
  allowed: boolean;

  /** Effect that determined the decision (allow/deny) */
  effect: "allow" | "deny";

  /** Rule ID that matched (if any) */
  matchedRuleId?: string;

  /** Policy version ID */
  matchedPolicyVersionId?: string;

  /** Human-readable reason */
  reason: string;

  /** All rules that were evaluated */
  evaluatedRules: Array<{
    ruleId: string;
    effect: "allow" | "deny";
    matched: boolean;
    reason?: string;
  }>;

  /** Decision timestamp */
  timestamp: Date;
};

/**
 * Permission decision log entry
 * Stored in core.permission_decision_log
 */
export type PermissionDecisionLog = {
  /** Log entry ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Timestamp */
  occurredAt: Date;

  /** Actor (user making the request) */
  actorPrincipalId?: string;
  subjectSnapshot?: Record<string, unknown>; // Roles/groups/scopes

  /** Resource being accessed */
  entityName?: string;
  entityId?: string;
  entityVersionId?: string;

  /** Operation being performed */
  operationCode: string;

  /** Decision */
  effect: "allow" | "deny";

  /** Matched rule */
  matchedRuleId?: string;
  matchedPolicyVersionId?: string;

  /** Reason */
  reason?: string;

  /** Request correlation ID */
  correlationId?: string;
};

// ============================================================================
// Phase 12: Workflow Runtime — Lifecycles
// ============================================================================

/**
 * Lifecycle Definition
 *
 * Represents a state machine for entity lifecycle management.
 * Example: Draft → Pending → Approved → Published
 */
export type Lifecycle = {
  /** Unique lifecycle ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Lifecycle code (stable identifier) */
  code: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Version number */
  versionNo: number;

  /** Active status */
  isActive: boolean;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle State
 *
 * Represents a state within a lifecycle (e.g., DRAFT, PENDING, APPROVED).
 */
export type LifecycleState = {
  /** Unique state ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent lifecycle ID */
  lifecycleId: string;

  /** State code (DRAFT/PENDING/APPROVED/etc.) */
  code: string;

  /** Display name */
  name: string;

  /** Terminal state (no further transitions allowed) */
  isTerminal: boolean;

  /** Sort order for UI display */
  sortOrder: number;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Transition
 *
 * Represents an allowed state transition with an operation code.
 * Example: DRAFT → PENDING via SUBMIT operation
 */
export type LifecycleTransition = {
  /** Unique transition ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent lifecycle ID */
  lifecycleId: string;

  /** Source state ID */
  fromStateId: string;

  /** Target state ID */
  toStateId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/CANCEL/etc.) */
  operationCode: string;

  /** Active status */
  isActive: boolean;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Transition Gate
 *
 * Represents authorization and approval requirements for a transition.
 * Gates must pass before transition is allowed.
 */
export type LifecycleTransitionGate = {
  /** Unique gate ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent transition ID */
  transitionId: string;

  /** Required permission operation codes */
  requiredOperations?: string[];

  /** Approval template ID (if approval required) */
  approvalTemplateId?: string;

  /** Condition rules (JSON) */
  conditions?: Record<string, unknown>;

  /** Threshold rules (e.g., amount limits) */
  thresholdRules?: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template
 *
 * Defines a multi-stage approval workflow.
 */
export type ApprovalTemplate = {
  /** Unique template ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Template code (stable identifier) */
  code: string;

  /** Display name */
  name: string;

  /** Behaviors (JSON) */
  behaviors?: Record<string, unknown>;

  /** Escalation style */
  escalationStyle?: string;

  /** Version number (1-indexed) */
  versionNo: number;

  /** Is this the active version? */
  isActive: boolean;

  /** Compiled template artifact (JSON) */
  compiledJson?: Record<string, unknown>;

  /** SHA-256 hash of compiled artifact */
  compiledHash?: string;

  /** Last updated timestamp */
  updatedAt?: Date;

  /** User who last updated */
  updatedBy?: string;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template Stage
 *
 * Represents a stage in a multi-stage approval workflow.
 */
export type ApprovalTemplateStage = {
  /** Unique stage ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent template ID */
  approvalTemplateId: string;

  /** Stage number (1-indexed) */
  stageNo: number;

  /** Display name */
  name?: string;

  /** Execution mode */
  mode: "serial" | "parallel";

  /** Quorum rules (JSON) */
  quorum?: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template Rule
 *
 * Defines how to assign approvers based on conditions.
 */
export type ApprovalTemplateRule = {
  /** Unique rule ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent template ID */
  approvalTemplateId: string;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Condition rules (OU/amount/etc.) */
  conditions: Record<string, unknown>;

  /** Assignment mapping (role/group/principal) */
  assignTo: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

// ============================================================================
// Phase 12.1: Entity Lifecycle Routing
// ============================================================================

/**
 * Entity Lifecycle
 *
 * Maps an entity to a lifecycle with optional conditions and priority.
 * Used by the lifecycle route compiler to resolve which lifecycle applies.
 */
export type EntityLifecycle = {
  /** Unique mapping ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name (e.g., "PurchaseOrder") */
  entityName: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** Condition rules (JSON) */
  conditions?: Record<string, unknown>;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Compiled Lifecycle Route
 *
 * Result of lifecycle route compilation for an entity.
 * Contains indexed structure for fast runtime resolution.
 */
export type CompiledLifecycleRoute = {
  /** Entity name */
  entityName: string;

  /** Ordered list of lifecycle rules by priority */
  rules: Array<{
    lifecycleId: string;
    conditions?: Record<string, unknown>;
    priority: number;
  }>;

  /** Default lifecycle (if no conditions match) */
  defaultLifecycleId?: string;

  /** Compilation metadata */
  compiledHash: string;
  generatedAt: Date;
};

/**
 * Entity Lifecycle Route Compiled (Database Record)
 *
 * Stored compiled lifecycle route for fast runtime lookup.
 */
export type EntityLifecycleRouteCompiled = {
  /** Unique record ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Compiled route (JSON) */
  compiledJson: CompiledLifecycleRoute;

  /** Compiled hash (for caching) */
  compiledHash: string;

  /** Generation timestamp */
  generatedAt: Date;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

// ============================================================================
// Phase 12.2: Lifecycle Runtime Instances
// ============================================================================

/**
 * Entity Lifecycle Instance
 *
 * Tracks the current lifecycle state for an entity record.
 * One instance per entity record.
 */
export type EntityLifecycleInstance = {
  /** Unique instance ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Current lifecycle ID */
  lifecycleId: string;

  /** Current state ID */
  stateId: string;

  /** Last update timestamp */
  updatedAt: Date;

  /** Last update actor */
  updatedBy: string;
};

/**
 * Entity Lifecycle Event
 *
 * Audit trail for lifecycle state transitions.
 * Append-only log of all transitions.
 */
export type EntityLifecycleEvent = {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** Previous state ID (null for initial state) */
  fromStateId?: string;

  /** New state ID */
  toStateId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/etc.) */
  operationCode: string;

  /** Event timestamp */
  occurredAt: Date;

  /** Actor (user who initiated transition) */
  actorId?: string;

  /** Additional payload data */
  payload?: Record<string, unknown>;

  /** Request correlation ID */
  correlationId?: string;
};

/**
 * Lifecycle Transition Request
 *
 * Request to transition an entity to a new state.
 */
export type LifecycleTransitionRequest = {
  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/etc.) */
  operationCode: string;

  /** Additional payload data */
  payload?: Record<string, unknown>;

  /** Request context */
  ctx: RequestContext;
};

/**
 * Lifecycle Transition Result
 *
 * Result of a lifecycle transition attempt.
 */
export type LifecycleTransitionResult = {
  /** Success flag */
  success: boolean;

  /** New state ID (if successful) */
  newStateId?: string;

  /** New state code */
  newStateCode?: string;

  /** Error message (if failed) */
  error?: string;

  /** Reason for failure */
  reason?: string;

  /** Lifecycle event ID (if successful) */
  eventId?: string;
};

// ============================================================================
// Lifecycle Timer Types (Auto-Transitions)
// ============================================================================

/**
 * Lifecycle Timer Type
 *
 * Type of automated lifecycle timer action.
 */
export type LifecycleTimerType =
  | "auto_close"        // Automatically close/complete entity after period
  | "auto_cancel"       // Automatically cancel entity after period
  | "reminder"          // Send reminder notification
  | "auto_transition";  // Generic auto-transition to target state

/**
 * Lifecycle Timer Policy
 *
 * Defines timer rules for automatic state transitions.
 * Stored in meta.lifecycle_timer_policy table.
 */
export type LifecycleTimerPolicy = {
  /** Unique policy ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Policy code (unique within tenant) */
  code: string;

  /** Human-readable policy name */
  name: string;

  /** Timer rules configuration */
  rules: LifecycleTimerRules;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Timer Rules
 *
 * Configuration for timer scheduling and execution.
 */
export type LifecycleTimerRules = {
  /** Type of timer */
  timerType: LifecycleTimerType;

  /** Trigger conditions - state codes that trigger this timer */
  triggerOnStateEntry?: string[];

  /** Trigger conditions - transition operation codes that trigger this timer */
  triggerOnTransition?: string[];

  /** Delay calculation type */
  delayType: "fixed" | "field_relative" | "sla";

  /** Fixed delay in milliseconds (for delayType: "fixed") */
  delayMs?: number;

  /** Field to calculate delay from (for delayType: "field_relative") */
  delayFromField?: string;

  /** Offset to add/subtract from field value in ms (for delayType: "field_relative") */
  delayOffsetMs?: number;

  /** Target transition ID to execute when timer fires */
  targetTransitionId?: string;

  /** Target operation code to execute (alternative to transition ID) */
  targetOperationCode?: string;

  /** Conditions that must be met when timer fires (evaluated at fire time) */
  conditions?: ConditionGroup;

  /** Cancel timer if entity transitions to any state */
  cancelOnAnyTransition?: boolean;

  /** Cancel timer if entity enters these states */
  cancelOnStates?: string[];
};

/**
 * Lifecycle Timer Schedule
 *
 * Represents an active scheduled timer for an entity instance.
 * Stored in core.lifecycle_timer_schedule table.
 */
export type LifecycleTimerSchedule = {
  /** Unique schedule ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** State ID when timer was scheduled */
  stateId: string;

  /** Timer type */
  timerType: LifecycleTimerType;

  /** Transition ID to execute (optional) */
  transitionId?: string;

  /** When timer was scheduled */
  scheduledAt: Date;

  /** When timer should fire */
  fireAt: Date;

  /** BullMQ job ID (for cancellation) */
  jobId: string;

  /** Policy ID that created this timer (optional - may be null if policy deleted) */
  policyId?: string;

  /** Immutable snapshot of policy rules at scheduling time */
  policySnapshot: LifecycleTimerRules;

  /** Timer status */
  status: "scheduled" | "fired" | "canceled";

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Timer Payload
 *
 * BullMQ job payload for timer execution.
 */
export type LifecycleTimerPayload = {
  /** Schedule ID */
  scheduleId: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Timer type */
  timerType: LifecycleTimerType;

  /** Policy snapshot */
  policySnapshot: LifecycleTimerRules;
};

// ============================================================================
// Phase 13: Approval Runtime (Multi-Stage Approvals with BullMQ)
// ============================================================================

/**
 * Approval Instance
 *
 * Represents an approval workflow instance for a lifecycle transition.
 * Tracks overall approval status and links to entity and transition.
 */
export type ApprovalInstance = {
  /** Unique instance ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Transition ID that triggered this approval */
  transitionId?: string;

  /** Approval template ID */
  approvalTemplateId?: string;

  /** Overall status (uses spec-locked union; "rejected" maps from DB "canceled" + reason) */
  status: ApprovalInstanceStatus;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Stage
 *
 * Represents a stage in a multi-stage approval workflow.
 * Stages can be serial (one at a time) or parallel (all at once).
 */
export type ApprovalStage = {
  /** Unique stage ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent approval instance ID */
  approvalInstanceId: string;

  /** Stage number (1-indexed) */
  stageNo: number;

  /** Execution mode */
  mode: "serial" | "parallel";

  /** Stage status */
  status: "open" | "completed" | "canceled";

  /** Audit fields */
  createdAt: Date;
};

/**
 * Approval Task
 *
 * Represents an individual approval task assigned to a principal or group.
 */
export type ApprovalTask = {
  /** Unique task ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent approval instance ID */
  approvalInstanceId: string;

  /** Parent approval stage ID */
  approvalStageId: string;

  /** Assignee principal ID (if assigned to user) */
  assigneePrincipalId?: string;

  /** Assignee group ID (if assigned to group) */
  assigneeGroupId?: string;

  /** Task type */
  taskType: "approver" | "reviewer" | "watcher";

  /** Task status */
  status: "pending" | "approved" | "rejected" | "canceled" | "expired";

  /** Due date */
  dueAt?: Date;

  /** Decision timestamp */
  decidedAt?: Date;

  /** Decision made by */
  decidedBy?: string;

  /** Decision note */
  decisionNote?: string;

  /** Audit fields */
  createdAt: Date;
};

/**
 * Approval Assignment Snapshot
 *
 * Captures the resolved assignment details when task is created.
 * Immutable record of why/how the task was assigned.
 */
export type ApprovalAssignmentSnapshot = {
  /** Unique snapshot ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval task ID */
  approvalTaskId: string;

  /** Resolved assignment details (JSON) */
  resolvedAssignment: Record<string, unknown>;

  /** Rule ID that matched */
  resolvedFromRuleId?: string;

  /** Template version used */
  resolvedFromVersionId?: string;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Escalation
 *
 * Tracks escalation events (reminders, escalations, reassignments).
 */
export type ApprovalEscalation = {
  /** Unique escalation ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  approvalInstanceId: string;

  /** Escalation kind */
  kind: "reminder" | "escalation" | "reassign";

  /** Escalation payload (JSON) */
  payload?: Record<string, unknown>;

  /** Occurred timestamp */
  occurredAt: Date;
};

/**
 * Approval Event
 *
 * Audit trail for approval-related events.
 */
export type ApprovalEvent = {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  approvalInstanceId?: string;

  /** Approval task ID */
  approvalTaskId?: string;

  /** Event type */
  eventType: string;

  /** Event payload (JSON) */
  payload?: Record<string, unknown>;

  /** Occurred timestamp */
  occurredAt: Date;

  /** Actor ID */
  actorId?: string;

  /** Correlation ID */
  correlationId?: string;
};

/**
 * Approval Decision Request
 *
 * Request to make an approval decision on a task.
 */
export type ApprovalDecisionRequest = {
  /** Approval task ID */
  taskId: string;

  /** Decision (approve or reject) */
  decision: "approve" | "reject";

  /** Optional decision note */
  note?: string;

  /** Request context */
  ctx: RequestContext;
};

/**
 * Approval Decision Result
 *
 * Result of an approval decision.
 */
export type ApprovalDecisionResult = {
  /** Success flag */
  success: boolean;

  /** Task ID */
  taskId: string;

  /** New task status */
  taskStatus?: string;

  /** Stage status (if stage completed) */
  stageStatus?: string;

  /** Instance status (if instance completed) — uses finalized spec union */
  instanceStatus?: ApprovalInstanceStatus;

  /** Whether lifecycle transition was triggered */
  transitionTriggered?: boolean;

  /** Error message (if failed) */
  error?: string;

  /** Reason */
  reason?: string;
};

/**
 * Approval Creation Request
 *
 * Request to create an approval instance for a lifecycle transition.
 */
export type ApprovalCreationRequest = {
  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Transition ID */
  transitionId: string;

  /** Approval template ID */
  approvalTemplateId: string;

  /** Request context */
  ctx: RequestContext;

  /** Additional context for assignment resolution */
  assignmentContext?: Record<string, unknown>;
};

/**
 * Approval Creation Result
 *
 * Result of creating an approval instance.
 */
export type ApprovalCreationResult = {
  /** Success flag */
  success: boolean;

  /** Approval instance ID */
  instanceId?: string;

  /** Number of stages created */
  stageCount?: number;

  /** Number of tasks created */
  taskCount?: number;

  /** Error message (if failed) */
  error?: string;
};

// ============================================================================
// Approvable Core Engine — Entity Classification
// ============================================================================

/**
 * Entity classification determines system header columns and behaviors.
 * Maps to meta.entity.kind in DB: ref/mdm -> MASTER, ent -> CONTROL, doc -> DOCUMENT
 */
export type EntityClass = "MASTER" | "CONTROL" | "DOCUMENT";

/**
 * Feature flags resolved per entity classification and metadata config.
 * Stored in meta.entity.feature_flags JSONB column.
 */
export type EntityFeatureFlags = {
  /** Entity class (resolved from meta.entity.kind) */
  entity_class?: EntityClass;

  /** Whether approval workflow is required for lifecycle transitions */
  approval_required?: boolean;

  /** Whether automatic numbering is enabled (DOCUMENT class) */
  numbering_enabled?: boolean;

  /** Whether effective dating columns are active (flag-driven for all classes) */
  effective_dating_enabled?: boolean;

  /** Versioning mode */
  versioning_mode?: "none" | "sequential" | "major_minor";

  /** Identity config for how this entity presents itself in lookups */
  identity?: IdentityConfig;
};

/**
 * Default feature flags when none are configured.
 */
export const DEFAULT_ENTITY_FEATURE_FLAGS: Required<EntityFeatureFlags> = {
  entity_class: undefined as unknown as EntityClass,
  approval_required: false,
  numbering_enabled: false,
  effective_dating_enabled: false,
  versioning_mode: "none",
  identity: undefined as unknown as IdentityConfig,
};

// ============================================================================
// Approvable Core Engine — Approval Status Types (Spec-Locked)
// ============================================================================

/**
 * Approval instance status (spec-locked).
 * Canonical spelling: "canceled" (US, matches DB CHECK constraint).
 * "rejected" maps to DB "canceled" + context.reason = "rejected".
 */
export type ApprovalInstanceStatus =
  | "open"
  | "completed"
  | "rejected"
  | "canceled";

/**
 * Approval task status (spec-locked).
 */
export type ApprovalTaskStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "skipped";

// ============================================================================
// Approvable Core Engine — Numbering Engine
// ============================================================================

/**
 * Reset policy for numbering sequences.
 */
export type NumberingResetPolicy = "none" | "yearly" | "monthly" | "daily";

/**
 * Numbering rule definition stored in meta.entity.naming_policy JSONB.
 * Defines pattern, reset behavior, and sequence parameters.
 */
export type NumberingRule = {
  /** Unique rule code */
  code: string;

  /** Pattern with placeholders: {YYYY}, {MM}, {DD}, {SEQ:N} (N = zero-pad width) */
  pattern: string;

  /** When to reset the sequence counter */
  reset_policy: NumberingResetPolicy;

  /** Starting sequence number */
  seq_start: number;

  /** Sequence increment */
  seq_increment: number;

  /** Whether this rule is active */
  is_active: boolean;
};

/**
 * Numbering sequence counter (DB row in meta.numbering_sequence).
 */
export type NumberingSequence = {
  id: string;
  tenant_id: string;
  entity_name: string;
  period_key: string;  // "__global__" | "YYYY" | "YYYY-MM" | "YYYY-MM-DD"
  current_value: number;
  updated_at: Date;
};

// ============================================================================
// Approvable Core Engine — Effective Dating
// ============================================================================

/**
 * Extended list options with effective dating support.
 */
export type EffectiveDatedListOptions = ListOptions & {
  /** Point-in-time date for effective dating filter */
  asOfDate?: Date;
};

// ============================================================================
// EPIC G — Approval Template Authoring
// ============================================================================

/**
 * Input for creating an approval template with stages and rules.
 */
export type ApprovalTemplateCreateInput = {
  /** Stable template code */
  code: string;

  /** Display name */
  name: string;

  /** Behavioral flags (JSON) */
  behaviors?: Record<string, unknown>;

  /** Escalation style */
  escalationStyle?: string;

  /** Stages to create with the template */
  stages: Array<{
    stageNo: number;
    name?: string;
    mode: "serial" | "parallel";
    quorum?: Record<string, unknown>;
  }>;

  /** Routing rules to create with the template */
  rules: Array<{
    priority: number;
    conditions: Record<string, unknown>;
    assignTo: Record<string, unknown>;
  }>;
};

/**
 * Input for updating an approval template.
 */
export type ApprovalTemplateUpdateInput = Partial<Omit<ApprovalTemplateCreateInput, "code">>;

/**
 * Result of template structural validation.
 */
export type TemplateValidationResult = {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
};

/**
 * Compiled approval template artifact.
 */
export type CompiledApprovalTemplate = {
  templateId: string;
  code: string;
  version: number;
  stages: ApprovalTemplateStage[];
  rules: ApprovalTemplateRule[];
  compiledHash: string;
  compiledAt: Date;
};

// ============================================================================
// EPIC H — Lifecycle Gate Evaluation
// ============================================================================

/**
 * Threshold rule for gate evaluation.
 * Defines a numeric condition on an entity field that must pass for a transition.
 */
export type ThresholdRule = {
  /** Entity field path (e.g., "amount", "risk_score") */
  field: string;

  /** Comparison operator */
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "ne" | "between";

  /** Threshold value or range (for "between") */
  value: number | [number, number];

  /** Action when threshold is NOT met */
  action: "block" | "require_approval";

  /** Human-readable reason for the block */
  reason?: string;
};

/**
 * Gate decision result with detailed evaluation trace.
 */
export type GateDecision = {
  allowed: boolean;
  reason?: string;
  reasonCodes: string[];
  thresholdResults?: Array<{
    rule: ThresholdRule;
    passed: boolean;
    actualValue: unknown;
  }>;
  conditionResults?: Array<{
    passed: boolean;
    reason?: string;
  }>;
};

// Note: All types are already exported inline above
// No need for duplicate exports here
