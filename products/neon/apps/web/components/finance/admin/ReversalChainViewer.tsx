"use client";

// components/finance/admin/ReversalChainViewer.tsx
//
// Drill-down viewer for cascade reversal chains.
// Given a correlation ID, shows all reversal steps across books.

import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { MoneyCell } from "../list/finance-shared";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReversalChain } from "@/lib/finance/use-cross-book-audit";

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

interface ReversalChainViewerProps {
  correlationId: string | null;
}

export function ReversalChainViewer({ correlationId }: ReversalChainViewerProps) {
  const { data: steps, loading, error } = useReversalChain(correlationId);

  const sorted = useMemo(
    () => (steps ? [...steps].sort((a, b) => a.cascadeOrder - b.cascadeOrder) : []),
    [steps],
  );

  if (!correlationId) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Select a reversal to view its cascade chain.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Reversal Chain</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {correlationId.slice(0, 8)}...
        </span>
      </div>

      {/* Reason (from first step) */}
      {sorted.length > 0 && sorted[0].reasonCode && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">{sorted[0].reasonCode}</span>
          {sorted[0].reasonText && (
            <span className="ml-2 text-muted-foreground">{sorted[0].reasonText}</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && !steps && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Chain table */}
      {sorted.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead className="w-[80px]">Book</TableHead>
              <TableHead className="w-[140px]">Original JE</TableHead>
              <TableHead className="w-[140px]">Reversal JE</TableHead>
              <TableHead className="w-[120px] text-right">Debit</TableHead>
              <TableHead className="w-[120px] text-right">Credit</TableHead>
              <TableHead className="w-[60px]">Ccy</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((step) => (
              <TableRow key={step.reversalJeId}>
                <TableCell className="text-sm tabular-nums font-medium">
                  {step.cascadeOrder}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                      BOOK_COLORS[step.bookCode] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {step.bookCode}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{step.originalJeNumber}</TableCell>
                <TableCell className="font-mono text-sm text-amber-700">
                  {step.reversalJeNumber}
                </TableCell>
                <TableCell>
                  <MoneyCell amount={step.totalDebit} />
                </TableCell>
                <TableCell>
                  <MoneyCell amount={step.totalCredit} />
                </TableCell>
                <TableCell className="text-xs">{step.currencyCode}</TableCell>
                <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                  {step.description ?? "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Empty */}
      {!loading && sorted.length === 0 && !error && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No reversal steps found for this correlation ID.
        </div>
      )}
    </div>
  );
}
