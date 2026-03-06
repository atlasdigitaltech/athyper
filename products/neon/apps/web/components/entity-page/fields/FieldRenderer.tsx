"use client";

/**
 * Type-Aware Field Renderer
 *
 * Dispatches to the correct field component based on ResolvedFieldMeta.resolvedUiType.
 * Uses the resolution engine for deterministic UI type mapping.
 *
 * Resolution priority:
 *   1. Compiled overlay uiHint
 *   2. uiHint.viewType / editType (mode-specific)
 *   3. uiHint.type (generic override)
 *   4. Legacy uiType column
 *   5. Auto-detect from dataType + format + constraints
 */

import { Badge, Label } from "@neon/ui";
import { Lock } from "lucide-react";

import type { ReadOnlyReason, FieldEditBehavior } from "@/lib/entity-projection";
import type { ViewMode } from "@/lib/entity-page/types";
import type { FieldMeta } from "@/lib/use-entity-fields";
import { resolveFieldMeta, type ResolvedFieldMeta, type UiHintOverride } from "@/lib/entity-page/resolve-field-meta";
import { isNumericType, isDateLikeType } from "@/lib/entity-meta-utils";
import { READ_ONLY_REASON_LABELS } from "@/lib/entity-projection";

import {
    TextRenderer,
    TextareaRenderer,
    NumberRenderer,
    MoneyInputRenderer,
    MoneyViewRenderer,
    ToggleRenderer,
    TristateSelectRenderer,
    SelectRenderer,
    EnumViewRenderer,
    MultiSelectRenderer,
    DatePickerRenderer,
    DateTimePickerRenderer,
    UuidViewRenderer,
    JsonEditorRenderer,
    ReferencePickerRenderer,
    ReferenceMultiPickerRenderer,
    CollectionFieldRenderer,
} from "./renderers";
import type { UseCollectionFieldResult } from "@/lib/use-collection-field";

// ============================================================================
// Props
// ============================================================================

interface FieldRendererProps {
    field: FieldMeta;
    value: unknown;
    viewMode: ViewMode;
    /** Resolved display name for FK reference fields */
    resolvedRef?: string;
    /** Reason code when field is forced read-only (shows lock icon + tooltip) */
    readOnlyReason?: ReadOnlyReason;
    /** Pre-computed edit behavior (from section grouping) */
    editBehavior?: FieldEditBehavior;
    /** Overlay UI hint (from compiled overlay — highest priority) */
    overlayHint?: UiHintOverride;
    onChange?: (fieldName: string, value: unknown) => void;
    /** Parent entity name — required for collection fields */
    parentEntity?: string;
    /** Parent record ID — required for collection fields */
    parentId?: string;
    /** Pre-initialized collection hook result (for collection fields) */
    collectionHook?: UseCollectionFieldResult;
}

// ============================================================================
// Dispatcher
// ============================================================================

export function FieldRenderer({
    field,
    value,
    viewMode,
    resolvedRef,
    readOnlyReason,
    editBehavior,
    overlayHint,
    onChange,
    parentEntity,
    parentId,
    collectionHook,
}: FieldRendererProps) {
    // Resolve field metadata once — all decisions flow from this
    const resolved = resolveFieldMeta(field, viewMode, overlayHint, editBehavior);

    // Override readOnlyReason if passed externally (backward compat)
    const effectiveReadOnly = readOnlyReason ? true : resolved.readOnly;
    const effectiveReason = readOnlyReason ?? resolved.readOnlyReason;

    // Hidden fields render nothing
    if (resolved.resolvedUiType === "hidden") return null;

    // Collection fields render an inline grid (requires parent context)
    if (resolved.resolvedUiType === "collection" && collectionHook && parentEntity) {
        return (
            <CollectionFieldRenderer
                resolved={resolved}
                parentEntity={parentEntity}
                parentId={parentId}
                collection={collectionHook}
                viewMode={viewMode}
            />
        );
    }

    // Read-only field with reason (forced view mode in edit/create context)
    if (effectiveReadOnly && effectiveReason && viewMode !== "view") {
        return (
            <ReadOnlyField
                resolved={resolved}
                value={value}
                reason={effectiveReason}
                resolvedRef={resolvedRef}
            />
        );
    }

    // View mode — reference-picker delegates to LookupTypeahead for consistent display
    if (viewMode === "view") {
        if (resolved.resolvedUiType === "reference-picker" && resolved.effectiveRefConfig?.entity) {
            return <ReferencePickerRenderer resolved={resolved} value={value} resolvedRef={resolvedRef} viewMode={viewMode} />;
        }
        return renderViewMode(resolved, value, resolvedRef);
    }

    // Edit / Create mode
    return renderEditMode(resolved, value, resolvedRef, onChange, viewMode);
}

// ============================================================================
// View Mode Rendering
// ============================================================================

function renderViewMode(
    resolved: ResolvedFieldMeta,
    value: unknown,
    resolvedRef?: string,
): React.ReactNode {
    const { resolvedUiType } = resolved;

    // Reference view: show display label, not raw UUID
    if (resolvedRef && (resolvedUiType === "reference-picker" || resolvedUiType === "reference-multi-picker")) {
        return (
            <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{resolved.displayLabel}</Label>
                <p className="text-sm min-h-[1.5rem]">{resolvedRef}</p>
            </div>
        );
    }

    // Money view
    if (resolvedUiType === "money-view" || resolvedUiType === "money-input") {
        return <MoneyViewRenderer resolved={resolved} value={value} />;
    }

    // UUID view: monospace + copy
    if (resolvedUiType === "uuid-view") {
        return <UuidViewRenderer resolved={resolved} value={value} />;
    }

    // Enum view: badge with optional color
    if (resolvedUiType === "select" || resolvedUiType === "multi-select") {
        if (resolved.field.dataType === "enum" || resolved.effectiveEnumConfig) {
            return <EnumViewRenderer resolved={resolved} value={value} />;
        }
    }

    // Generic view
    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">{resolved.displayLabel}</Label>
            <p className="text-sm min-h-[1.5rem]">
                {formatDisplayValue(resolved, value)}
            </p>
        </div>
    );
}

// ============================================================================
// Edit Mode Rendering
// ============================================================================

function renderEditMode(
    resolved: ResolvedFieldMeta,
    value: unknown,
    resolvedRef?: string,
    onChange?: (fieldName: string, value: unknown) => void,
    viewMode?: ViewMode,
): React.ReactNode {
    switch (resolved.resolvedUiType) {
        case "text":
            return <TextRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "textarea":
            return <TextareaRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "number":
            return <NumberRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "money-input":
            return <MoneyInputRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "toggle":
            return <ToggleRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "tristate-select":
            return <TristateSelectRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "select":
            return <SelectRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "multi-select":
            return <MultiSelectRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "datepicker":
            return <DatePickerRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "datetimepicker":
            return <DateTimePickerRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "reference-picker":
            return <ReferencePickerRenderer resolved={resolved} value={value} resolvedRef={resolvedRef} viewMode={viewMode} onChange={onChange} />;

        case "reference-multi-picker":
            return <ReferenceMultiPickerRenderer resolved={resolved} value={value} resolvedRef={resolvedRef} onChange={onChange} />;

        case "json-editor":
            return <JsonEditorRenderer resolved={resolved} value={value} onChange={onChange} />;

        case "uuid-view":
            return <UuidViewRenderer resolved={resolved} value={value} />;

        default:
            return <TextRenderer resolved={resolved} value={value} onChange={onChange} />;
    }
}

// ============================================================================
// Read-Only Field (with reason tooltip)
// ============================================================================

function ReadOnlyField({
    resolved,
    value,
    reason,
    resolvedRef,
}: {
    resolved: ResolvedFieldMeta;
    value: unknown;
    reason: ReadOnlyReason;
    resolvedRef?: string;
}) {
    return (
        <div className="space-y-1">
            <FieldLabel label={resolved.displayLabel} readOnlyReason={reason} />
            <p className="text-sm min-h-[1.5rem] text-muted-foreground">
                {resolvedRef ?? formatDisplayValue(resolved, value)}
            </p>
        </div>
    );
}

// ============================================================================
// Field Label with optional lock icon + tooltip
// ============================================================================

function FieldLabel({
    label,
    readOnlyReason,
}: {
    label: string;
    readOnlyReason?: ReadOnlyReason;
}) {
    if (!readOnlyReason) {
        return <Label className="text-muted-foreground text-xs">{label}</Label>;
    }

    const reasonLabel = READ_ONLY_REASON_LABELS[readOnlyReason] ?? "Read-only";

    return (
        <div className="flex items-center gap-1">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            <span title={reasonLabel} className="inline-flex">
                <Lock className="size-3 text-muted-foreground/60" />
            </span>
        </div>
    );
}

// ============================================================================
// Display Value Formatting
// ============================================================================

function formatDisplayValue(resolved: ResolvedFieldMeta, value: unknown): React.ReactNode {
    if (value == null) return "\u2014";

    const { field } = resolved;
    const dataType = field.dataType;

    // Numeric types
    if (isNumericType(dataType)) {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        if (dataType === "decimal") {
            const scale = resolved.effectiveConstraints.scale ?? 2;
            return num.toLocaleString(undefined, {
                minimumFractionDigits: scale,
                maximumFractionDigits: scale,
            });
        }
        return num.toLocaleString();
    }

    // Date types
    if (isDateLikeType(dataType)) {
        try {
            const date = new Date(String(value));
            if (isNaN(date.getTime())) return String(value);
            if (dataType === "datetime") {
                return date.toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                });
            }
            return date.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return String(value);
        }
    }

    // Boolean
    if (dataType === "boolean") {
        return (
            <Badge variant={value ? "default" : "secondary"}>
                {value ? "Yes" : "No"}
            </Badge>
        );
    }

    // JSON
    if (dataType === "json") {
        const json = JSON.stringify(value);
        return (
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {json.slice(0, 80)}
                {json.length > 80 ? "..." : ""}
            </code>
        );
    }

    return String(value);
}
