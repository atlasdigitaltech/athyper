"use client";

import { Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface TextareaRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

export function TextareaRenderer({ resolved, value, onChange }: TextareaRendererProps) {
    const { field, displayLabel, effectiveUiHint } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <textarea
                id={fieldId}
                name={fieldId}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue={value != null ? String(value) : ""}
                onChange={(e) => onChange?.(fieldId, e.target.value || null)}
                placeholder={effectiveUiHint.placeholder}
            />
            {resolved.displayHelpText && (
                <p className="text-xs text-muted-foreground">{resolved.displayHelpText}</p>
            )}
        </div>
    );
}
