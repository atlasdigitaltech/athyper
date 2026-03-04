"use client";

// components/finance/list/JournalEntryExplorer.tsx
//
// List explorer for Journal Entries.
// Renders a filterable, searchable, paginated table of JEs.

import { useState, useMemo } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import { useJournalEntryList } from "@/lib/finance/use-finance-list";
import type { ListFilterOptions } from "@/lib/finance/use-finance-list";
import type { JournalEntrySummary, JEStatus } from "@/lib/finance/types";
import { DateCell, MoneyCell, StatusBadgeCell } from "./finance-shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "all",      label: "All Statuses" },
    { value: "CREATED",  label: "Created" },
    { value: "POSTED",   label: "Posted" },
    { value: "REVERSED", label: "Reversed" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JournalEntryExplorer() {
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [offset, setOffset] = useState(0);

    const filters = useMemo<ListFilterOptions>(
        () => ({
            limit: PAGE_SIZE,
            offset,
            status: status !== "all" ? status : undefined,
            search: search || undefined,
            sort: "postingDate",
            dir: "desc",
        }),
        [offset, status, search],
    );

    const { data, loading, error, refresh } = useJournalEntryList(filters);

    // ── Reset offset when filters change ────────────────────────────
    const handleStatusChange = (value: string) => {
        setStatus(value);
        setOffset(0);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setOffset(0);
    };

    // ── Pagination ──────────────────────────────────────────────────
    const canPrev = offset > 0;
    const canNext = data?.hasMore ?? false;
    const total = data?.total ?? 0;
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    return (
        <div className="space-y-4">
            {/* ── Header ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookOpen className="size-5 text-muted-foreground" />
                    <h1 className="text-lg font-semibold">Journal Entries</h1>
                    {!loading && (
                        <span className="text-sm text-muted-foreground">
                            ({total} total)
                        </span>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                    <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* ── Filters ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search journal entries..."
                        value={search}
                        onChange={handleSearchChange}
                        className="pl-9"
                    />
                </div>
                <Select value={status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-[180px]" size="sm">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* ── Error state ───────────────────────────────────────── */}
            {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
                        <RefreshCw className="mr-1.5 size-3.5" />
                        Retry
                    </Button>
                </div>
            )}

            {/* ── Loading state ─────────────────────────────────────── */}
            {loading && !data && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* ── Table ─────────────────────────────────────────────── */}
            {data && (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[140px]">JE #</TableHead>
                                <TableHead className="w-[100px]">Doc Type</TableHead>
                                <TableHead className="w-[130px]">Posting Date</TableHead>
                                <TableHead className="w-[80px]">FY</TableHead>
                                <TableHead className="w-[80px]">Period</TableHead>
                                <TableHead className="w-[150px] text-right">Debit</TableHead>
                                <TableHead className="w-[150px] text-right">Credit</TableHead>
                                <TableHead className="w-[120px]">Status</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                        No journal entries found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {data.items.map((je) => (
                                <TableRow key={je.id}>
                                    <TableCell>
                                        <span className="font-mono text-sm font-medium">
                                            {je.jeNumber}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                                            {je.docType}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <DateCell date={je.postingDate} />
                                    </TableCell>
                                    <TableCell className="text-sm tabular-nums">
                                        {je.fiscalYear}
                                    </TableCell>
                                    <TableCell className="text-sm tabular-nums">
                                        {je.periodNumber}
                                    </TableCell>
                                    <TableCell>
                                        <MoneyCell amount={je.totalDebit} currency={je.currencyCode} />
                                    </TableCell>
                                    <TableCell>
                                        <MoneyCell amount={je.totalCredit} currency={je.currencyCode} />
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadgeCell status={je.status} />
                                    </TableCell>
                                    <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">
                                        {je.description ?? "--"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* ── Pagination ────────────────────────────────── */}
                    <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canPrev}
                                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            >
                                <ChevronLeft className="mr-1 size-4" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canNext}
                                onClick={() => setOffset(offset + PAGE_SIZE)}
                            >
                                Next
                                <ChevronRight className="ml-1 size-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
