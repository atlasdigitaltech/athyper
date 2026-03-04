"use client";

// components/mesh/list/ListContentHeader.tsx
//
// Two-tier content header for the entity list page.
// Tier 1: Title + count | Search | Refresh, Settings, Filter toggle
// Tier 2: Collapsible filter bar with labeled quick filter dropdowns
// FilterChips shown below when active filters exist.

import { Filter, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FilterChips } from "./FilterChips";
import { useListPage, useListPageActions } from "./ListPageContext";
import { SettingsDropdown } from "./SettingsDropdown";
import { useSmartHeader } from "./useSmartHeader";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ListContentHeader<T>() {
    const { state, config, loading, refresh, scrollContainerRef, infiniteScroll, totalFilteredCount } = useListPage<T>();
    const actions = useListPageActions();

    // Scroll-responsive collapse: hides filter bar + chips when scrolling down
    const headerRef = useRef<HTMLDivElement>(null);
    const headerCollapsed = useSmartHeader(scrollContainerRef, headerRef);

    // ── Search (no local debounce — context handles the 250ms server debounce) ──
    const [searchInput, setSearchInput] = useState(state.search);

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchInput(value);
            actions.setSearch(value);
        },
        [actions],
    );

    // Sync external search state changes back to input (e.g. chip removal)
    useEffect(() => {
        if (!state.search && searchInput) {
            setSearchInput("");
        }
    }, [state.search]); // eslint-disable-line react-hooks/exhaustive-deps

    // Determine which quick filters and column filters to show in the bar
    const quickFilterIds = new Set(config.quickFilters.map((qf) => qf.id));
    const barQuickFilters = state.filterBarFields.length > 0
        ? config.quickFilters.filter((qf) => state.filterBarFields.includes(qf.id))
        : config.quickFilters;
    const barColumnFilters = state.filterBarFields
        .filter((id) => !quickFilterIds.has(id))
        .map((id) => config.columns.find((c) => c.id === id))
        .filter((col): col is NonNullable<typeof col> => !!col);

    // Count active filters (quick filters + column text filters)
    const activeFilterCount =
        barQuickFilters.filter((qf) => {
            const current = state.filters[qf.id];
            return current && current !== qf.defaultValue;
        }).length +
        barColumnFilters.filter((col) => {
            const current = state.filters[col.id];
            return !!current;
        }).length;

    // Active filter labels for collapsed summary
    const activeFilterLabels = [
        ...barQuickFilters
            .filter((qf) => {
                const current = state.filters[qf.id];
                return current && current !== qf.defaultValue;
            })
            .map((qf) => qf.label),
        ...barColumnFilters
            .filter((col) => !!state.filters[col.id])
            .map((col) => col.header || col.id),
    ];

    const hasFilters = barQuickFilters.length > 0 || barColumnFilters.length > 0;

    const searchBar = (
        <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border px-2 focus-within:ring-1 focus-within:ring-ring sm:flex-none sm:w-48">
            <Input
                placeholder={config.searchPlaceholder}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-8 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
            />
            {searchInput && (
                <button
                    type="button"
                    title="Clear search"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleSearchChange("")}
                >
                    <X className="size-3.5" />
                </button>
            )}
            <Search className="shrink-0 size-3.5 text-muted-foreground" />
        </div>
    );

    const filtersButton = hasFilters ? (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={state.advancedOpen ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={actions.toggleAdvanced}
                >
                    <Filter className="size-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                        <Badge
                            variant="default"
                            className="ml-0.5 h-4 min-w-4 px-1 text-[10px]"
                        >
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
                Toggle Filters
            </TooltipContent>
        </Tooltip>
    ) : null;

    return (
        <div ref={headerRef} className="shrink-0">
            <Card className="flex flex-col gap-0 overflow-hidden px-3 py-2">
                {/* Row 1: Title + actions */}
                <div className="flex items-center gap-2">
                    <h2 className="min-w-0 truncate text-base font-semibold">
                        {config.pageTitle}
                        {totalFilteredCount > 0 && (
                            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                                ({infiniteScroll ? `${infiniteScroll.loadedCount} of ${totalFilteredCount}` : totalFilteredCount})
                            </span>
                        )}
                    </h2>
                    <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                        {searchBar}
                        {filtersButton}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={refresh}
                                    disabled={loading}
                                >
                                    <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                Refresh
                            </TooltipContent>
                        </Tooltip>
                        <SettingsDropdown<T> />
                    </div>
                </div>

                {/* Row 2 (mobile only): Search + Filters */}
                <div className="mt-2 flex sm:hidden items-center gap-2">
                    {searchBar}
                    {filtersButton}
                </div>

                {/* Scroll-responsive collapsible section */}
                <div className={cn(
                    "grid transition-[grid-template-rows,margin] duration-200 ease-out",
                    headerCollapsed ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-2",
                )}>
                    <div className="min-h-0 overflow-hidden">
                        {/* Filter summary when bar is collapsed and filters are active */}
                        {!state.advancedOpen && activeFilterCount > 0 && (
                            <div className="pb-1 text-xs text-muted-foreground">
                                {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active:{" "}
                                {activeFilterLabels.join(", ")}
                            </div>
                        )}

                        {/* Collapsible filter bar */}
                        {state.advancedOpen && hasFilters && (
                            <div className="flex flex-wrap items-end gap-2 border-t py-1.5 sm:gap-3">
                                {barQuickFilters.map((qf) => (
                                    <div key={qf.id} className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
                                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            {qf.label}
                                        </label>
                                        <Select
                                            value={state.filters[qf.id] ?? qf.defaultValue}
                                            onValueChange={(v) => actions.setFilter(qf.id, v)}
                                        >
                                            <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]">
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
                                    </div>
                                ))}

                                {barColumnFilters.map((col) => {
                                    const colLabel = col.header || col.id;
                                    return (
                                    <div key={col.id} className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
                                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            {colLabel}
                                        </label>
                                        <DebouncedFilterInput
                                            placeholder={`Filter ${colLabel.toLowerCase()}...`}
                                            externalValue={state.filters[col.id] ?? ""}
                                            onCommit={(v) => {
                                                if (v) {
                                                    actions.setFilter(col.id, v);
                                                } else {
                                                    actions.removeFilter(col.id);
                                                }
                                            }}
                                        />
                                    </div>
                                    );
                                })}

                            </div>
                        )}

                        {/* Filter chips */}
                        <div className="pb-1">
                            <FilterChips />
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}

// ── Debounced column text filter input ──

interface DebouncedFilterInputProps {
    placeholder: string;
    externalValue: string;
    onCommit: (value: string) => void;
}

function DebouncedFilterInput({ placeholder, externalValue, onCommit }: DebouncedFilterInputProps) {
    const [local, setLocal] = useState(externalValue);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync when external state changes (e.g., chip removed, filters cleared)
    useEffect(() => {
        setLocal(externalValue);
    }, [externalValue]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, []);

    const handleChange = useCallback(
        (value: string) => {
            setLocal(value);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                onCommit(value);
            }, 300);
        },
        [onCommit],
    );

    return (
        <Input
            placeholder={placeholder}
            value={local}
            onChange={(e) => handleChange(e.target.value)}
            className="h-8 w-full text-xs sm:w-[160px]"
        />
    );
}
