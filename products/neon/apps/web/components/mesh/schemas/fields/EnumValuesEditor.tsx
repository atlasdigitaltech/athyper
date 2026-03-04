"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────

interface EnumValuesEditorProps {
    values: string[];
    onChange: (values: string[]) => void;
}

// ─── Component ───────────────────────────────────────────────

export function EnumValuesEditor({ values, onChange }: EnumValuesEditorProps) {
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
