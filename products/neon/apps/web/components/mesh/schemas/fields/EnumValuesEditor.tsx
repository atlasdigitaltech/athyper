"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────

/** Structured enum value entry */
export interface EnumValueEntry {
    value: string;
    label?: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
    group?: string;
}

interface EnumValuesEditorProps {
    /** Legacy: simple string array (backward compat) */
    values: string[];
    onChange: (values: string[]) => void;
    /** Phase 3: structured enum values */
    structuredValues?: EnumValueEntry[];
    onStructuredChange?: (values: EnumValueEntry[]) => void;
    /** Source toggle: static values vs dynamic entity reference */
    source?: "static" | "dynamic";
    onSourceChange?: (source: "static" | "dynamic") => void;
}

// ─── Component ───────────────────────────────────────────────

export function EnumValuesEditor({
    values,
    onChange,
    structuredValues,
    onStructuredChange,
    source,
    onSourceChange,
}: EnumValuesEditorProps) {
    const isStructured = !!onStructuredChange;
    const entries = structuredValues ?? values.map((v) => ({ value: v }));

    // Use structured mode if handler provided
    if (isStructured) {
        return (
            <StructuredEnumEditor
                entries={entries}
                onChange={onStructuredChange!}
                source={source}
                onSourceChange={onSourceChange}
            />
        );
    }

    // Legacy simple mode
    return <SimpleEnumEditor values={values} onChange={onChange} />;
}

// ─── Simple Mode (legacy) ───────────────────────────────────

function SimpleEnumEditor({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
    const [input, setInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleAdd = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed) return;

        if (values.includes(trimmed)) {
            setError("Duplicate value");
            return;
        }

        onChange([...values, trimmed]);
        setInput("");
        setError(null);
    }, [input, values, onChange]);

    const handleRemove = useCallback(
        (value: string) => {
            onChange(values.filter((v) => v !== value));
        },
        [values, onChange],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
            }
        },
        [handleAdd],
    );

    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium">Enum Values</p>

            <div className="flex gap-2">
                <Input
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter a value..."
                    className="h-8 text-xs font-mono flex-1"
                />
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={handleAdd}
                    disabled={!input.trim()}
                >
                    <Plus className="mr-1 size-3" />
                    Add
                </Button>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {values.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {values.map((v) => (
                        <Badge key={v} variant="secondary" className="gap-1 text-xs font-mono pr-1">
                            {v}
                            <button
                                type="button"
                                title={`Remove ${v}`}
                                onClick={() => handleRemove(v)}
                                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">
                    No values defined. Add at least one enum value.
                </p>
            )}
        </div>
    );
}

// ─── Structured Mode (Phase 3) ──────────────────────────────

function StructuredEnumEditor({
    entries,
    onChange,
    source,
    onSourceChange,
}: {
    entries: EnumValueEntry[];
    onChange: (entries: EnumValueEntry[]) => void;
    source?: "static" | "dynamic";
    onSourceChange?: (source: "static" | "dynamic") => void;
}) {
    const [newValue, setNewValue] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleAdd = useCallback(() => {
        const trimmed = newValue.trim();
        if (!trimmed) return;
        if (entries.some((e) => e.value === trimmed)) {
            setError("Duplicate value");
            return;
        }
        onChange([...entries, { value: trimmed, sortOrder: entries.length }]);
        setNewValue("");
        setError(null);
    }, [newValue, entries, onChange]);

    const handleRemove = useCallback(
        (value: string) => onChange(entries.filter((e) => e.value !== value)),
        [entries, onChange],
    );

    const handleUpdate = useCallback(
        (index: number, patch: Partial<EnumValueEntry>) => {
            const updated = [...entries];
            updated[index] = { ...updated[index], ...patch };
            onChange(updated);
        },
        [entries, onChange],
    );

    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Enum Values</p>
                {onSourceChange && (
                    <div className="flex gap-1">
                        {(["static", "dynamic"] as const).map((s) => (
                            <button
                                key={s}
                                type="button"
                                className={`text-[10px] px-2 py-0.5 rounded ${
                                    source === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                }`}
                                onClick={() => onSourceChange(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Add new value */}
            <div className="flex gap-2">
                <Input
                    value={newValue}
                    onChange={(e) => { setNewValue(e.target.value); setError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    placeholder="Enter a value..."
                    className="h-8 text-xs font-mono flex-1"
                />
                <Button type="button" size="sm" variant="secondary" className="h-8" onClick={handleAdd} disabled={!newValue.trim()}>
                    <Plus className="mr-1 size-3" />Add
                </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}

            {/* Structured value rows */}
            {entries.length > 0 ? (
                <div className="space-y-2">
                    {entries.map((entry, index) => (
                        <div key={entry.value} className="flex items-start gap-2 rounded border bg-background p-2">
                            <GripVertical className="size-4 text-muted-foreground/40 mt-1.5 shrink-0 cursor-grab" />
                            <div className="flex-1 grid gap-2 sm:grid-cols-3">
                                <Input
                                    value={entry.value}
                                    className="h-7 text-xs font-mono"
                                    readOnly
                                    title="Value (immutable key)"
                                />
                                <Input
                                    value={entry.label ?? ""}
                                    onChange={(e) => handleUpdate(index, { label: e.target.value || undefined })}
                                    placeholder="Display label"
                                    className="h-7 text-xs"
                                />
                                <Input
                                    value={entry.group ?? ""}
                                    onChange={(e) => handleUpdate(index, { group: e.target.value || undefined })}
                                    placeholder="Group"
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {/* Color swatch */}
                                <input
                                    type="color"
                                    value={entry.color ?? "#888888"}
                                    onChange={(e) => handleUpdate(index, { color: e.target.value })}
                                    className="size-7 rounded border cursor-pointer"
                                    title="Badge color"
                                />
                                <button
                                    type="button"
                                    title={`Remove ${entry.value}`}
                                    onClick={() => handleRemove(entry.value)}
                                    className="p-1 rounded-sm hover:bg-destructive/10"
                                >
                                    <X className="size-3.5 text-muted-foreground" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">No values defined. Add at least one enum value.</p>
            )}
        </div>
    );
}
