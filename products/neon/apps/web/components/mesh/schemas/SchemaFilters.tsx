"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

export interface SchemaFilterValues {
    search: string;
    kind: string;
    status: string;
}

interface SchemaFiltersProps {
    filters: SchemaFilterValues;
    onFiltersChange: (filters: SchemaFilterValues) => void;
    viewMode: "grid" | "table";
    onViewModeChange: (mode: "grid" | "table") => void;
}

export function SchemaFilters({
    filters,
    onFiltersChange,
    viewMode,
    onViewModeChange,
}: SchemaFiltersProps) {
    const [searchInput, setSearchInput] = useState(filters.search);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchInput(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                onFiltersChange({ ...filters, search: value });
            }, 300);
        },
        [filters, onFiltersChange],
    );

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search entities..."
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-9"
                />
            </div>

            <Select
                value={filters.kind}
                onValueChange={(v) => onFiltersChange({ ...filters, kind: v })}
            >
                <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Kind" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Kinds</SelectItem>
                    <SelectItem value="ref">Reference</SelectItem>
                    <SelectItem value="ent">Enterprise</SelectItem>
                    <SelectItem value="doc">Document</SelectItem>
                </SelectContent>
            </Select>

            <Select
                value={filters.status}
                onValueChange={(v) => onFiltersChange({ ...filters, status: v })}
            >
                <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
            </Select>

            <div className="flex items-center rounded-md border">
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 rounded-r-none px-2", viewMode === "grid" && "bg-muted")}
                    onClick={() => onViewModeChange("grid")}
                >
                    <LayoutGrid className="size-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 rounded-l-none px-2", viewMode === "table" && "bg-muted")}
                    onClick={() => onViewModeChange("table")}
                >
                    <List className="size-3.5" />
                </Button>
            </div>
        </div>
    );
}
