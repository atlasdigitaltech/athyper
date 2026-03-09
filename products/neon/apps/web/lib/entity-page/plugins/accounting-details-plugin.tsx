/**
 * Accounting Details Plugin for Entity Pages
 *
 * Adds an "Accounting" tab showing:
 *   - Journal entry header (JE number, posting date, book, status)
 *   - Journal lines table (account, debit, credit, dimensions, drillthrough)
 *   - GL impact summary (net debit/credit per account)
 *   - Balance verification indicator
 *
 * Applies to any entity that generates journal entries via the Posting Engine:
 * PurchaseInvoice, PaymentEntry, CreditNote, DebitNote, ManualJournalEntry.
 */

"use client";

import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

import type { TabPlugin, TabPluginProps } from "../plugin-registry";
import type {
  AccountingEntryDTO,
  AccountingJournalLineDTO,
  GLImpactDTO,
} from "@/lib/finance/types";

import { StatusBadgeCell, MoneyCell } from "@/components/finance/list/finance-shared";
import { useAccountingDetails } from "@/lib/finance/use-accounting-details";

// ── Journal Lines Table ─────────────────────────────────────────────

function JournalLinesTable({ lines }: { lines: AccountingJournalLineDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs font-medium text-muted-foreground">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Account</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-right">Debit</th>
            <th className="px-3 py-2 text-right">Credit</th>
            <th className="px-3 py-2 text-left">Cost Center</th>
            <th className="px-3 py-2 text-left">Dimensions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((line) => (
            <tr key={`${line.jeId}-${line.lineNo}`} className="hover:bg-muted/30">
              <td className="px-3 py-2 text-muted-foreground">{line.lineNo}</td>
              <td className="px-3 py-2">
                <div className="font-medium">
                  {line.accountCode ?? line.accountId.slice(0, 8)}
                </div>
                {line.accountName && (
                  <div className="text-xs text-muted-foreground">{line.accountName}</div>
                )}
              </td>
              <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">
                {line.description ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {parseFloat(line.debitAmount) > 0 ? (
                  <MoneyCell amount={line.debitAmount} />
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {parseFloat(line.creditAmount) > 0 ? (
                  <MoneyCell amount={line.creditAmount} />
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {line.costCenterName ?? line.costCenterId?.slice(0, 8) ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {line.dimensionLabel ?? (line.profitCenterName ? `PC: ${line.profitCenterName}` : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── GL Impact Summary ───────────────────────────────────────────────

function GLImpactTable({ impact }: { impact: GLImpactDTO[] }) {
  if (impact.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        GL Impact Summary
      </h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-right">Total Debit</th>
              <th className="px-3 py-2 text-right">Total Credit</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {impact.map((row) => {
              const net = parseFloat(row.netAmount);
              return (
                <tr key={row.accountId} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {row.accountCode ?? row.accountId.slice(0, 8)}
                    </span>
                    {row.accountName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.accountName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <MoneyCell amount={row.totalDebit} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <MoneyCell amount={row.totalCredit} />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${
                      net > 0
                        ? "text-blue-700 dark:text-blue-400"
                        : net < 0
                          ? "text-red-700 dark:text-red-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    <MoneyCell amount={row.netAmount} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Journal Entry Card ──────────────────────────────────────────────

function JournalEntryCard({ entry }: { entry: AccountingEntryDTO }) {
  const [expanded, setExpanded] = useState(true);
  const totalDebit = parseFloat(entry.totalDebit) || 0;
  const totalCredit = parseFloat(entry.totalCredit) || 0;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

  return (
    <div className="rounded-lg border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <BookOpen className="h-4 w-4 shrink-0 text-purple-600" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{entry.jeNumber}</span>
            <StatusBadgeCell status={entry.status} />
            <span className="text-xs text-muted-foreground">
              Book: {entry.bookCode}
            </span>
            {entry.isReversal && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                REVERSAL
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>Posted: {entry.postingDate}</span>
            <span>
              FY {entry.fiscalYear} P{entry.periodNumber}
            </span>
            <span>{entry.currencyCode}</span>
            {entry.description && <span className="italic">{entry.description}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isBalanced ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {isBalanced ? "Balanced" : "Unbalanced"}
          </span>
        </div>
      </button>

      {/* Lines */}
      {expanded && (
        <div className="border-t">
          <JournalLinesTable lines={entry.lines} />

          {/* Totals row */}
          <div className="flex items-center justify-end gap-6 border-t bg-muted/20 px-3 py-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Total Debits:</span>
            <span className="font-mono tabular-nums font-medium">
              <MoneyCell amount={entry.totalDebit} currency={entry.currencyCode} />
            </span>
            <span className="text-xs font-medium text-muted-foreground">Total Credits:</span>
            <span className="font-mono tabular-nums font-medium">
              <MoneyCell amount={entry.totalCredit} currency={entry.currencyCode} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Tab Component ──────────────────────────────────────────────

function AccountingDetailsTab({ entityId, staticDescriptor }: TabPluginProps) {
  const { data, loading, error, refresh } = useAccountingDetails(
    entityId,
    staticDescriptor.entityName,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading accounting details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
        {error}
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const glImpact = data?.glImpact ?? [];

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BookOpen className="h-10 w-10 opacity-30" />
        <p className="mt-3 text-sm">No accounting entries</p>
        <p className="mt-1 text-xs opacity-60">
          Journal entries will appear here once the document is posted.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {entries.length} journal entr{entries.length !== 1 ? "ies" : "y"}
        </h3>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {entries.map((entry) => (
        <JournalEntryCard key={entry.jeId} entry={entry} />
      ))}

      <GLImpactTable impact={glImpact} />
    </div>
  );
}

export const accountingDetailsPlugin: TabPlugin = {
  code: "accounting-details",
  component: AccountingDetailsTab,
};
