/**
 * Field Resolution Engine
 *
 * Deterministic pure function that resolves a FieldMeta into a ResolvedFieldMeta
 * with a computed UI type, read-only status, effective configs, and input props.
 *
 * Resolution priority (overlay-aware):
 *   1. Compiled overlay uiHint        (highest — enterprise override)
 *   2. uiHint.viewType / editType     (mode-specific)
 *   3. uiHint.type                    (generic override)
 *   4. legacy uiType column           (backward compat)
 *   5. auto-detect from dataType + format + constraints (deterministic)
 *
 * This is the ONLY place UI type resolution logic lives.
 * FieldRenderer, table views, and filter chips all consume ResolvedFieldMeta.
 */

import type { FieldMeta } from "@/lib/use-entity-fields";
import type { ReadOnlyReason, FieldEditBehavior } from "@/lib/entity-projection";
import type { ViewMode } from "@/lib/entity-page/types";

// ============================================================================
// Types
// ============================================================================

/** Canonical UI types — kept compact. Format drives specialization, not type inflation. */
export type ResolvedUiType =
    | "text"
    | "textarea"
    | "number"
    | "money-input"
    | "money-view"
    | "toggle"
    | "tristate-select"
    | "select"
    | "multi-select"
    | "datepicker"
    | "datetimepicker"
    | "reference-picker"
    | "reference-multi-picker"
    | "json-editor"
    | "uuid-view"
    | "collection"
    | "hidden";

/**
 * Effective constraints — canonical, resolved from constraints ?? validation.
 *
 * Keys are type-safe per data-type family:
 *   base:    required, nullable
 *   string:  + minLength, maxLength, pattern
 *   numeric: + min, max, precision, scale
 *   date:    + minDate, maxDate
 *   enum:    + allowedValues
 */
export interface EffectiveConstraints {
    nullable?: boolean;
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    precision?: number;
    scale?: number;
    minDate?: string;
    maxDate?: string;
    allowedValues?: string[];
}

/** Effective enum config — resolved from enumConfig ?? validation.enumValues */
export interface EffectiveEnumConfig {
    values: Array<{
        value: string;
        label?: string;
        description?: string;
        color?: string;
        icon?: string;
        sortOrder?: number;
        group?: string;
    }>;
    source?: "static" | "dynamic";
    allowMultiple?: boolean;
}

/**
 * Effective reference config — **structural relationship only**.
 *
 * Resolved from referenceConfig ?? lookupConfig (legacy).
 * Search/display UX lives in EffectiveLookupProfile, not here.
 * Legacy fields (displayField, searchFields, filter, etc.) are kept
 * for backward compat but the resolution engine reads them as fallback
 * hints only when EffectiveLookupProfile is absent.
 */
export interface EffectiveReferenceConfig {
    // ── Structural (authoritative) ──
    entity: string;
    /** DB schema of the referenced table (from FK detection) */
    refSchema?: string;
    /** DB table name (from FK detection, when entity slug unavailable) */
    refTable?: string;
    relationshipKind?: string;
    valueField?: string;
    hydrateStrategy?: string;
    joinEntity?: string;
    joinLeftKey?: string;
    joinRightKey?: string;
    allowCreateInline?: boolean;

    // ── Legacy search/display hints (deprecated → use EffectiveLookupProfile) ──
    /** @deprecated Use EffectiveLookupProfile.searchFields */
    displayField?: string;
    /** @deprecated Use EffectiveLookupProfile.searchFields */
    searchFields?: string[];
    /** @deprecated Use EffectiveLookupProfile.filters */
    filter?: Record<string, unknown>;
    /** @deprecated Use EffectiveLookupProfile.cacheMode */
    cacheMode?: string;
    /** @deprecated Use EffectiveLookupProfile.orderBy */
    defaultSort?: string;
    /** @deprecated Use EffectiveLookupProfile.pageSize */
    typeaheadLimit?: number;
    /** @deprecated Use EffectiveLookupProfile.matchMode */
    serverSearchMode?: string;
}

/** Search field entry with weight for relevance ranking */
export interface EffectiveLookupSearchField {
    field: string;
    weight: number;
    matchModes: Array<"exact" | "prefix" | "contains" | "token">;
}

/** Fully resolved lookup profile — consumed by typeahead picker and lookup API */
export interface EffectiveLookupProfile {
    displayTemplate?: string;
    searchFields: EffectiveLookupSearchField[];
    matchMode: "exact" | "prefix" | "contains" | "token";
    filters?: Record<string, unknown>;
    filtersByContext?: Record<string, Record<string, unknown>>;
    orderBy?: string;
    minChars: number;
    debounceMs: number;
    pageSize: number;
    cacheMode: "none" | "session" | "global";
    securityScope: string;
}

/**
 * Provenance tracking for field resolution debuggability.
 *
 * Every resolved config carries provenance so that admin tools and debug
 * panels can show exactly which layer contributed each value.
 */
export interface ResolutionProvenance {
    /** Which layer was the primary source: "lookupProfile" | "referenceConfig" | "heuristic" */
    resolvedFrom: string;
    /** Human-readable trace: e.g. ["searchFields:lookupProfile", "matchMode:default(prefix)"] */
    reasons: string[];
}

/** Effective money config */
export interface EffectiveMoneyConfig {
    currencyMode: string;
    currencyField?: string;
    currencyFieldType?: string;
    currencyRefEntity?: string;
    fixedCurrency?: string;
    roundingMode: string;
    scaleMode: string;
    fixedScale?: number;
    allowNegative: boolean;
}

/** Effective datetime config */
export interface EffectiveDatetimeConfig {
    timezoneMode: string;
}

/** UI hint shape (from uiHint JSONB or overlay) — raw flat structure */
export interface UiHintOverride {
    type?: string;
    viewType?: string;
    editType?: string;
    props?: Record<string, unknown>;
    hidden?: boolean;
    disabled?: boolean;
    placeholder?: string;
    helpText?: string;
    section?: string;
    readOnly?: boolean;
    lockOnEdit?: boolean;
    layout?: string;
    density?: string;
    icon?: string;
    group?: string;
    listColumnWidth?: number | "auto";
    listColumnAlignment?: "left" | "center" | "right";
}

/**
 * Fully resolved UI metadata — logically grouped, with defaults filled.
 * Components should consume this instead of raw UiHintOverride / effectiveUiHint.
 */
export interface ResolvedUiMeta {
    /** Renderer selection: which component to use */
    renderer: {
        type?: string;
        viewType?: string;
        editType?: string;
        props: Record<string, unknown>;
    };
    /** Form behavior: how the field behaves in forms */
    form: {
        placeholder?: string;
        helpText?: string;
        hidden: boolean;
        disabled: boolean;
    };
    /** Layout: form positioning and visual density */
    layout: {
        section?: string;
        group?: string;
        layout: "full" | "half" | "third";
        density: "compact" | "normal" | "comfortable";
        icon?: string;
    };
    /** List/table view config */
    list: {
        columnWidth: number | "auto";
        columnAlignment: "left" | "center" | "right";
    };
}

/** Resolved visibility for the current context */
export type ResolvedVisibility = "visible" | "hidden" | "internal";

/**
 * Fully resolved field metadata — computed once, consumed everywhere.
 * Prevents logic duplication across table, form, and filter components.
 */
export interface ResolvedFieldMeta {
    /** Original field metadata */
    field: FieldMeta;
    /** Computed UI component key */
    resolvedUiType: ResolvedUiType;
    /** Whether the field is read-only in this context */
    readOnly: boolean;
    /** Why the field is read-only (for tooltip display) */
    readOnlyReason?: ReadOnlyReason;
    /** Effective visibility for this context (visible / hidden / internal) */
    visibility: ResolvedVisibility;
    /** Resolved constraints (from constraints ?? validation JSONB) */
    effectiveConstraints: EffectiveConstraints;
    /** Resolved enum config (from enumConfig ?? validation.enumValues) */
    effectiveEnumConfig?: EffectiveEnumConfig;
    /** Resolved reference config (from referenceConfig ?? lookupConfig) */
    effectiveRefConfig?: EffectiveReferenceConfig;
    /** Resolved money config (when format=money) */
    effectiveMoneyConfig?: EffectiveMoneyConfig;
    /** Resolved datetime config (when dataType=datetime) */
    effectiveDatetimeConfig?: EffectiveDatetimeConfig;
    /** Format-driven input props (type="email", step, etc.) */
    inputProps: Record<string, unknown>;
    /** Display label: label ?? humanize(columnName) */
    displayLabel: string;
    /** Help text: uiHint.helpText ?? description */
    displayHelpText?: string;
    /** Effective UI hint (merged from overlay + field) — raw flat structure */
    effectiveUiHint: UiHintOverride;
    /** Resolved UI metadata — logically grouped with defaults. Prefer this over effectiveUiHint. */
    resolvedUi: ResolvedUiMeta;
    /** Effective lookup profile (for reference field typeahead search) */
    effectiveLookupProfile?: EffectiveLookupProfile;
    /** Resolution provenance for debuggability */
    provenance?: ResolutionProvenance;
    /** Observability signals — tracks legacy usage, fallbacks, and anomalies */
    resolutionSignals?: ResolutionSignals;
}

/**
 * Observability signals emitted during field resolution.
 * Components and telemetry can aggregate these to identify metadata quality issues.
 */
export interface ResolutionSignals {
    /** Field used legacy uiType column instead of uiHint.type */
    usedLegacyUiType?: boolean;
    /** Field used legacy validation.ui hints */
    usedLegacyValidationUi?: boolean;
    /** Field used legacy lookupConfig instead of referenceConfig */
    usedLegacyLookupConfig?: boolean;
    /** Renderer fell back to a generic type (e.g., "uuid-as-text") */
    rendererFallback?: string;
}

// ============================================================================
// Resolution Engine
// ============================================================================

/**
 * Overlay options for visibility/editability/validation override.
 * Passed from the compiled overlay system into the resolution engine.
 */
export interface FieldOverlayOptions {
    /** UI hint overlay (existing — highest priority for uiHint merge) */
    uiHint?: UiHintOverride;
    /** Visibility overlay with merge mode (replace/extend) */
    visibilityOverlay?: { mode: "replace" | "extend"; rules: Record<string, string> };
    /** Editability overlay with merge mode (replace/extend) */
    editabilityOverlay?: { mode: "replace" | "extend"; rules: Record<string, string> };
    /** Validation rules overlay with merge mode (replace/extend) */
    validationOverlay?: { mode: "replace" | "extend"; rules: unknown[] };
}

/**
 * Resolves a FieldMeta into a ResolvedFieldMeta for the given view mode.
 *
 * @param field - Raw field metadata from the server
 * @param mode - Current view mode (view, edit, create)
 * @param overlayHint - Optional UI hint from compiled overlay (highest priority).
 *                      Deprecated: prefer passing via overlayOptions.uiHint.
 * @param editBehavior - Optional pre-computed edit behavior (from section grouping)
 * @param overlayOptions - Optional overlay options for visibility/editability/validation
 */
export function resolveFieldMeta(
    field: FieldMeta,
    mode: ViewMode,
    overlayHint?: UiHintOverride,
    editBehavior?: FieldEditBehavior,
    overlayOptions?: FieldOverlayOptions,
): ResolvedFieldMeta {
    // ── Merge UI hints: overlay > field.uiHint > validation.ui (legacy) ──
    const legacyUi = (field.validation as Record<string, unknown> | null)?.ui as UiHintOverride | undefined;
    const fieldUiHint = field.uiHint as UiHintOverride | undefined;
    const effectiveUiHint: UiHintOverride = {
        ...legacyUi,
        ...fieldUiHint,
        ...overlayHint,
    };

    // ── Resolve constraints ──
    const effectiveConstraints = resolveConstraints(field);

    // ── Resolve sub-configs ──
    const effectiveEnumConfig = resolveEnumConfig(field);
    const effectiveRefConfig = resolveReferenceConfig(field);
    const effectiveMoneyConfig = resolveMoneyConfig(field);
    const effectiveDatetimeConfig = resolveDatetimeConfig(field);

    // ── Resolve lookup profile (for reference fields) ──
    const { profile: effectiveLookupProfile, provenance } = resolveLookupProfile(field, effectiveRefConfig);

    // ── Resolve visibility (FR-4 + overlay-aware) ──
    const visibility = resolveVisibility(field, mode, overlayOptions?.visibilityOverlay);

    // ── Resolve UI type ──
    const resolvedUiType = visibility === "hidden" || visibility === "internal"
        ? "hidden"
        : resolveUiType(field, mode, effectiveUiHint, effectiveConstraints, effectiveEnumConfig);

    // ── Resolve read-only (FR-4 editability-aware + overlay) ──
    const { readOnly, readOnlyReason } = resolveReadOnly(field, mode, effectiveUiHint, editBehavior, overlayOptions?.editabilityOverlay);

    // ── Resolve input props ──
    const inputProps = resolveInputProps(field, resolvedUiType, effectiveConstraints);

    // ── Resolve UI meta (normalize flat hint → logical sub-groups) ──
    const resolvedUi = resolveUiMeta(effectiveUiHint);

    // ── Resolve labels ──
    const displayLabel = field.label ?? humanizeColumnName(field.columnName);
    const displayHelpText = resolvedUi.form.helpText ?? field.description ?? undefined;

    // ── Observability: track resolution signals for diagnostics ──
    const resolutionSignals: ResolutionSignals = {};
    if (field.uiType && !effectiveUiHint.type) {
        resolutionSignals.usedLegacyUiType = true;
    }
    if (legacyUi) {
        resolutionSignals.usedLegacyValidationUi = true;
    }
    if (!field.referenceConfig && field.lookupConfig && effectiveRefConfig) {
        resolutionSignals.usedLegacyLookupConfig = true;
    }
    if (resolvedUiType === "text" && field.dataType === "uuid") {
        resolutionSignals.rendererFallback = "uuid-as-text";
    }

    return {
        field,
        resolvedUiType,
        readOnly,
        readOnlyReason,
        visibility,
        effectiveConstraints,
        effectiveEnumConfig,
        effectiveRefConfig,
        effectiveMoneyConfig,
        effectiveDatetimeConfig,
        inputProps,
        displayLabel,
        displayHelpText,
        effectiveUiHint,
        resolvedUi,
        effectiveLookupProfile,
        provenance,
        resolutionSignals: Object.keys(resolutionSignals).length > 0 ? resolutionSignals : undefined,
    };
}

// ============================================================================
// UI Type Resolution
// ============================================================================

function resolveUiType(
    field: FieldMeta,
    mode: ViewMode,
    uiHint: UiHintOverride,
    constraints: EffectiveConstraints,
    enumConfig?: EffectiveEnumConfig,
): ResolvedUiType {
    // Priority 1: Mode-specific override (overlay already merged into uiHint)
    if (mode === "view" && uiHint.viewType) return uiHint.viewType as ResolvedUiType;
    if ((mode === "edit" || mode === "create") && uiHint.editType) return uiHint.editType as ResolvedUiType;

    // Priority 2: Generic UI type override
    if (uiHint.type) return uiHint.type as ResolvedUiType;

    // Priority 3: Hidden check
    if (uiHint.hidden) return "hidden";

    // Priority 4: Legacy uiType column (normalize known legacy values)
    if (field.uiType) {
        if (field.uiType === "lookup") return "reference-picker";
        return field.uiType as ResolvedUiType;
    }

    // Priority 5: Auto-detect from dataType + format + constraints
    return autoDetectUiType(field, mode, constraints, enumConfig);
}

function autoDetectUiType(
    field: FieldMeta,
    mode: ViewMode,
    constraints: EffectiveConstraints,
    enumConfig?: EffectiveEnumConfig,
): ResolvedUiType {
    const { dataType, format, cardinality, origin } = field;

    // 1:N collection field (parent/child with join table wiring)
    if (field.childEntityName && field.childFkField) return "collection";

    switch (dataType) {
        case "string":
            // Format-driven specialization (email/url/phone/password/color are text with input props)
            if (constraints.maxLength && constraints.maxLength > 120) return "textarea";
            return "text";

        case "text":
            return "textarea";

        case "integer":
            if (enumConfig && enumConfig.values.length > 0) return "select";
            return "number";

        case "decimal":
            if (format === "money") return mode === "view" ? "money-view" : "money-input";
            return "number";

        case "number":
            return "number";

        case "boolean":
            // Nullable booleans → tristate select (Yes / No / —)
            if (constraints.nullable && !field.isRequired) return "tristate-select";
            return "toggle";

        case "date":
            return "datepicker";

        case "datetime":
            return "datetimepicker";

        case "uuid":
            // UUID with FK metadata → treat as reference (safety net for un-promoted fields)
            if (field.referenceConfig || field.lookupConfig) {
                if (cardinality === "many") return "reference-multi-picker";
                return "reference-picker";
            }
            // System UUIDs hidden in business edit forms
            if (origin === "system" && mode !== "view") return "hidden";
            return mode === "view" ? "uuid-view" : "text";

        case "reference":
            if (cardinality === "many") return "reference-multi-picker";
            return "reference-picker";

        case "enum":
            if (cardinality === "many") return "multi-select";
            return "select";

        case "json":
            return "json-editor";

        case "rich_text":
            return "textarea";

        default:
            return "text";
    }
}

// ============================================================================
// Visibility Resolution (FR-4)
// ============================================================================

/** Restrictiveness order for visibility: hidden > internal > visible */
const VIS_RANK: Record<string, number> = { visible: 0, internal: 1, hidden: 2 };

/**
 * Resolve context-aware visibility for a field.
 *
 * Three-layer model:
 *   Layer 1: base standard (field.visibility JSONB)
 *   Layer 2: customer overlay (visibilityOverlay with mode: replace/extend)
 *   Layer 3: resolved result (this function's return value)
 *
 * - extend:  overlay can only add restrictions — more restrictive value wins.
 * - replace: overlay replaces base for specified contexts; unspecified inherit base.
 */
function resolveVisibility(
    field: FieldMeta,
    mode: ViewMode,
    overlay?: { mode: "replace" | "extend"; rules: Record<string, string> },
): ResolvedVisibility {
    const vis = field.visibility as Record<string, string> | null;
    const contextKey = mode === "create" ? "create" : mode === "edit" ? "edit" : "view";

    // Layer 1: base value
    const baseValue = vis?.[contextKey];
    let resolved: ResolvedVisibility = "visible";
    if (baseValue === "hidden" || baseValue === "internal") resolved = baseValue;

    // Layer 2: overlay
    if (overlay?.rules) {
        const overlayValue = overlay.rules[contextKey];
        if (overlayValue === "hidden" || overlayValue === "internal" || overlayValue === "visible") {
            if (overlay.mode === "replace") {
                resolved = overlayValue;
            } else {
                // extend: pick most restrictive
                resolved = (VIS_RANK[overlayValue] ?? 0) >= (VIS_RANK[resolved] ?? 0)
                    ? overlayValue as ResolvedVisibility
                    : resolved;
            }
        }
    }

    return resolved;
}

/**
 * Check whether a field should be rendered in the given context.
 * "hidden" and "internal" fields are excluded from the UI.
 * This is a convenience filter for EntityForm / DetailsTab field loops.
 */
export function isFieldVisible(field: FieldMeta, mode: ViewMode): boolean {
    return resolveVisibility(field, mode) === "visible";
}

// ============================================================================
// Read-Only Resolution
// ============================================================================

const DERIVED_HIERARCHY_COLUMNS = new Set(["level"]);
const LIFECYCLE_MANAGED_COLUMNS = new Set(["activated_at", "sunset_at"]);
const SYSTEM_MANAGED_COLUMNS = new Set(["created_at", "updated_at", "version"]);

/** Restrictiveness order for editability: computed > system_managed > read_only > editable */
const EDIT_RANK: Record<string, number> = { editable: 0, read_only: 1, system_managed: 2, computed: 3 };

/**
 * Unified mutability resolution — single function, strict precedence.
 *
 * Precedence chain (highest → lowest, early-return):
 *   1. is_computed=true       → COMPUTED (unconditional, cannot be relaxed)
 *   2. is_read_only=true      → SYSTEM_MANAGED (domain flag, cannot be relaxed)
 *   3. origin="system"        → SYSTEM_ORIGIN (business forms never edit system fields)
 *   4. write_once=true + edit → WRITE_ONCE (editable only on create)
 *   5. editability context    → EXPLICIT_META / SYSTEM_MANAGED / COMPUTED
 *      + editability overlay  → (replace/extend merge, then evaluate)
 *   6. Convention columns     → LIFECYCLE_MANAGED / DERIVED_HIERARCHY / SYSTEM_MANAGED
 *   7. is_deprecated=true     → DEPRECATED (safety)
 *   8. ui_hint advisory       → UI_ADVISORY (rendering hint ONLY — never overrides above)
 *
 * KEY: ui_hint.readOnly and ui_hint.lockOnEdit are Layer 8 advisories.
 * They influence rendering (disabled attribute, grey styling) but NEVER override
 * domain/security truth from Layers 1–7.
 */
function resolveReadOnly(
    field: FieldMeta,
    mode: ViewMode,
    uiHint: UiHintOverride,
    editBehavior?: FieldEditBehavior,
    editabilityOverlay?: { mode: "replace" | "extend"; rules: Record<string, string> },
): { readOnly: boolean; readOnlyReason?: ReadOnlyReason } {
    // View mode is always read-only (no reason needed — not a mutability decision)
    if (mode === "view") return { readOnly: true };

    // Pre-computed edit behavior from section grouping (external override)
    if (editBehavior?.readOnly) {
        return { readOnly: true, readOnlyReason: editBehavior.reason };
    }

    // ── Layer 1: Computed fields — unconditionally read-only ──
    if (field.isComputed) return { readOnly: true, readOnlyReason: "COMPUTED" };

    // ── Layer 2: Explicit read-only flag — domain truth ──
    if (field.isReadOnly) return { readOnly: true, readOnlyReason: "SYSTEM_MANAGED" };

    // ── Layer 3: System origin — never editable in business context ──
    if (field.origin === "system") return { readOnly: true, readOnlyReason: "SYSTEM_ORIGIN" };

    // ── Layer 4: Write-once — editable only on create ──
    if (field.writeOnce && mode === "edit") return { readOnly: true, readOnlyReason: "WRITE_ONCE" };

    // ── Layer 5: Context-aware editability (base + overlay) ──
    const editabilityMap = field.editability as Record<string, string> | null;
    const contextKey = mode === "create" ? "create" : "edit";
    let editabilityValue = editabilityMap?.[contextKey] ?? "editable";

    // Apply customer overlay (replace/extend)
    if (editabilityOverlay?.rules) {
        const overlayValue = editabilityOverlay.rules[contextKey];
        if (overlayValue) {
            if (editabilityOverlay.mode === "replace") {
                editabilityValue = overlayValue;
            } else {
                // extend: pick most restrictive
                editabilityValue = (EDIT_RANK[overlayValue] ?? 0) >= (EDIT_RANK[editabilityValue] ?? 0)
                    ? overlayValue
                    : editabilityValue;
            }
        }
    }

    if (editabilityValue === "computed") return { readOnly: true, readOnlyReason: "COMPUTED" };
    if (editabilityValue === "system_managed") return { readOnly: true, readOnlyReason: "SYSTEM_MANAGED" };
    if (editabilityValue === "read_only") return { readOnly: true, readOnlyReason: "EXPLICIT_META" };

    // ── Layer 6: Convention-based columns ──
    if (DERIVED_HIERARCHY_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "DERIVED_HIERARCHY" };
    if (LIFECYCLE_MANAGED_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "LIFECYCLE_MANAGED" };
    if (SYSTEM_MANAGED_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "SYSTEM_MANAGED" };

    // ── Layer 7: Deprecated fields — read-only as safety measure ──
    if (field.isDeprecated) return { readOnly: true, readOnlyReason: "DEPRECATED" };

    // ── Layer 8: UI advisory flags — rendering hints only ──
    // These NEVER override domain truth. They are checked last and tagged
    // with UI_ADVISORY so consumers know the source is cosmetic, not policy.
    if (uiHint.readOnly) return { readOnly: true, readOnlyReason: "UI_ADVISORY" };
    if (uiHint.lockOnEdit && mode === "edit") return { readOnly: true, readOnlyReason: "UI_ADVISORY" };

    return { readOnly: false };
}

// ============================================================================
// UI Meta Resolution (normalize flat ui_hint → logical sub-groups)
// ============================================================================

/**
 * Resolve flat UiHintOverride into logically grouped ResolvedUiMeta.
 *
 * This is the ONLY place where raw ui_hint is decomposed. Components should
 * consume resolvedUi.renderer / resolvedUi.form / resolvedUi.layout / resolvedUi.list
 * instead of picking individual fields from effectiveUiHint.
 */
function resolveUiMeta(hint: UiHintOverride): ResolvedUiMeta {
    return {
        renderer: {
            type: hint.type,
            viewType: hint.viewType,
            editType: hint.editType,
            props: hint.props ?? {},
        },
        form: {
            placeholder: hint.placeholder,
            helpText: hint.helpText,
            hidden: hint.hidden ?? false,
            disabled: hint.disabled ?? false,
        },
        layout: {
            section: hint.section,
            group: hint.group,
            layout: (hint.layout as "full" | "half" | "third") ?? "full",
            density: (hint.density as "compact" | "normal" | "comfortable") ?? "normal",
            icon: hint.icon,
        },
        list: {
            columnWidth: hint.listColumnWidth ?? "auto",
            columnAlignment: hint.listColumnAlignment ?? "left",
        },
    };
}

// ============================================================================
// Input Props Resolution (format-driven)
// ============================================================================

function resolveInputProps(
    field: FieldMeta,
    uiType: ResolvedUiType,
    constraints: EffectiveConstraints,
): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    // Format-driven input type (email, url, tel — for text inputs)
    if (uiType === "text" && field.format) {
        switch (field.format) {
            case "email": props.type = "email"; break;
            case "url": props.type = "url"; break;
            case "phone": props.type = "tel"; break;
            case "password": props.type = "password"; break;
        }
    }

    // Number step from constraints or data type
    if (uiType === "number") {
        if (field.dataType === "decimal") {
            const scale = constraints.scale ?? 2;
            props.step = String(Math.pow(10, -scale));
        } else if (field.dataType === "integer") {
            props.step = "1";
        } else {
            props.step = "any";
        }
        if (constraints.min != null) props.min = constraints.min;
        if (constraints.max != null) props.max = constraints.max;
    }

    // Text constraints
    if (uiType === "text" || uiType === "textarea") {
        if (constraints.minLength != null) props.minLength = constraints.minLength;
        if (constraints.maxLength != null) props.maxLength = constraints.maxLength;
        if (constraints.pattern) props.pattern = constraints.pattern;
    }

    // Date constraints
    if (uiType === "datepicker") {
        if (constraints.minDate) props.minDate = constraints.minDate;
        if (constraints.maxDate) props.maxDate = constraints.maxDate;
    }

    // Money: prefix/suffix from format
    if (uiType === "money-input" && field.format === "percent") {
        props.suffix = "%";
    }

    // Unit as suffix
    if (field.unit) {
        props.suffix = field.unit;
    }

    return props;
}

// ============================================================================
// Sub-Config Resolution (canonical → from structured config ?? legacy)
// ============================================================================

function resolveConstraints(field: FieldMeta): EffectiveConstraints {
    // Prefer structured constraints, fall back to validation JSONB
    if (field.constraints) {
        return field.constraints as EffectiveConstraints;
    }

    const v = field.validation as Record<string, unknown> | null;
    if (!v) return {};

    return {
        required: field.isRequired || undefined,
        nullable: !field.isRequired || undefined,
        min: v.min as number | undefined,
        max: v.max as number | undefined,
        minLength: v.minLength as number | undefined,
        maxLength: v.maxLength as number | undefined,
        pattern: v.pattern as string | undefined,
        precision: v.precision as number | undefined,
        scale: v.scale as number | undefined,
        minDate: v.minDate as string | undefined,
        maxDate: v.maxDate as string | undefined,
        allowedValues: v.allowedValues as string[] | undefined,
    };
}

function resolveEnumConfig(field: FieldMeta): EffectiveEnumConfig | undefined {
    // Prefer structured enumConfig
    if (field.enumConfig) {
        const ec = field.enumConfig as Record<string, unknown>;
        return {
            values: (ec.values as EffectiveEnumConfig["values"]) ?? [],
            source: ec.source as string as EffectiveEnumConfig["source"],
            allowMultiple: field.cardinality === "many" || undefined,
        };
    }

    // Legacy: validation.enumValues or validation.options
    const v = field.validation as Record<string, unknown> | null;
    if (!v) return undefined;

    const rawValues = (v.enumValues ?? v.options ?? v.allowedValues) as string[] | undefined;
    if (!rawValues || !Array.isArray(rawValues) || rawValues.length === 0) return undefined;

    return {
        values: rawValues.map((val) => ({ value: val })),
        source: "static",
        allowMultiple: field.cardinality === "many" || undefined,
    };
}

function resolveReferenceConfig(field: FieldMeta): EffectiveReferenceConfig | undefined {
    // Prefer structured referenceConfig
    if (field.referenceConfig) {
        return field.referenceConfig as unknown as EffectiveReferenceConfig;
    }

    // Legacy: lookupConfig
    const lc = field.lookupConfig as Record<string, unknown> | null;
    if (!lc) return undefined;

    return {
        entity: (lc.targetEntity ?? lc.refTable ?? "") as string,
        refSchema: lc.refSchema as string | undefined,
        refTable: lc.refTable as string | undefined,
        displayField: lc.displayField as string | undefined,
        valueField: "id",
    };
}

/**
 * Resolve lookup profile for reference field typeahead.
 *
 * Resolution priority (client-side, field-level only):
 *   1. field.lookupProfile (explicit per-field override) — highest
 *   2. field.referenceConfig search hints (deprecated: searchFields, displayField, typeaheadLimit)
 *   3. Heuristic defaults
 *
 * Target entity identityConfig is merged server-side in the lookup API.
 *
 * Merge semantics (formalized in LOOKUP_PROFILE_MERGE):
 *   - searchFields: UNION by field name, keep highest weight on collision
 *   - filters/filtersByContext: DEEP_MERGE (higher layer keys win)
 *   - all scalars: REPLACE (first non-null from highest layer)
 *
 * When tenant/customer overlays are added, they will slot in as a layer
 * above field.lookupProfile and use the same merge rules.
 */
function resolveLookupProfile(
    field: FieldMeta,
    refConfig: EffectiveReferenceConfig | undefined,
): { profile: EffectiveLookupProfile | undefined; provenance: ResolutionProvenance | undefined } {
    // Only resolve for reference-like fields
    if (!refConfig && field.dataType !== "reference") {
        return { profile: undefined, provenance: undefined };
    }

    const reasons: string[] = [];
    let resolvedFrom = "heuristic";

    const lp = field.lookupProfile as Record<string, unknown> | null;

    // ── Search fields: lookupProfile > referenceConfig > heuristic ──
    let searchFields: EffectiveLookupSearchField[] = [];

    if (lp?.searchFields && Array.isArray(lp.searchFields)) {
        searchFields = (lp.searchFields as Array<Record<string, unknown>>).map((sf) => ({
            field: sf.field as string,
            weight: (sf.weight as number) ?? 1,
            matchModes: (sf.matchModes as EffectiveLookupSearchField["matchModes"]) ?? ["exact", "prefix", "contains"],
        }));
        resolvedFrom = "lookupProfile";
        reasons.push("searchFields:lookupProfile");
    } else if (refConfig?.searchFields && refConfig.searchFields.length > 0) {
        searchFields = refConfig.searchFields.map((f, i) => ({
            field: f,
            weight: refConfig.searchFields!.length - i, // higher weight for earlier fields
            matchModes: ["exact", "prefix", "contains"] as EffectiveLookupSearchField["matchModes"],
        }));
        resolvedFrom = "referenceConfig";
        reasons.push("searchFields:referenceConfig");
    } else {
        // Heuristic: use displayField as single search field
        if (refConfig?.displayField) {
            searchFields = [{ field: refConfig.displayField, weight: 5, matchModes: ["exact", "prefix", "contains"] }];
            reasons.push("searchFields:heuristic(displayField)");
        }
    }

    // ── Display template ──
    const displayTemplate = (lp?.displayTemplate as string | undefined) ?? undefined;
    if (displayTemplate) reasons.push("displayTemplate:lookupProfile");

    // ── Match mode ──
    const matchMode = (lp?.matchMode as EffectiveLookupProfile["matchMode"]) ?? "prefix";
    if (lp?.matchMode) reasons.push(`matchMode:lookupProfile(${matchMode})`);
    else reasons.push("matchMode:default(prefix)");

    // ── Filters / filtersByContext ──
    const filters = (lp?.filters as Record<string, unknown> | undefined) ??
        (refConfig?.filter as Record<string, unknown> | undefined);
    if (lp?.filters) reasons.push("filters:lookupProfile");
    else if (refConfig?.filter) reasons.push("filters:referenceConfig");

    const filtersByContext = (lp?.filtersByContext as Record<string, Record<string, unknown>> | undefined);
    if (filtersByContext) reasons.push("filtersByContext:lookupProfile");

    // ── Scalars: lookupProfile > referenceConfig > defaults ──
    const orderBy = (lp?.orderBy as string | undefined) ?? (refConfig?.defaultSort) ?? undefined;
    const minChars = (lp?.minChars as number | undefined) ?? 2;
    const debounceMs = (lp?.debounceMs as number | undefined) ?? 300;
    const pageSize = (lp?.pageSize as number | undefined) ?? (refConfig?.typeaheadLimit) ?? 20;
    const cacheMode = (lp?.cacheMode as EffectiveLookupProfile["cacheMode"]) ??
        (refConfig?.cacheMode as EffectiveLookupProfile["cacheMode"]) ?? "session";
    const securityScope = (lp?.securityScope as string | undefined) ?? "tenant";

    return {
        profile: {
            displayTemplate,
            searchFields,
            matchMode,
            filters,
            filtersByContext,
            orderBy,
            minChars,
            debounceMs,
            pageSize,
            cacheMode,
            securityScope,
        },
        provenance: { resolvedFrom, reasons },
    };
}

function resolveMoneyConfig(field: FieldMeta): EffectiveMoneyConfig | undefined {
    if (field.format !== "money") return undefined;

    if (field.moneyConfig) {
        const mc = field.moneyConfig as Record<string, unknown>;
        return {
            currencyMode: (mc.currencyMode as string) ?? "tenantDefault",
            currencyField: mc.currencyField as string | undefined,
            currencyFieldType: mc.currencyFieldType as string | undefined,
            currencyRefEntity: mc.currencyRefEntity as string | undefined,
            fixedCurrency: mc.fixedCurrency as string | undefined,
            roundingMode: (mc.roundingMode as string) ?? "HALF_UP",
            scaleMode: (mc.scaleMode as string) ?? "currency",
            fixedScale: mc.fixedScale as number | undefined,
            allowNegative: mc.allowNegative !== false,
        };
    }

    // Default money config when format=money but no explicit config
    return {
        currencyMode: "tenantDefault",
        roundingMode: "HALF_UP",
        scaleMode: "currency",
        allowNegative: true,
    };
}

function resolveDatetimeConfig(field: FieldMeta): EffectiveDatetimeConfig | undefined {
    if (field.dataType !== "datetime") return undefined;

    if (field.datetimeConfig) {
        const dc = field.datetimeConfig as Record<string, unknown>;
        return {
            timezoneMode: (dc.timezoneMode as string) ?? "tenant",
        };
    }

    return { timezoneMode: "tenant" };
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolved collection config for 1:N parent/child fields */
export interface EffectiveCollectionConfig {
    childEntityName: string;
    childFkField: string;
    ownership: "owned" | "linked";
    persistenceMode: "inline" | "reference_only";
    deleteMode: "cascade" | "restrict" | "detach";
    ordering: boolean;
    orderField: string;
    editorStyle: "grid" | "subform" | "tags";
    minItems?: number;
    maxItems?: number;
    allowDuplicates: boolean;
    aggregates?: Array<{
        field: string;
        op: "count" | "sum" | "avg" | "min" | "max";
        label?: string;
    }>;
    aggregateStrategy: "live" | "on_save" | "manual";
    allowDraftRows: boolean;
    rowValidation: "on_change" | "on_save" | "on_submit";
}

/** Extract collection config from a FieldMeta (only valid when childEntityName + childFkField set) */
export function resolveCollectionConfig(field: FieldMeta): EffectiveCollectionConfig | undefined {
    if (!field.childEntityName || !field.childFkField) return undefined;

    const cb = field.collectionBehavior as Record<string, unknown> | null;
    const ownership = (cb?.ownership as EffectiveCollectionConfig["ownership"]) ?? "owned";
    const isOwned = ownership === "owned";

    return {
        childEntityName: field.childEntityName,
        childFkField: field.childFkField,
        ownership,
        persistenceMode: (cb?.persistenceMode as EffectiveCollectionConfig["persistenceMode"]) ?? (isOwned ? "inline" : "reference_only"),
        deleteMode: (cb?.deleteMode as EffectiveCollectionConfig["deleteMode"]) ?? (isOwned ? "cascade" : "detach"),
        ordering: (cb?.ordering as boolean) ?? false,
        orderField: (cb?.orderField as string) ?? "sort_order",
        editorStyle: (cb?.editorStyle as EffectiveCollectionConfig["editorStyle"]) ?? "grid",
        minItems: cb?.minItems as number | undefined,
        maxItems: cb?.maxItems as number | undefined,
        allowDuplicates: (cb?.allowDuplicates as boolean) ?? false,
        aggregates: cb?.aggregates as EffectiveCollectionConfig["aggregates"],
        aggregateStrategy: (cb?.aggregateStrategy as EffectiveCollectionConfig["aggregateStrategy"]) ?? "live",
        allowDraftRows: (cb?.allowDraftRows as boolean) ?? false,
        rowValidation: (cb?.rowValidation as EffectiveCollectionConfig["rowValidation"]) ?? "on_change",
    };
}

function humanizeColumnName(name: string): string {
    return name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
