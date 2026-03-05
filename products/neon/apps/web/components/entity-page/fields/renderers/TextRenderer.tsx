"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface TextRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

/**
 * Text input renderer.
 * Handles format-driven specialization via inputProps (type="email", "url", "tel", "password").
 */
export function TextRenderer({ resolved, value, onChange }: TextRendererProps) {
    const { field, inputProps, displayLabel } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                type={(inputProps.type as string) ?? "text"}
                defaultValue={value != null ? String(value) : ""}
                onChange={(e) => onChange?.(fieldId, e.target.value || null)}
                minLength={inputProps.minLength as number | undefined}
                maxLength={inputProps.maxLength as number | undefined}
                pattern={inputProps.pattern as string | undefined}
                placeholder={resolved.effectiveUiHint.placeholder}
            />
            {resolved.displayHelpText && (
                <p className="text-xs text-muted-foreground">{resolved.displayHelpText}</p>
            )}
        </div>
    );
}
