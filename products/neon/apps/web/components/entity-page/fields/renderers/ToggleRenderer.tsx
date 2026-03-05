"use client";

import { Label } from "@neon/ui";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface ToggleRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

/** Standard boolean toggle */
export function ToggleRenderer({ resolved, value, onChange }: ToggleRendererProps) {
    const fieldId = resolved.field.columnName;
    return (
        <div className="flex items-center justify-between space-y-0 py-1">
            <Label htmlFor={fieldId}>{resolved.displayLabel}</Label>
            <Switch
                id={fieldId}
                checked={value === true || value === "true"}
                onCheckedChange={(checked) => onChange?.(fieldId, checked)}
            />
        </div>
    );
}

/** Tri-state select for nullable booleans (Yes / No / —) */
export function TristateSelectRenderer({ resolved, value, onChange }: ToggleRendererProps) {
    const fieldId = resolved.field.columnName;

    const currentValue = value === true || value === "true"
        ? "true"
        : value === false || value === "false"
            ? "false"
            : "__null__";

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{resolved.displayLabel}</Label>
            <Select
                defaultValue={currentValue}
                onValueChange={(v) => {
                    if (v === "__null__") onChange?.(fieldId, null);
                    else onChange?.(fieldId, v === "true");
                }}
            >
                <SelectTrigger id={fieldId}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__null__">{"\u2014"}</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
