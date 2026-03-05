"use client";

import { Input, Label } from "@neon/ui";
import { Badge } from "@neon/ui";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";

interface SelectRendererProps {
    resolved: ResolvedFieldMeta;
    value: unknown;
    onChange?: (fieldName: string, value: unknown) => void;
}

/** Single-value select for enums */
export function SelectRenderer({ resolved, value, onChange }: SelectRendererProps) {
    const { field, displayLabel, effectiveEnumConfig } = resolved;
    const fieldId = field.columnName;
    const options = effectiveEnumConfig?.values ?? [];

    if (options.length === 0) {
        // Fallback: text input when no options defined
        return (
            <div className="space-y-1">
                <Label htmlFor={fieldId}>{displayLabel}</Label>
                <Input
                    id={fieldId}
                    name={fieldId}
                    defaultValue={value != null ? String(value) : ""}
                    onChange={(e) => onChange?.(fieldId, e.target.value || null)}
                />
            </div>
        );
    }

    // Group options by group field if present
    const hasGroups = options.some((opt) => opt.group);

    if (hasGroups) {
        const groups = new Map<string, typeof options>();
        const ungrouped: typeof options = [];
        for (const opt of options) {
            if (opt.group) {
                const list = groups.get(opt.group) ?? [];
                list.push(opt);
                groups.set(opt.group, list);
            } else {
                ungrouped.push(opt);
            }
        }

        return (
            <div className="space-y-1">
                <Label htmlFor={fieldId}>{displayLabel}</Label>
                <Select
                    defaultValue={value != null ? String(value) : undefined}
                    onValueChange={(v) => onChange?.(fieldId, v)}
                >
                    <SelectTrigger id={fieldId}>
                        <SelectValue placeholder={`Select ${displayLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {ungrouped.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {renderOptionLabel(opt)}
                            </SelectItem>
                        ))}
                        {Array.from(groups.entries()).map(([groupName, groupOpts]) => (
                            <SelectGroup key={groupName}>
                                <SelectLabel>{groupName}</SelectLabel>
                                {groupOpts.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {renderOptionLabel(opt)}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <Select
                defaultValue={value != null ? String(value) : undefined}
                onValueChange={(v) => onChange?.(fieldId, v)}
            >
                <SelectTrigger id={fieldId}>
                    <SelectValue placeholder={`Select ${displayLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {renderOptionLabel(opt)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

/** View-mode enum display with badge + optional color */
export function EnumViewRenderer({ resolved, value }: SelectRendererProps) {
    const { displayLabel, effectiveEnumConfig } = resolved;

    if (value == null) {
        return (
            <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
                <p className="text-sm min-h-[1.5rem]">{"\u2014"}</p>
            </div>
        );
    }

    const strValue = String(value);
    const enumEntry = effectiveEnumConfig?.values.find((v) => v.value === strValue);
    const displayText = enumEntry?.label ?? strValue;

    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
            <div className="min-h-[1.5rem]">
                <Badge
                    variant="outline"
                    style={enumEntry?.color ? { borderColor: enumEntry.color, color: enumEntry.color } : undefined}
                >
                    {displayText}
                </Badge>
            </div>
        </div>
    );
}

/** Multi-select placeholder (chips/tags style) */
export function MultiSelectRenderer({ resolved, value, onChange }: SelectRendererProps) {
    const { field, displayLabel, effectiveEnumConfig } = resolved;
    const fieldId = field.columnName;
    const options = effectiveEnumConfig?.values ?? [];
    const selectedValues = Array.isArray(value) ? value.map(String) : [];

    return (
        <div className="space-y-1">
            <Label htmlFor={fieldId}>{displayLabel}</Label>
            <div className="flex flex-wrap gap-1 min-h-[2.5rem] rounded-md border border-input bg-background px-3 py-2">
                {options.map((opt) => {
                    const isSelected = selectedValues.includes(opt.value);
                    return (
                        <Badge
                            key={opt.value}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                                const next = isSelected
                                    ? selectedValues.filter((v) => v !== opt.value)
                                    : [...selectedValues, opt.value];
                                onChange?.(fieldId, next);
                            }}
                        >
                            {opt.label ?? opt.value}
                        </Badge>
                    );
                })}
            </div>
        </div>
    );
}

function renderOptionLabel(opt: { value: string; label?: string; color?: string }) {
    if (opt.color) {
        return (
            <span className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: opt.color }} />
                {opt.label ?? opt.value}
            </span>
        );
    }
    return opt.label ?? opt.value;
}
