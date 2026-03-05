"use client";

import { Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface JsonEditorRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

export function JsonEditorRenderer({ resolved, value, onChange }: JsonEditorRendererProps) {
    const { field, displayLabel } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <textarea
                id={fieldId}
                name={fieldId}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                defaultValue={value != null ? JSON.stringify(value, null, 2) : ""}
                onChange={(e) => {
                    try {
                        onChange?.(fieldId, JSON.parse(e.target.value));
                    } catch {
                        // Invalid JSON — don't update
                    }
                }}
            />
        </div>
    );
}
