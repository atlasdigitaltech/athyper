"use client";

import { ChevronsUpDown, Check } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useEntityList } from "@/lib/schema-manager/use-entity-list";

// ─── Types ───────────────────────────────────────────────────

export interface LookupConfig {
    targetEntity: string;
    targetKey: string;
    onDelete: "restrict" | "cascade" | "set_null";
}

interface ReferenceFieldConfigProps {
    value: LookupConfig;
    onChange: (config: LookupConfig) => void;
}

const ON_DELETE_OPTIONS = [
    { value: "restrict", label: "Restrict", description: "Prevent deletion if referenced" },
    { value: "cascade", label: "Cascade", description: "Delete referencing records too" },
    { value: "set_null", label: "Set Null", description: "Nullify the reference on deletion" },
] as const;

// ─── Component ───────────────────────────────────────────────

export function ReferenceFieldConfig({ value, onChange }: ReferenceFieldConfigProps) {
    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium">Reference Configuration</p>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium">Target Entity</label>
                    <EntityPicker
                        value={value.targetEntity}
                        onChange={(targetEntity) => onChange({ ...value, targetEntity })}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium">Target Key</label>
                    <Input
                        value={value.targetKey}
                        onChange={(e) => onChange({ ...value, targetKey: e.target.value })}
                        placeholder="id"
                        className="h-9 font-mono text-xs"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium">On Delete</label>
                <Select
                    value={value.onDelete}
                    onValueChange={(v) => onChange({ ...value, onDelete: v as LookupConfig["onDelete"] })}
                >
                    <SelectTrigger className="h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ON_DELETE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                <span className="font-medium">{opt.label}</span>
                                <span className="ml-2 text-muted-foreground text-xs">{opt.description}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

// ─── Entity Picker ──────────────────────────────────────────

function EntityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { entities, loading } = useEntityList();
    const [open, setOpen] = useState(false);

    const handleSelect = useCallback(
        (entityName: string) => {
            onChange(entityName);
            setOpen(false);
        },
        [onChange],
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal h-9"
                >
                    <span className={value ? "font-mono text-xs" : "text-muted-foreground text-xs"}>
                        {value || "Select entity..."}
                    </span>
                    <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search entities..." />
                    <CommandList>
                        {loading && (
                            <div className="py-3 text-center text-xs text-muted-foreground">
                                Loading entities...
                            </div>
                        )}
                        <CommandEmpty>No entities found.</CommandEmpty>
                        {entities.map((ent) => (
                            <CommandItem
                                key={ent.name}
                                value={ent.name}
                                onSelect={handleSelect}
                                className="text-xs"
                            >
                                <Check
                                    className={`mr-2 size-3.5 ${value === ent.name ? "opacity-100" : "opacity-0"}`}
                                />
                                <span className="font-mono">{ent.name}</span>
                                {ent.label && (
                                    <span className="ml-2 text-muted-foreground">{ent.label}</span>
                                )}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
