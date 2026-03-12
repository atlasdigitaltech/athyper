"use client";

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ConditionTreeBuilder } from "../validation/ConditionTreeBuilder";

import type { ConditionGroup } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ─── Types ──────────────────────────────────────────────────

export interface ConditionalDefault {
    id: string;
    label: string;
    when: ConditionGroup;
    value: string;
}

export interface DefaultValueConfig {
    /** Static default (always applied when no condition matches) */
    staticValue: string;
    /** Conditional defaults evaluated in order */
    conditionals: ConditionalDefault[];
}

interface DefaultValueEditorProps {
    dataType: string;
    value: DefaultValueConfig;
    onChange: (config: DefaultValueConfig) => void;
    /** Enum values for select */
    enumValues?: string[];
    /** Sibling field names for condition builder */
    fields?: string[];
}

// ─── Helpers ────────────────────────────────────────────────

const EMPTY_CONDITION: ConditionGroup = {
    operator: "and",
    conditions: [{ field: "", operator: "eq", value: "" }],
};

function summarizeCondition(group: ConditionGroup, maxItems = 2): string {
    const parts: string[] = [];
    for (const c of group.conditions) {
        if ("field" in c && !("conditions" in c)) {
            const leaf = c as { field: string; operator: string; value?: unknown };
            const val = leaf.value !== undefined && leaf.value !== "" ? ` ${leaf.value}` : "";
            parts.push(`${leaf.field} ${leaf.operator}${val}`);
        } else {
            parts.push("(group)");
        }
    }
    const op = ` ${(group.operator ?? "and").toUpperCase()} `;
    if (parts.length <= maxItems) return parts.join(op);
    return parts.slice(0, maxItems).join(op) + ` +${parts.length - maxItems} more`;
}

// ─── Type-Aware Value Input ─────────────────────────────────

function ValueInput({
    dataType,
    value,
    onChange,
    enumValues,
    placeholder,
}: {
    dataType: string;
    value: string;
    onChange: (v: string) => void;
    enumValues?: string[];
    placeholder?: string;
}) {
    switch (dataType) {
        case "boolean":
            return (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={value === "true"}
                        onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
                    />
                    <span className="text-xs text-muted-foreground font-mono">
                        {value === "true" ? "true" : "false"}
                    </span>
                </div>
            );

        case "integer":
        case "number":
        case "decimal":
            return (
                <Input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? "0"}
                    className="h-8 text-xs font-mono"
                    step={dataType === "integer" ? 1 : "any"}
                />
            );

        case "date":
            return (
                <Input
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 text-xs font-mono"
                />
            );

        case "datetime":
            return (
                <Input
                    type="datetime-local"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 text-xs font-mono"
                />
            );

        case "enum":
            if (enumValues && enumValues.length > 0) {
                return (
                    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select value..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">No default</SelectItem>
                            {enumValues.map((ev) => (
                                <SelectItem key={ev} value={ev} className="text-xs font-mono">
                                    {ev}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                );
            }
            return (
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? "Enter enum value..."}
                    className="h-8 text-xs font-mono"
                />
            );

        default:
            return (
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? 'e.g., "active" or 0'}
                    className="h-8 text-xs font-mono"
                />
            );
    }
}

// ─── Component ──────────────────────────────────────────────

export function DefaultValueEditor({
    dataType,
    value,
    onChange,
    enumValues,
    fields,
}: DefaultValueEditorProps) {
    const [conditionalsExpanded, setConditionalsExpanded] = useState(
        value.conditionals.length > 0,
    );
    const [editingIdx, setEditingIdx] = useState<number | null>(null);

    const updateStatic = useCallback(
        (v: string) => onChange({ ...value, staticValue: v }),
        [value, onChange],
    );

    const addConditional = useCallback(() => {
        const newRule: ConditionalDefault = {
            id: crypto.randomUUID(),
            label: "",
            when: { ...EMPTY_CONDITION, conditions: [{ field: "", operator: "eq", value: "" }] },
            value: "",
        };
        onChange({ ...value, conditionals: [...value.conditionals, newRule] });
        setEditingIdx(value.conditionals.length);
        setConditionalsExpanded(true);
    }, [value, onChange]);

    const removeConditional = useCallback(
        (id: string) => {
            onChange({
                ...value,
                conditionals: value.conditionals.filter((c) => c.id !== id),
            });
            setEditingIdx(null);
        },
        [value, onChange],
    );

    const updateConditional = useCallback(
        (id: string, patch: Partial<ConditionalDefault>) => {
            onChange({
                ...value,
                conditionals: value.conditionals.map((c) =>
                    c.id === id ? { ...c, ...patch } : c,
                ),
            });
        },
        [value, onChange],
    );

    return (
        <div className="space-y-3">
            {/* Static default */}
            <div className="space-y-1.5">
                <Label className="text-sm">Default Value</Label>
                <ValueInput
                    dataType={dataType}
                    value={value.staticValue}
                    onChange={updateStatic}
                    enumValues={enumValues}
                />
                <p className="text-xs text-muted-foreground">
                    Fallback value when no conditional rule matches.
                </p>
            </div>

            {/* Conditional defaults */}
            <div className="space-y-2">
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setConditionalsExpanded(!conditionalsExpanded)}
                >
                    {conditionalsExpanded ? (
                        <ChevronDown className="size-3.5" />
                    ) : (
                        <ChevronRight className="size-3.5" />
                    )}
                    Conditional Defaults
                    {value.conditionals.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                            {value.conditionals.length}
                        </Badge>
                    )}
                </button>

                {conditionalsExpanded && (
                    <div className="space-y-2 pl-1">
                        {value.conditionals.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                                No conditional defaults. The static default above always applies.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {value.conditionals.map((cd, idx) => (
                                    <div
                                        key={cd.id}
                                        className="rounded-md border bg-muted/30 p-2.5 space-y-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            {/* Label */}
                                            <Input
                                                value={cd.label}
                                                onChange={(e) =>
                                                    updateConditional(cd.id, { label: e.target.value })
                                                }
                                                placeholder="Rule label (optional)"
                                                className="h-7 text-xs flex-1"
                                            />
                                            {/* Toggle expand */}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs px-2"
                                                onClick={() =>
                                                    setEditingIdx(editingIdx === idx ? null : idx)
                                                }
                                            >
                                                {editingIdx === idx ? "Collapse" : "Edit"}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-destructive"
                                                onClick={() => removeConditional(cd.id)}
                                            >
                                                <Trash2 className="size-3" />
                                            </Button>
                                        </div>

                                        {editingIdx === idx ? (
                                            <>
                                                {/* Condition builder */}
                                                <div className="space-y-1">
                                                    <p className="text-xs font-medium text-muted-foreground">
                                                        When
                                                    </p>
                                                    <ConditionTreeBuilder
                                                        value={cd.when}
                                                        onChange={(w) =>
                                                            updateConditional(cd.id, { when: w })
                                                        }
                                                        fields={fields}
                                                        maxDepth={2}
                                                    />
                                                </div>

                                                {/* Value */}
                                                <div className="space-y-1">
                                                    <p className="text-xs font-medium text-muted-foreground">
                                                        Then default to
                                                    </p>
                                                    <ValueInput
                                                        dataType={dataType}
                                                        value={cd.value}
                                                        onChange={(v) =>
                                                            updateConditional(cd.id, { value: v })
                                                        }
                                                        enumValues={enumValues}
                                                        placeholder="Conditional default value"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="truncate">
                                                    When {summarizeCondition(cd.when)}
                                                </span>
                                                <span className="shrink-0">→</span>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] font-mono shrink-0"
                                                >
                                                    {cd.value || "(empty)"}
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={addConditional}
                        >
                            <Plus className="mr-1 size-3" />
                            Add Conditional Default
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
