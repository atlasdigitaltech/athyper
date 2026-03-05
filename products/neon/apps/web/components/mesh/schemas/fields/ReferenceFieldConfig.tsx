"use client";

import { ChevronsUpDown, Check } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Legacy lookup config (backward compat) */
export interface LookupConfig {
    targetEntity: string;
    targetKey: string;
    onDelete: "restrict" | "cascade" | "set_null";
}

/** Full reference config (Phase 3) */
export interface FullReferenceConfig extends LookupConfig {
    relationshipKind: "many-to-one" | "one-to-one" | "one-to-many" | "many-to-many";
    joinEntity: string;
    joinLeftKey: string;
    joinRightKey: string;
    displayField: string;
    searchFields: string[];
    valueField: string;
    filter: string;
    serverSearchMode: "contains" | "startsWith" | "fts";
    allowCreateInline: boolean;
    cacheMode: "none" | "session" | "global";
    defaultSort: string;
    typeaheadLimit: number;
    hydrateStrategy: "byIds" | "embedded";
}

interface ReferenceFieldConfigProps {
    value: LookupConfig;
    onChange: (config: LookupConfig) => void;
    /** Extended config (new fields). If provided, renders the full form. */
    extendedValue?: Partial<FullReferenceConfig>;
    onExtendedChange?: (config: Partial<FullReferenceConfig>) => void;
}

const ON_DELETE_OPTIONS = [
    { value: "restrict", label: "Restrict", description: "Prevent deletion if referenced" },
    { value: "cascade", label: "Cascade", description: "Delete referencing records too" },
    { value: "set_null", label: "Set Null", description: "Nullify the reference on deletion" },
] as const;

const RELATIONSHIP_KINDS = [
    { value: "many-to-one", label: "Many-to-One" },
    { value: "one-to-one", label: "One-to-One" },
    { value: "one-to-many", label: "One-to-Many" },
    { value: "many-to-many", label: "Many-to-Many" },
] as const;

const SEARCH_MODES = [
    { value: "contains", label: "Contains" },
    { value: "startsWith", label: "Starts With" },
    { value: "fts", label: "Full-Text Search" },
] as const;

const CACHE_MODES = [
    { value: "none", label: "None" },
    { value: "session", label: "Session" },
    { value: "global", label: "Global" },
] as const;

// ─── Component ───────────────────────────────────────────────

export function ReferenceFieldConfig({ value, onChange, extendedValue, onExtendedChange }: ReferenceFieldConfigProps) {
    const ext = extendedValue ?? {};
    const setExt = (partial: Partial<FullReferenceConfig>) =>
        onExtendedChange?.({ ...ext, ...partial });
    const showExtended = !!onExtendedChange;
    const isManyToMany = ext.relationshipKind === "many-to-many";

    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium">Reference Configuration</p>

            {/* Core fields */}
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

            {/* Extended fields (Phase 3) */}
            {showExtended && (
                <>
                    <div className="border-t pt-3 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">Advanced</p>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Relationship Kind</label>
                                <Select
                                    value={ext.relationshipKind ?? "many-to-one"}
                                    onValueChange={(v) => setExt({ relationshipKind: v as FullReferenceConfig["relationshipKind"] })}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RELATIONSHIP_KINDS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Display Field</label>
                                <Input
                                    value={ext.displayField ?? ""}
                                    onChange={(e) => setExt({ displayField: e.target.value })}
                                    placeholder="name"
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                        </div>

                        {/* M:N Join metadata */}
                        {isManyToMany && (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Join Entity</label>
                                    <Input
                                        value={ext.joinEntity ?? ""}
                                        onChange={(e) => setExt({ joinEntity: e.target.value })}
                                        placeholder="entity_tag"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Left Key</label>
                                    <Input
                                        value={ext.joinLeftKey ?? ""}
                                        onChange={(e) => setExt({ joinLeftKey: e.target.value })}
                                        placeholder="entity_id"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Right Key</label>
                                    <Input
                                        value={ext.joinRightKey ?? ""}
                                        onChange={(e) => setExt({ joinRightKey: e.target.value })}
                                        placeholder="tag_id"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Search Mode</label>
                                <Select
                                    value={ext.serverSearchMode ?? "contains"}
                                    onValueChange={(v) => setExt({ serverSearchMode: v as FullReferenceConfig["serverSearchMode"] })}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SEARCH_MODES.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Cache Mode</label>
                                <Select
                                    value={ext.cacheMode ?? "none"}
                                    onValueChange={(v) => setExt({ cacheMode: v as FullReferenceConfig["cacheMode"] })}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CACHE_MODES.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Default Sort</label>
                                <Input
                                    value={ext.defaultSort ?? ""}
                                    onChange={(e) => setExt({ defaultSort: e.target.value })}
                                    placeholder="name ASC"
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium">Typeahead Limit</label>
                                <Input
                                    type="number"
                                    value={ext.typeaheadLimit ?? 20}
                                    onChange={(e) => setExt({ typeaheadLimit: parseInt(e.target.value) || 20 })}
                                    className="h-9"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={ext.allowCreateInline ?? false}
                                    onCheckedChange={(v) => setExt({ allowCreateInline: v === true })}
                                />
                                <label className="text-xs">Allow inline creation</label>
                            </div>
                        </div>
                    </div>
                </>
            )}
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
