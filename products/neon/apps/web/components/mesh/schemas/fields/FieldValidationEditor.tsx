"use client";

import { ChevronDown, ChevronRight, Code2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConditionTreeBuilder } from "../validation/ConditionTreeBuilder";

import type { ConditionGroup } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ──────────────────────────────────────────────────

export interface ValidationConfig {
    // String constraints
    minLength?: number | null;
    maxLength?: number | null;
    pattern?: string | null;
    patternFlags?: string | null;
    // Numeric constraints
    min?: number | null;
    max?: number | null;
    step?: number | null;
    // Enum constraints
    allowedValues?: string[];
    // Date constraints
    minDate?: string | null;
    maxDate?: string | null;
    // Conditional validation
    conditionalRules?: ConditionalValidation[];
    // Raw JSON overflow (extra keys we don't model yet)
    _raw?: Record<string, unknown>;
}

export interface ConditionalValidation {
    id: string;
    name: string;
    when: ConditionGroup;
    message?: string;
}

interface FieldValidationEditorProps {
    dataType: string;
    /** JSON string (current form value) */
    value: string;
    onChange: (json: string) => void;
    /** Sibling field names for condition builder */
    fields?: string[];
}

// ─── Helpers ────────────────────────────────────────────────

function parseValidationJson(json: string): ValidationConfig {
    if (!json.trim()) return {};
    try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        return {
            minLength: typeof parsed.minLength === "number" ? parsed.minLength : null,
            maxLength: typeof parsed.maxLength === "number" ? parsed.maxLength : null,
            pattern: typeof parsed.pattern === "string" ? parsed.pattern : null,
            patternFlags: typeof parsed.patternFlags === "string" ? parsed.patternFlags : null,
            min: typeof parsed.min === "number" ? parsed.min : null,
            max: typeof parsed.max === "number" ? parsed.max : null,
            step: typeof parsed.step === "number" ? parsed.step : null,
            allowedValues: Array.isArray(parsed.allowedValues)
                ? (parsed.allowedValues as string[])
                : undefined,
            minDate: typeof parsed.minDate === "string" ? parsed.minDate : null,
            maxDate: typeof parsed.maxDate === "string" ? parsed.maxDate : null,
            conditionalRules: Array.isArray(parsed.conditionalRules)
                ? (parsed.conditionalRules as ConditionalValidation[])
                : undefined,
            _raw: parsed,
        };
    } catch {
        return {};
    }
}

function serializeValidation(config: ValidationConfig): string {
    const obj: Record<string, unknown> = {};

    // Preserve unknown keys from raw
    if (config._raw) {
        for (const [k, v] of Object.entries(config._raw)) {
            if (
                ![
                    "minLength", "maxLength", "pattern", "patternFlags",
                    "min", "max", "step",
                    "allowedValues",
                    "minDate", "maxDate",
                    "conditionalRules",
                ].includes(k)
            ) {
                obj[k] = v;
            }
        }
    }

    if (config.minLength != null) obj.minLength = config.minLength;
    if (config.maxLength != null) obj.maxLength = config.maxLength;
    if (config.pattern) obj.pattern = config.pattern;
    if (config.patternFlags) obj.patternFlags = config.patternFlags;
    if (config.min != null) obj.min = config.min;
    if (config.max != null) obj.max = config.max;
    if (config.step != null) obj.step = config.step;
    if (config.allowedValues && config.allowedValues.length > 0) obj.allowedValues = config.allowedValues;
    if (config.minDate) obj.minDate = config.minDate;
    if (config.maxDate) obj.maxDate = config.maxDate;
    if (config.conditionalRules && config.conditionalRules.length > 0) {
        obj.conditionalRules = config.conditionalRules;
    }

    return Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "";
}

// ─── Number Input Helper ────────────────────────────────────

function NumInput({
    label,
    value,
    onChange,
    placeholder,
    step,
}: {
    label: string;
    value: number | null | undefined;
    onChange: (v: number | null) => void;
    placeholder?: string;
    step?: number;
}) {
    return (
        <div className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
                type="number"
                value={value ?? ""}
                onChange={(e) =>
                    onChange(e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder={placeholder}
                step={step}
                className="h-8 text-xs font-mono"
            />
        </div>
    );
}

// ─── Component ──────────────────────────────────────────────

export function FieldValidationEditor({
    dataType,
    value,
    onChange,
    fields,
}: FieldValidationEditorProps) {
    const [config, setConfig] = useState<ValidationConfig>(() =>
        parseValidationJson(value),
    );
    const [showRaw, setShowRaw] = useState(false);
    const [rawText, setRawText] = useState(value);
    const [condExpanded, setCondExpanded] = useState(false);
    const [editingCondIdx, setEditingCondIdx] = useState<number | null>(null);

    // Sync from parent when value changes externally
    useEffect(() => {
        const parsed = parseValidationJson(value);
        setConfig(parsed);
        setRawText(value);
    }, [value]);

    // Commit config changes to parent
    const commitConfig = useCallback(
        (updated: ValidationConfig) => {
            setConfig(updated);
            const json = serializeValidation(updated);
            setRawText(json);
            onChange(json);
        },
        [onChange],
    );

    // Commit raw JSON edits
    const commitRaw = useCallback(
        (text: string) => {
            setRawText(text);
            onChange(text);
            try {
                setConfig(parseValidationJson(text));
            } catch {
                // invalid JSON, keep raw text
            }
        },
        [onChange],
    );

    const showStringConstraints = ["string", "text"].includes(dataType);
    const showNumericConstraints = ["number", "integer", "decimal"].includes(dataType);
    const showDateConstraints = ["date", "datetime"].includes(dataType);
    const showPatternField = ["string", "text", "number", "integer", "decimal"].includes(dataType);

    const hasAnyConstraint = useMemo(() => {
        return (
            config.minLength != null ||
            config.maxLength != null ||
            config.pattern != null ||
            config.min != null ||
            config.max != null ||
            config.step != null ||
            config.minDate != null ||
            config.maxDate != null ||
            (config.conditionalRules && config.conditionalRules.length > 0)
        );
    }, [config]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm">Validation Rules</Label>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowRaw(!showRaw)}
                >
                    <Code2 className="size-3" />
                    {showRaw ? "Visual" : "JSON"}
                </Button>
            </div>

            {showRaw ? (
                /* ── Raw JSON editor ─────────────────────────── */
                <div className="space-y-1">
                    <Textarea
                        value={rawText}
                        onChange={(e) => commitRaw(e.target.value)}
                        placeholder='{"minLength": 1, "maxLength": 255}'
                        rows={5}
                        className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                        Edit raw JSON. Switch to Visual to use the structured editor.
                    </p>
                </div>
            ) : (
                /* ── Visual editor ───────────────────────────── */
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    {/* String constraints */}
                    {showStringConstraints && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                String Constraints
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <NumInput
                                    label="Min Length"
                                    value={config.minLength}
                                    onChange={(v) =>
                                        commitConfig({ ...config, minLength: v })
                                    }
                                    placeholder="0"
                                    step={1}
                                />
                                <NumInput
                                    label="Max Length"
                                    value={config.maxLength}
                                    onChange={(v) =>
                                        commitConfig({ ...config, maxLength: v })
                                    }
                                    placeholder="255"
                                    step={1}
                                />
                            </div>
                        </div>
                    )}

                    {/* Numeric constraints */}
                    {showNumericConstraints && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                Numeric Constraints
                            </p>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <NumInput
                                    label="Min"
                                    value={config.min}
                                    onChange={(v) =>
                                        commitConfig({ ...config, min: v })
                                    }
                                    placeholder="No minimum"
                                />
                                <NumInput
                                    label="Max"
                                    value={config.max}
                                    onChange={(v) =>
                                        commitConfig({ ...config, max: v })
                                    }
                                    placeholder="No maximum"
                                />
                                <NumInput
                                    label="Step"
                                    value={config.step}
                                    onChange={(v) =>
                                        commitConfig({ ...config, step: v })
                                    }
                                    placeholder="Any"
                                />
                            </div>
                        </div>
                    )}

                    {/* Date constraints */}
                    {showDateConstraints && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                Date Constraints
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Earliest Date</Label>
                                    <Input
                                        type={dataType === "datetime" ? "datetime-local" : "date"}
                                        value={config.minDate ?? ""}
                                        onChange={(e) =>
                                            commitConfig({
                                                ...config,
                                                minDate: e.target.value || null,
                                            })
                                        }
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Latest Date</Label>
                                    <Input
                                        type={dataType === "datetime" ? "datetime-local" : "date"}
                                        value={config.maxDate ?? ""}
                                        onChange={(e) =>
                                            commitConfig({
                                                ...config,
                                                maxDate: e.target.value || null,
                                            })
                                        }
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pattern (regex) */}
                    {showPatternField && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                Pattern (Regex)
                            </p>
                            <div className="grid gap-3 sm:grid-cols-4">
                                <div className="sm:col-span-3 space-y-1">
                                    <Label className="text-xs">Pattern</Label>
                                    <Input
                                        value={config.pattern ?? ""}
                                        onChange={(e) =>
                                            commitConfig({
                                                ...config,
                                                pattern: e.target.value || null,
                                            })
                                        }
                                        placeholder="^[A-Z]{2,4}-\d+$"
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Flags</Label>
                                    <Input
                                        value={config.patternFlags ?? ""}
                                        onChange={(e) =>
                                            commitConfig({
                                                ...config,
                                                patternFlags: e.target.value || null,
                                            })
                                        }
                                        placeholder="i"
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* No constraints message */}
                    {!showStringConstraints &&
                        !showNumericConstraints &&
                        !showDateConstraints &&
                        !showPatternField && (
                            <p className="text-xs text-muted-foreground italic">
                                No structured constraints available for this data type.
                                Use the JSON editor for custom rules.
                            </p>
                        )}

                    <Separator />

                    {/* Conditional validation rules */}
                    <div className="space-y-2">
                        <button
                            type="button"
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setCondExpanded(!condExpanded)}
                        >
                            {condExpanded ? (
                                <ChevronDown className="size-3.5" />
                            ) : (
                                <ChevronRight className="size-3.5" />
                            )}
                            Conditional Validation
                            {(config.conditionalRules?.length ?? 0) > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="ml-1 text-[10px] px-1.5 py-0"
                                >
                                    {config.conditionalRules!.length}
                                </Badge>
                            )}
                        </button>

                        {condExpanded && (
                            <div className="space-y-2 pl-1">
                                {(!config.conditionalRules ||
                                    config.conditionalRules.length === 0) ? (
                                    <p className="text-xs text-muted-foreground italic">
                                        No conditional validation rules. Add rules that
                                        validate this field based on other field values.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {config.conditionalRules.map((rule, idx) => (
                                            <div
                                                key={rule.id}
                                                className="rounded-md border bg-background p-2.5 space-y-2"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={rule.name}
                                                        onChange={(e) => {
                                                            const updated = [
                                                                ...config.conditionalRules!,
                                                            ];
                                                            updated[idx] = {
                                                                ...updated[idx],
                                                                name: e.target.value,
                                                            };
                                                            commitConfig({
                                                                ...config,
                                                                conditionalRules: updated,
                                                            });
                                                        }}
                                                        placeholder="Rule name"
                                                        className="h-7 text-xs flex-1"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs px-2"
                                                        onClick={() =>
                                                            setEditingCondIdx(
                                                                editingCondIdx === idx
                                                                    ? null
                                                                    : idx,
                                                            )
                                                        }
                                                    >
                                                        {editingCondIdx === idx
                                                            ? "Collapse"
                                                            : "Edit"}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-destructive"
                                                        onClick={() => {
                                                            commitConfig({
                                                                ...config,
                                                                conditionalRules:
                                                                    config.conditionalRules!.filter(
                                                                        (_, i) => i !== idx,
                                                                    ),
                                                            });
                                                        }}
                                                    >
                                                        ×
                                                    </Button>
                                                </div>

                                                {editingCondIdx === idx && (
                                                    <>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                When
                                                            </p>
                                                            <ConditionTreeBuilder
                                                                value={rule.when}
                                                                onChange={(w) => {
                                                                    const updated = [
                                                                        ...config.conditionalRules!,
                                                                    ];
                                                                    updated[idx] = {
                                                                        ...updated[idx],
                                                                        when: w,
                                                                    };
                                                                    commitConfig({
                                                                        ...config,
                                                                        conditionalRules:
                                                                            updated,
                                                                    });
                                                                }}
                                                                fields={fields}
                                                                maxDepth={2}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs">
                                                                Error Message
                                                            </Label>
                                                            <Input
                                                                value={rule.message ?? ""}
                                                                onChange={(e) => {
                                                                    const updated = [
                                                                        ...config.conditionalRules!,
                                                                    ];
                                                                    updated[idx] = {
                                                                        ...updated[idx],
                                                                        message:
                                                                            e.target.value ||
                                                                            undefined,
                                                                    };
                                                                    commitConfig({
                                                                        ...config,
                                                                        conditionalRules:
                                                                            updated,
                                                                    });
                                                                }}
                                                                placeholder="Custom error message..."
                                                                className="h-7 text-xs"
                                                            />
                                                        </div>
                                                    </>
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
                                    onClick={() => {
                                        const newRule: ConditionalValidation = {
                                            id: crypto.randomUUID(),
                                            name: "",
                                            when: {
                                                operator: "and",
                                                conditions: [
                                                    {
                                                        field: "",
                                                        operator: "eq",
                                                        value: "",
                                                    },
                                                ],
                                            },
                                        };
                                        commitConfig({
                                            ...config,
                                            conditionalRules: [
                                                ...(config.conditionalRules ?? []),
                                                newRule,
                                            ],
                                        });
                                        setEditingCondIdx(
                                            (config.conditionalRules?.length ?? 0),
                                        );
                                        setCondExpanded(true);
                                    }}
                                >
                                    + Add Conditional Rule
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
