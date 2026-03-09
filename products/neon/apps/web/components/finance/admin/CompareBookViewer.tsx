"use client";

// components/finance/admin/CompareBookViewer.tsx
//
// Cross-book balance comparison viewer.
// Shows side-by-side account balances across all books for a given period.

import { GitCompare, Loader2, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";

import { MoneyCell } from "../list/finance-shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCompareBooks,
  type CompareFilters,
} from "@/lib/finance/use-cross-book-audit";
import type { CompareBookRowDTO } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

interface CompareBookViewerProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export function CompareBookViewer({
  entityCode,
  fiscalYear,
  periodNumber,
}: CompareBookViewerProps) {
  const [search, setSearch] = useState("");
  const [materialOnly, setMaterialOnly] = useState(false);
  const [threshold, setThreshold] = useState("1.00");

  const filters = useMemo<CompareFilters>(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  const { data: rows, loading, error, refresh } = useCompareBooks(filters);

  // Filter by account search
  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.accountCode.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Group by account for cross-book comparison
  const grouped = useMemo(() => {
    const map = new Map<string, CompareBookRowDTO[]>();
    for (const row of filtered) {
      const key = row.accountCode;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));

    if (!materialOnly) return entries;

    // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
    const t = parseFloat(threshold) || 0;
    return entries.filter(([, bookRows]) => {
      if (bookRows.length <= 1) return false;
      const maxVar = Math.max(
        ...bookRows.map((r) =>
          r.variancePct != null ? Math.abs(r.variancePct) : 0,
        ),
      );
      if (maxVar > 0) return maxVar >= t;
      // Fallback: compare net balances directly — DISPLAY_ONLY_FLOAT_OK
      // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
      const first = parseFloat(bookRows[0].netBalance);
      // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
      return bookRows.some((r) => Math.abs(parseFloat(r.netBalance) - first) >= t);
    });
  }, [filtered, materialOnly, threshold]);

  // Detect accounts with book differences
  const hasDifferences = (rows: CompareBookRowDTO[]) => {
    if (rows.length <= 1) return false;
    const first = rows[0].netBalance;
    return rows.some((r) => r.netBalance !== first);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Compare Books</h2>
          <span className="text-sm text-muted-foreground">
            FY{fiscalYear} / P{periodNumber}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <Input
          placeholder="Filter by account code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="material-only"
            checked={materialOnly}
            onCheckedChange={(v) => setMaterialOnly(v === true)}
          />
          <Label htmlFor="material-only" className="text-sm">
            Material only
          </Label>
        </div>
        {materialOnly && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">≥</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-[100px]"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && !rows && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {grouped.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Account</TableHead>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead className="w-[80px]">Book</TableHead>
              <TableHead className="w-[140px] text-right">Debit</TableHead>
              <TableHead className="w-[140px] text-right">Credit</TableHead>
              <TableHead className="w-[140px] text-right">Net</TableHead>
              <TableHead className="w-[80px] text-right">Var %</TableHead>
              <TableHead className="w-[60px]">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map(([accountCode, bookRows]) => {
              const diff = hasDifferences(bookRows);
              return bookRows.map((row, idx) => (
                <TableRow
                  key={`${accountCode}-${row.bookCode}`}
                  className={diff ? "bg-amber-50/50" : ""}
                >
                  {idx === 0 ? (
                    <>
                      <TableCell
                        rowSpan={bookRows.length}
                        className="align-top font-mono text-sm font-medium"
                      >
                        {accountCode}
                      </TableCell>
                      <TableCell
                        rowSpan={bookRows.length}
                        className="align-top text-sm"
                      >
                        {row.accountName}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                        BOOK_COLORS[row.bookCode] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {row.bookCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <MoneyCell amount={row.closingDebit} />
                  </TableCell>
                  <TableCell>
                    <MoneyCell amount={row.closingCredit} />
                  </TableCell>
                  <TableCell>
                    <MoneyCell amount={row.netBalance} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.variancePct != null ? (
                      <span className={Math.abs(row.variancePct) >= 1 ? "font-medium text-amber-700" : "text-muted-foreground"}>
                        {row.variancePct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  {idx === 0 ? (
                    <TableCell
                      rowSpan={bookRows.length}
                      className="align-top text-center"
                    >
                      {diff ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          diff
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">ok</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!loading && grouped.length === 0 && !error && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No balance data for this period.
        </div>
      )}
    </div>
  );
}
