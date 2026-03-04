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

const SCOPE_TYPES = [
    { value: "global", label: "Global", description: "Applies to all modules and entities" },
    { value: "module", label: "Module", description: "Applies to a specific module" },
    { value: "entity", label: "Entity", description: "Applies to a specific entity type" },
    { value: "entity_version", label: "Entity Version", description: "Applies to a specific entity version" },
] as const;

const MODULES = [
    "httpFoundation",
    "meta",
    "iam",
    "dashboard",
    "document",
    "content",
    "notification",
    "auditGovernance",
    "collaboration",
] as const;

interface ScopePickerProps {
    scopeType: string;
    scopeKey: string;
    onScopeTypeChange: (type: string) => void;
    onScopeKeyChange: (key: string) => void;
}

// ─── Component ───────────────────────────────────────────────

export function ScopePicker({
    scopeType,
    scopeKey,
    onScopeTypeChange,
    onScopeKeyChange,
}: ScopePickerProps) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
                <label className="text-xs font-medium">Scope Type</label>
                <Select
                    value={scopeType}
                    onValueChange={(v) => {
                        onScopeTypeChange(v);
                        if (v === "global") onScopeKeyChange("");
                    }}
                >
                    <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                        {SCOPE_TYPES.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                                {st.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium">Scope Key</label>
                {scopeType === "global" ? (
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-xs text-muted-foreground">
                        Not required
                    </div>
                ) : scopeType === "module" ? (
                    <Select value={scopeKey} onValueChange={onScopeKeyChange}>
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select module" />
                        </SelectTrigger>
                        <SelectContent>
                            {MODULES.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : scopeType === "entity" || scopeType === "entity_version" ? (
                    <EntityScopeKeyPicker value={scopeKey} onChange={onScopeKeyChange} />
                ) : (
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-xs text-muted-foreground">
                        Select a scope type
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Entity Scope Key Picker ─────────────────────────────────

function EntityScopeKeyPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
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
