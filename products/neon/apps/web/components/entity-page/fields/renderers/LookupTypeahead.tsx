"use client";

/**
 * Lookup Typeahead Component
 *
 * Combobox-style typeahead picker for reference fields.
 * Uses the dedicated /api/lookup/:entity endpoint for server-side search
 * with relevance ranking and context-aware filtering.
 */

import { useState, useRef, useEffect } from "react";
import { Search, X, Loader2, ChevronsUpDown } from "lucide-react";

import { Input, Label } from "@neon/ui";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";

import { useLookupSearch } from "@/lib/use-lookup-search";
import type { EffectiveLookupProfile } from "@/lib/entity-page/resolve-field-meta";

// ============================================================================
// Props
// ============================================================================

interface LookupTypeaheadProps {
    entity: string;
    profile?: EffectiveLookupProfile;
    value: string | null;
    displayLabel?: string;
    fieldLabel: string;
    context: "create" | "edit" | "view";
    onChange?: (id: string | null) => void;
    readOnly?: boolean;
    /** Source entity name — enables server-authoritative profile resolution */
    sourceEntity?: string;
    /** Source field name — enables server-authoritative profile resolution */
    fieldName?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LookupTypeahead({
    entity,
    profile,
    value,
    displayLabel,
    fieldLabel,
    context,
    onChange,
    readOnly,
    sourceEntity,
    fieldName,
}: LookupTypeaheadProps) {
    const [open, setOpen] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(displayLabel ?? "");
    const inputRef = useRef<HTMLInputElement>(null);

    const { query, setQuery, results, loading } = useLookupSearch(
        entity,
        profile,
        context,
        sourceEntity,
        fieldName,
    );

    // Update selected label when displayLabel prop changes (e.g., after hydration)
    useEffect(() => {
        if (displayLabel) setSelectedLabel(displayLabel);
    }, [displayLabel]);

    const handleSelect = (itemId: string, itemLabel: string) => {
        setSelectedLabel(itemLabel);
        setQuery("");
        setOpen(false);
        onChange?.(itemId);
    };

    const handleClear = () => {
        setSelectedLabel("");
        setQuery("");
        onChange?.(null);
    };

    // View mode or read-only: show resolved label only
    if (readOnly || context === "view") {
        return (
            <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{fieldLabel}</Label>
                <p className="text-sm min-h-[1.5rem]">{selectedLabel || "\u2014"}</p>
                {value && (
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{value}</p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">{fieldLabel}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        role="combobox"
                        aria-expanded={open}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <span className={selectedLabel ? "text-foreground" : "text-muted-foreground"}>
                            {selectedLabel || `Select ${fieldLabel.toLowerCase()}...`}
                        </span>
                        <span className="flex items-center gap-1">
                            {value && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-sm p-0.5 hover:bg-muted"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleClear();
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.stopPropagation();
                                            handleClear();
                                        }
                                    }}
                                >
                                    <X className="size-3.5 text-muted-foreground" />
                                </span>
                            )}
                            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                        </span>
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                        <div className="flex items-center border-b px-3">
                            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
                            <CommandInput
                                ref={inputRef}
                                placeholder={`Search ${fieldLabel.toLowerCase()}...`}
                                value={query}
                                onValueChange={setQuery}
                                className="border-0 focus:ring-0"
                            />
                            {loading && (
                                <Loader2 className="ml-2 size-4 shrink-0 animate-spin text-muted-foreground" />
                            )}
                        </div>
                        <CommandList>
                            <CommandEmpty>
                                {query.length < (profile?.minChars ?? 2)
                                    ? `Type at least ${profile?.minChars ?? 2} characters...`
                                    : loading
                                      ? "Searching..."
                                      : "No results found."}
                            </CommandEmpty>
                            {results.length > 0 && (
                                <CommandGroup>
                                    {results.map((item) => (
                                        <CommandItem
                                            key={item.id}
                                            value={item.id}
                                            onSelect={() => handleSelect(item.id, item.label)}
                                            className="flex flex-col items-start gap-0.5 py-2"
                                        >
                                            <span className="text-sm font-medium">{item.label}</span>
                                            {item.sublabel && (
                                                <span className="text-xs text-muted-foreground">{item.sublabel}</span>
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {value && (
                <p className="text-[10px] text-muted-foreground truncate font-mono">{value}</p>
            )}
        </div>
    );
}
