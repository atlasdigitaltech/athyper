"use client";

// components/mesh/list/ListCommandBar.tsx
//
// Zone 3 — Command Bar + Quick Filters.
// Search | Quick filters | Advanced toggle | Settings | Presets | Refresh | CTA

import {
    Filter,
    RefreshCw,
    Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useListPage, useListPageActions } from "./ListPageContext";
import { SettingsDropdown } from "./SettingsDropdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";


export function ListCommandBar<T>() {
    const { state, config, loading, refresh } = useListPage<T>();
    const actions = useListPageActions();

    // Debounced search
    const [searchInput, setSearchInput] = useState(state.search);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchInput(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                actions.setSearch(value);
            }, 300);
        },
        [actions],
    );

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Sync external search state changes back to input
    useEffect(() => {
        if (!state.search && searchInput) {
            setSearchInput("");
        }
    }, [state.search]); // eslint-disable-line react-hooks/exhaustive-deps

    // Count active advanced filters
    const advancedCount = config.advancedFilters
        ? Object.keys(state.advancedFilters).filter((k) => state.advancedFilters[k]).length
        : 0;

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder={config.searchPlaceholder}
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-9"
                />
            </div>

            {/* Quick Filters */}
            {config.quickFilters.map((qf) => (
                <Select
                    key={qf.id}
                    value={state.filters[qf.id] ?? qf.defaultValue}
                    onValueChange={(v) => actions.setFilter(qf.id, v)}
                >
                    <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder={qf.label} />
                    </SelectTrigger>
                    <SelectContent>
                        {qf.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ))}

            {/* Advanced Filter Toggle */}
            {config.advancedFilters && config.advancedFilters.length > 0 && (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={actions.toggleAdvanced}
                >
                    <Filter className="size-3.5" />
                    Filters
                    {advancedCount > 0 && (
                        <Badge variant="secondary" className="ml-1 size-5 p-0 text-[10px]">
                            {advancedCount}
                        </Badge>
                    )}
                </Button>
            )}

            {/* Right-aligned action group: Refresh → Settings → Primary CTA */}
            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={refresh}
                    disabled={loading}
                >
                    <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                </Button>

                <SettingsDropdown<T> />

                {config.primaryAction && (
                    <Button size="sm" className="h-9" onClick={config.primaryAction.onClick}>
                        {config.primaryAction.icon && (
                            <config.primaryAction.icon className="mr-1.5 size-3.5" />
                        )}
                        {config.primaryAction.label}
                    </Button>
                )}
            </div>
        </div>
    );
}
