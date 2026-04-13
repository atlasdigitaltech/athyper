"use client";

/**
 * JournalGrid — paginated, filterable list of Journal Entries.
 *
 * Clicking a row expands an inline PostingTrace panel.
 * Accepts a FinanceScope so it can be embedded in any scoped context.
 *
 * Usage:
 *   <JournalGrid scope={scope} />
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Search } from "lucide-react";
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@athyper/ui/primitives";
import { useJournalList } from "../hooks/useJournalList";
import type { JournalEntry } from "../hooks/useJournalList";
import { PostingTrace } from "./PostingTrace";
import type { FinanceScope } from "../lib/scope";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

function statusVariant(status: string): "success" | "destructive" | "muted" | "secondary" {
  const s = status.toLowerCase();
  if (s === "posted")   return "success";
  if (s === "reversed" || s === "voided") return "destructive";
  if (s === "created")  return "muted";
  return "secondary";
}

// ── Row ───────────────────────────────────────────────────────────────────────

function JeRow({
  je,
  expanded,
  onToggle,
}: {
  je: JournalEntry;
  expanded: boolean;
  onToggle(): void;
}) {
  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 w-8">
          {expanded
            ? <ChevronDown  className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-3 py-2.5">
          <span className="font-mono text-xs font-medium">{je.jeNumber}</span>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={statusVariant(je.status)} className="capitalize">{je.status}</Badge>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">
          {fmtDate(je.postingDate)}
        </td>
        <td className="px-3 py-2.5 text-xs">{je.sourceDocType ?? "—"}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
          {je.description ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {fmt(je.totalDebit)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs font-medium text-rose-700 dark:text-rose-400">
          {fmt(je.totalCredit)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
          {je.lineCount}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} className="px-4 pb-4 pt-2 bg-muted/20">
            <PostingTrace jeId={je.id} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface JournalGridProps {
  scope: FinanceScope;
}

const STATUS_OPTIONS = [
  { value: "all",      label: "All statuses" },
  { value: "created",  label: "Draft" },
  { value: "posted",   label: "Posted" },
  { value: "reversed", label: "Reversed" },
  { value: "voided",   label: "Voided" },
];

const PAGE_SIZE = 50;

export function JournalGrid({ scope }: JournalGridProps) {
  const [page,        setPage]        = useState(1);
  const [status,      setStatus]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const { data, isLoading } = useJournalList(scope, {
    status:  status === "all" ? undefined : status,
    search:  search || undefined,
    page,
    limit:   PAGE_SIZE,
  });

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="flex flex-col gap-3">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-1 items-center gap-1.5 min-w-48 max-w-sm">
          <Input
            className="h-8 text-xs"
            placeholder="Search JE number or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.total.toLocaleString()} journal entr{data.total === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No journal entries found</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="w-8" />
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">JE Number</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Posting Date</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-3 py-2.5 text-left  text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.items.map((je) => (
                <JeRow
                  key={je.id}
                  je={je}
                  expanded={expandedId === je.id}
                  onToggle={() => toggleExpand(je.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
