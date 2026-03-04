"use client";

// components/finance/GLBalanceReport.tsx
//
// General Ledger balance report with three views:
// GL Summary, GL Detail, and Trial Balance.
// MC-4 compliant: all monetary values are opaque strings.

import {
  Badge,
  Card,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@neon/ui";
import { AlertCircle, Check } from "lucide-react";

import { cn } from "@/lib/utils";

// ── Domain types ─────────────────────────────────────────────────────

interface GLSummaryRow {
  accountId: string;
  accountName: string;
  openingBalance: string;
  totalDebits: string;
  totalCredits: string;
  closingBalance: string;
  movementCount: number;
}

interface GLDetailRow {
  journalEntryId: string;
  jeNumber: string;
  postingDate: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  runningBalance: string;
  docType: string;
  docId: string;
}

interface TrialBalanceRow {
  accountId: string;
  accountName: string;
  accountType: string;
  debitBalance: string;
  creditBalance: string;
}

type ReversalHandlingMode = "NETTED" | "SEPARATE" | "EXCLUDED";

// ── Props ────────────────────────────────────────────────────────────

interface GLBalanceReportProps {
  summaryRows: GLSummaryRow[];
  detailRows: GLDetailRow[];
  trialBalanceRows: TrialBalanceRow[];
  summaryTotals: {
    totalDebits: string;
    totalCredits: string;
    totalOpening: string;
    totalClosing: string;
  };
  trialBalanceTotals: { totalDebits: string; totalCredits: string };
  trialBalanceIsBalanced: boolean;
  reversalMode: ReversalHandlingMode;
  onReversalModeChange?: (mode: ReversalHandlingMode) => void;
  onAccountFilter?: (accountId: string) => void;
  onDateRangeChange?: (from: string, to: string) => void;
  currencyCode: string;
  loading?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

// ── Component ────────────────────────────────────────────────────────

export function GLBalanceReport({
  summaryRows,
  detailRows,
  trialBalanceRows,
  summaryTotals,
  trialBalanceTotals,
  trialBalanceIsBalanced,
  reversalMode,
  onReversalModeChange,
  onAccountFilter,
  onDateRangeChange,
  currencyCode,
  loading,
}: GLBalanceReportProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="h-64 rounded bg-muted" />
        </div>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="summary">
      <TabsList variant="line">
        <TabsTrigger value="summary">GL Summary</TabsTrigger>
        <TabsTrigger value="detail">GL Detail</TabsTrigger>
        <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
      </TabsList>

      {/* ── GL Summary ── */}
      <TabsContent value="summary">
        <GLSummaryTab
          rows={summaryRows}
          totals={summaryTotals}
          currencyCode={currencyCode}
        />
      </TabsContent>

      {/* ── GL Detail ── */}
      <TabsContent value="detail">
        <GLDetailTab
          rows={detailRows}
          reversalMode={reversalMode}
          onReversalModeChange={onReversalModeChange}
          onAccountFilter={onAccountFilter}
          onDateRangeChange={onDateRangeChange}
        />
      </TabsContent>

      {/* ── Trial Balance ── */}
      <TabsContent value="trial-balance">
        <TrialBalanceTab
          rows={trialBalanceRows}
          totals={trialBalanceTotals}
          isBalanced={trialBalanceIsBalanced}
        />
      </TabsContent>
    </Tabs>
  );
}

// ── GL Summary Tab ───────────────────────────────────────────────────

function GLSummaryTab({
  rows,
  totals,
  currencyCode,
}: {
  rows: GLSummaryRow[];
  totals: GLBalanceReportProps["summaryTotals"];
  currencyCode: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No GL summary data for the selected period.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Account
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Name
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Opening
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Debits
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Credits
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Closing
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Movements
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.accountId}
              className="border-b last:border-b-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2 font-mono text-xs">{row.accountId}</td>
              <td className="px-3 py-2">{row.accountName}</td>
              <td className={cn("px-3 py-2", amountCell)}>
                {row.openingBalance}
              </td>
              <td className={cn("px-3 py-2", amountCell)}>{row.totalDebits}</td>
              <td className={cn("px-3 py-2", amountCell)}>
                {row.totalCredits}
              </td>
              <td className={cn("px-3 py-2", amountCell, "font-medium")}>
                {row.closingBalance}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.movementCount}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-medium">
            <td
              colSpan={2}
              className="px-3 py-2 text-right text-xs text-muted-foreground"
            >
              Totals ({currencyCode})
            </td>
            <td className={cn("px-3 py-2", amountCell)}>
              {totals.totalOpening}
            </td>
            <td className={cn("px-3 py-2", amountCell)}>
              {totals.totalDebits}
            </td>
            <td className={cn("px-3 py-2", amountCell)}>
              {totals.totalCredits}
            </td>
            <td className={cn("px-3 py-2", amountCell)}>
              {totals.totalClosing}
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── GL Detail Tab ────────────────────────────────────────────────────

function GLDetailTab({
  rows,
  reversalMode,
  onReversalModeChange,
  onAccountFilter,
  onDateRangeChange,
}: {
  rows: GLDetailRow[];
  reversalMode: ReversalHandlingMode;
  onReversalModeChange?: (mode: ReversalHandlingMode) => void;
  onAccountFilter?: (accountId: string) => void;
  onDateRangeChange?: (from: string, to: string) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Account</Label>
          <Input
            placeholder="Filter by account..."
            onChange={(e) => onAccountFilter?.(e.target.value)}
            className="h-8 w-48 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date From</Label>
          <Input
            type="date"
            onChange={(e) => onDateRangeChange?.(e.target.value, "")}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date To</Label>
          <Input
            type="date"
            onChange={(e) => onDateRangeChange?.("", e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Reversals</Label>
          <div className="flex gap-1">
            {(["NETTED", "SEPARATE", "EXCLUDED"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onReversalModeChange?.(mode)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  reversalMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                JE #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Description
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Debit
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Credit
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Running Balance
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Doc Type
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No detail records.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={`${row.journalEntryId}-${row.jeNumber}`}
                className="border-b last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-mono text-xs">{row.jeNumber}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.postingDate}
                </td>
                <td className="px-3 py-2">{row.description}</td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {row.debitAmount}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {row.creditAmount}
                </td>
                <td
                  className={cn(
                    "px-3 py-2",
                    amountCell,
                    "font-medium",
                    isNegative(row.runningBalance) &&
                      "text-red-600 dark:text-red-400",
                  )}
                >
                  {row.runningBalance}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">
                    {row.docType}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Trial Balance Tab ────────────────────────────────────────────────

function TrialBalanceTab({
  rows,
  totals,
  isBalanced,
}: {
  rows: TrialBalanceRow[];
  totals: { totalDebits: string; totalCredits: string };
  isBalanced: boolean;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Account
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Debit Balance
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Credit Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No trial balance data.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.accountId}
                className="border-b last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-mono text-xs">{row.accountId}</td>
                <td className="px-3 py-2">{row.accountName}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">
                    {row.accountType}
                  </Badge>
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {row.debitBalance}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {row.creditBalance}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50 font-medium">
              <td
                colSpan={3}
                className="px-3 py-2 text-right text-xs text-muted-foreground"
              >
                Totals
              </td>
              <td className={cn("px-3 py-2", amountCell)}>
                {totals.totalDebits}
              </td>
              <td className={cn("px-3 py-2", amountCell)}>
                {totals.totalCredits}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Balance check */}
      {isBalanced ? (
        <Badge
          variant="outline"
          className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
        >
          <Check className="size-3 mr-1" />
          Trial Balance in Balance
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          <AlertCircle className="size-3 mr-1" />
          Trial Balance Out of Balance
        </Badge>
      )}
    </div>
  );
}
