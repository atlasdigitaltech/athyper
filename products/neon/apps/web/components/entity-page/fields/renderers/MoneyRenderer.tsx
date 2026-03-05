"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface MoneyRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

/**
 * Money field renderer.
 *
 * Edit mode (money-input): Masked number input with correct scale.
 * View mode (money-view): Formatted currency text with symbol.
 *
 * Uses effectiveMoneyConfig for rounding, scale, and currency resolution.
 */
export function MoneyInputRenderer({ resolved, value, onChange }: MoneyRendererProps) {
    const { field, displayLabel, effectiveMoneyConfig, effectiveUiHint } = resolved;
    const fieldId = field.columnName;

    const scale = effectiveMoneyConfig?.scaleMode === "fixed"
        ? (effectiveMoneyConfig.fixedScale ?? 2)
        : 2; // Default; in production, resolve from currency minor units
    const step = String(Math.pow(10, -scale));

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                type="number"
                defaultValue={value != null ? String(value) : ""}
                onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    onChange?.(fieldId, isNaN(num) ? null : num);
                }}
                step={step}
                placeholder={effectiveUiHint.placeholder ?? "0.00"}
            />
            {resolved.displayHelpText && (
                <p className="text-xs text-muted-foreground">{resolved.displayHelpText}</p>
            )}
        </div>
    );
}

export function MoneyViewRenderer({ resolved, value }: MoneyRendererProps) {
    const { displayLabel, effectiveMoneyConfig } = resolved;

    if (value == null) {
        return (
            <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
                <p className="text-sm min-h-[1.5rem]">{"\u2014"}</p>
            </div>
        );
    }

    const num = Number(value);
    const scale = effectiveMoneyConfig?.scaleMode === "fixed"
        ? (effectiveMoneyConfig.fixedScale ?? 2)
        : 2;

    // Format with locale-aware number formatting
    const formatted = isNaN(num)
        ? String(value)
        : num.toLocaleString(undefined, {
            minimumFractionDigits: scale,
            maximumFractionDigits: scale,
        });

    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
            <p className="text-sm min-h-[1.5rem] tabular-nums">{formatted}</p>
        </div>
    );
}
