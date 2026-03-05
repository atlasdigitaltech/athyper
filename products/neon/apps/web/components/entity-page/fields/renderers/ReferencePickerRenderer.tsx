"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface ReferencePickerRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    resolvedRef?: string;
    onChange?: (fieldName: string, value: unknown) => void;
}

/**
 * Reference picker renderer.
 *
 * Currently renders as a text input for the UUID with resolved display name.
 * Will be upgraded to a typeahead picker with server-side search in Phase 3.
 */
export function ReferencePickerRenderer({ resolved, value, resolvedRef, onChange }: ReferencePickerRendererProps) {
    const { field, displayLabel } = resolved;
    const fieldId = field.columnName;

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
