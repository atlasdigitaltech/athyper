"use client";

import { Input, Label } from "@neon/ui";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface DatePickerRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

export function DatePickerRenderer({ resolved, value, onChange }: DatePickerRendererProps) {
    const { field, displayLabel } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                type="date"
                defaultValue={formatDateForInput(value)}
                onChange={(e) => onChange?.(fieldId, e.target.value || null)}
            />
        </div>
    );
}

export function DateTimePickerRenderer({ resolved, value, onChange }: DatePickerRendererProps) {
    const { field, displayLabel } = resolved;
    const fieldId = field.columnName;

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Input
                id={fieldId}
                name={fieldId}
                type="datetime-local"
                defaultValue={formatDateTimeForInput(value)}
                onChange={(e) => onChange?.(fieldId, e.target.value || null)}
            />
        </div>
    );
}

function formatDateForInput(value: unknown): string {
    if (value == null) return "";
    try {
        const date = new Date(String(value));
        if (isNaN(date.getTime())) return "";
        return date.toISOString().split("T")[0];
    } catch {
        return "";
    }
}

function formatDateTimeForInput(value: unknown): string {
    if (value == null) return "";
    try {
        const date = new Date(String(value));
        if (isNaN(date.getTime())) return "";
        return date.toISOString().slice(0, 16);
    } catch {
        return "";
    }
}
