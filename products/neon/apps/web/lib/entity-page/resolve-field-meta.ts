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
    | "hidden";

/** Effective constraints — canonical, resolved from constraints ?? validation */
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

/** Effective reference config — resolved from referenceConfig ?? lookupConfig */
export interface EffectiveReferenceConfig {
    entity: string;
    /** DB schema of the referenced table (from FK detection) */
    refSchema?: string;
    /** DB table name (from FK detection, when entity slug unavailable) */
    refTable?: string;
    relationshipKind?: string;
    displayField?: string;
    searchFields?: string[];
    filter?: Record<string, unknown>;
    valueField?: string;
    cacheMode?: string;
    defaultSort?: string;
    typeaheadLimit?: number;
    serverSearchMode?: string;
    hydrateStrategy?: string;
    joinEntity?: string;
    joinLeftKey?: string;
    joinRightKey?: string;
    allowCreateInline?: boolean;
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

/** UI hint shape (from uiHint JSONB or overlay) */
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
}

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
    /** Effective UI hint (merged from overlay + field) */
    effectiveUiHint: UiHintOverride;
}

// ============================================================================
// Resolution Engine
// ============================================================================

/**
 * Resolves a FieldMeta into a ResolvedFieldMeta for the given view mode.
 *
 * @param field - Raw field metadata from the server
 * @param mode - Current view mode (view, edit, create)
 * @param overlayHint - Optional UI hint from compiled overlay (highest priority)
 * @param editBehavior - Optional pre-computed edit behavior (from section grouping)
 */
export function resolveFieldMeta(
    field: FieldMeta,
    mode: ViewMode,
    overlayHint?: UiHintOverride,
    editBehavior?: FieldEditBehavior,
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

    // ── Resolve UI type ──
    const resolvedUiType = resolveUiType(field, mode, effectiveUiHint, effectiveConstraints, effectiveEnumConfig);

    // ── Resolve read-only ──
    const { readOnly, readOnlyReason } = resolveReadOnly(field, mode, effectiveUiHint, editBehavior);

    // ── Resolve input props ──
    const inputProps = resolveInputProps(field, resolvedUiType, effectiveConstraints);

    // ── Resolve labels ──
    const displayLabel = field.label ?? humanizeColumnName(field.columnName);
    const displayHelpText = effectiveUiHint.helpText ?? field.description ?? undefined;

    return {
        field,
        resolvedUiType,
        readOnly,
        readOnlyReason,
        effectiveConstraints,
        effectiveEnumConfig,
        effectiveRefConfig,
        effectiveMoneyConfig,
        effectiveDatetimeConfig,
        inputProps,
        displayLabel,
        displayHelpText,
        effectiveUiHint,
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
// Read-Only Resolution
// ============================================================================

const DERIVED_HIERARCHY_COLUMNS = new Set(["level"]);
const LIFECYCLE_MANAGED_COLUMNS = new Set(["activated_at", "sunset_at"]);
const SYSTEM_MANAGED_COLUMNS = new Set(["created_at", "updated_at", "version"]);

function resolveReadOnly(
    field: FieldMeta,
    mode: ViewMode,
    uiHint: UiHintOverride,
    editBehavior?: FieldEditBehavior,
): { readOnly: boolean; readOnlyReason?: ReadOnlyReason } {
    // View mode is always read-only (no reason needed)
    if (mode === "view") return { readOnly: true };

    // Pre-computed edit behavior takes precedence (from section grouping)
    if (editBehavior?.readOnly) {
        return { readOnly: true, readOnlyReason: editBehavior.reason };
    }

    // Computed fields are always read-only
    if (field.isComputed) return { readOnly: true, readOnlyReason: "COMPUTED" };

    // Write-once in edit mode
    if (field.writeOnce && mode === "edit") return { readOnly: true, readOnlyReason: "WRITE_ONCE" };

    // Explicit read-only from field flag
    if (field.isReadOnly) return { readOnly: true, readOnlyReason: "EXPLICIT_META" };

    // UI hint read-only
    if (uiHint.readOnly) return { readOnly: true, readOnlyReason: "EXPLICIT_META" };

    // Lock on edit
    if (uiHint.lockOnEdit && mode === "edit") return { readOnly: true, readOnlyReason: "LOCK_ON_EDIT" };

    // System origin in business context
    if (field.origin === "system") return { readOnly: true, readOnlyReason: "SYSTEM_ORIGIN" };

    // Convention-based (kept for backward compat)
    if (DERIVED_HIERARCHY_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "DERIVED_HIERARCHY" };
    if (LIFECYCLE_MANAGED_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "LIFECYCLE_MANAGED" };
    if (SYSTEM_MANAGED_COLUMNS.has(field.columnName)) return { readOnly: true, readOnlyReason: "SYSTEM_MANAGED" };

    return { readOnly: false };
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

function humanizeColumnName(name: string): string {
    return name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
