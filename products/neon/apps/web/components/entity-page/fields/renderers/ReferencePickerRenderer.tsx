"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";
import type { ViewMode } from "@/lib/entity-page/types";
import { LookupTypeahead } from "./LookupTypeahead";

interface ReferencePickerRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    resolvedRef?: string;
    viewMode?: ViewMode;
    onChange?: (fieldName: string, value: unknown) => void;
}

/**
 * Reference picker renderer.
 *
 * Uses LookupTypeahead when a target entity is resolved (via effectiveRefConfig).
 * Falls back to a plain UUID text input for unconfigured references.
 */
export function ReferencePickerRenderer({ resolved, value, resolvedRef, viewMode, onChange }: ReferencePickerRendererProps) {
    const { field, displayLabel, effectiveRefConfig, effectiveLookupProfile } = resolved;
    const fieldId = field.columnName;
    const targetEntity = effectiveRefConfig?.entity;

    // Use LookupTypeahead when we know the target entity
    if (targetEntity) {
        return (
            <LookupTypeahead
                entity={targetEntity}
                profile={effectiveLookupProfile}
                value={value != null ? String(value) : null}
                displayLabel={resolvedRef}
                fieldLabel={displayLabel}
                context={viewMode === "create" ? "create" : viewMode === "view" ? "view" : "edit"}
                readOnly={resolved.readOnly}
                onChange={(id) => onChange?.(fieldId, id)}
            />
        );
    }

    // Fallback: resolved label display (view-like)
    if (resolvedRef) {
        return (
            <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
                <p className="text-sm min-h-[1.5rem]">{resolvedRef}</p>
                {value != null && (
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{String(value)}</p>
                )}
            </div>
        );
    }

    // Fallback: plain UUID text input
    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                defaultValue={value != null ? String(value) : ""}
                onChange={(e) => onChange?.(fieldId, e.target.value || null)}
                placeholder="Enter ID..."
            />
        </div>
    );
}

/**
 * Reference multi-picker placeholder.
 * Will be upgraded to a multi-select chip picker in Phase 3.
 */
export function ReferenceMultiPickerRenderer({ resolved, value, onChange }: ReferencePickerRendererProps) {
    const { field, displayLabel } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                defaultValue={Array.isArray(value) ? value.join(", ") : (value != null ? String(value) : "")}
                onChange={(e) => {
                    const ids = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    onChange?.(fieldId, ids.length > 0 ? ids : null);
                }}
                placeholder="Enter IDs (comma-separated)..."
            />
        </div>
    );
}
