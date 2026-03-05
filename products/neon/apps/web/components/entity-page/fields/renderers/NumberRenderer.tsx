"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface NumberRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

export function NumberRenderer({ resolved, value, onChange }: NumberRendererProps) {
    const { field, inputProps, displayLabel, effectiveUiHint } = resolved;
    const fieldId = field.columnName;
    const suffix = (inputProps.suffix as string) ?? (field.format === "percent" ? "%" : undefined);

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <div className="relative">
                <Input
                    id={fieldId}
                    name={fieldId}
                    type="number"
                    defaultValue={value != null ? String(value) : ""}
                    onChange={(e) => {
                        const num = parseFloat(e.target.value);
                        onChange?.(fieldId, isNaN(num) ? null : num);
                    }}
                    step={inputProps.step as string | undefined}
                    min={inputProps.min as number | undefined}
                    max={inputProps.max as number | undefined}
                    placeholder={effectiveUiHint.placeholder}
                    className={suffix ? "pr-8" : undefined}
                />
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {suffix}
                    </span>
                )}
            </div>
            {resolved.displayHelpText && (
                <p className="text-xs text-muted-foreground">{resolved.displayHelpText}</p>
            )}
        </div>
    );
}
