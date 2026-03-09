"use client";

// components/finance/admin/BookCloseHistoryViewer.tsx
//
// Immutable audit trail viewer for book period close events.
// Shows timeline of OPENED, SOFT_CLOSED, HARD_CLOSED, REOPENED events.

import { Clock, Loader2, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";

import { DateCell } from "../list/finance-shared";

import { Button } from "@/components/ui/button";
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
import {
  useBookCloseHistory,
  type CloseHistoryFilters,
} from "@/lib/finance/use-cross-book-audit";
import type { BookCloseEventType } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<BookCloseEventType, { bg: string; text: string }> = {
  OPENED: { bg: "bg-green-100", text: "text-green-700" },
  SOFT_CLOSED: { bg: "bg-amber-100", text: "text-amber-700" },
  HARD_CLOSED: { bg: "bg-red-100", text: "text-red-700" },
  REOPENED: { bg: "bg-blue-100", text: "text-blue-700" },
  INHERITED_FROM_UNIFIED: { bg: "bg-gray-100", text: "text-gray-700" },
};

const EVENT_LABELS: Record<BookCloseEventType, string> = {
  OPENED: "Opened",
  SOFT_CLOSED: "Soft Closed",
  HARD_CLOSED: "Hard Closed",
  REOPENED: "Reopened",
  INHERITED_FROM_UNIFIED: "Inherited",
};

const BOOK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Books" },
  { value: "STAT", label: "Statutory" },
  { value: "TAX", label: "Tax" },
  { value: "MGMT", label: "Management" },
  { value: "IFRS", label: "IFRS" },
  { value: "LOCAL", label: "Local GAAP" },
];

const BOOK_COLORS: Record<string, string> = {
  STAT: "bg-blue-100 text-blue-700",
  TAX: "bg-red-100 text-red-700",
  MGMT: "bg-green-100 text-green-700",
  IFRS: "bg-purple-100 text-purple-700",
  LOCAL: "bg-amber-100 text-amber-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookCloseHistoryViewer() {
  const [bookCode, setBookCode] = useState("all");

  const filters = useMemo<CloseHistoryFilters>(
    () => ({
      bookCode: bookCode !== "all" ? bookCode : undefined,
    }),
    [bookCode],
  );

  const { data: entries, loading, error, refresh } = useBookCloseHistory(filters);

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Close History</h2>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Filter ──────────────────────────────────────────────── */}
      <Select value={bookCode} onValueChange={setBookCode}>
        <SelectTrigger className="w-[180px]" size="sm">
          <SelectValue placeholder="Book" />
        </SelectTrigger>
        <SelectContent>
          {BOOK_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && !entries && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {entries && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Book</TableHead>
              <TableHead className="w-[80px]">FY</TableHead>
              <TableHead className="w-[80px]">Period</TableHead>
              <TableHead className="w-[120px]">Event</TableHead>
              <TableHead className="w-[120px]">From</TableHead>
              <TableHead className="w-[120px]">To</TableHead>
              <TableHead className="w-[160px]">When</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const eventColor = EVENT_COLORS[entry.eventType] ?? {
                bg: "bg-gray-100",
                text: "text-gray-700",
              };
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                        BOOK_COLORS[entry.bookCode] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {entry.bookCode}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {entry.fiscalYear}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {entry.periodNumber}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${eventColor.bg} ${eventColor.text}`}
                    >
                      {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{entry.fromStatus}</TableCell>
                  <TableCell className="text-sm font-medium">{entry.toStatus}</TableCell>
                  <TableCell>
                    <DateCell date={entry.performedAt} />
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">
                    {entry.reason ?? "--"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!loading && entries && entries.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No close history events found.
        </div>
      )}
    </div>
  );
}
