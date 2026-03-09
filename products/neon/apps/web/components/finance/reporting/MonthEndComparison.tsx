"use client";

// components/finance/reporting/MonthEndComparison.tsx
//
// Month-end comparative analysis table showing account balances
// across multiple periods side-by-side. Used for period close review,
// trend analysis, and variance spotting.

import { Card } from "@neon/ui";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/finance/export-csv";
import { ReportSkeleton } from "./ReportSkeleton";

import type { MonthEndComparisonDTO } from "@/lib/finance/reporting-types";
import { sumAmounts, subtractAmounts, compareAmounts } from "@athyper/runtime/services/business/engines/shared/money";

// ── Types ─────────────────────────────────────────────────────────

interface MonthEndComparisonProps {
  accounts: MonthEndComparisonDTO[];
  periodNumbers: number[];
  fiscalYear: number;
  loading?: boolean;
  currencyCode?: string;
  bookCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function formatAmount(value: string): string {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value || "0");
  if (num === 0) return "—";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

function periodLabel(periodNumber: number): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return months[periodNumber - 1] ?? `P${periodNumber}`;
}

// ── Component ─────────────────────────────────────────────────────

export function MonthEndComparison({
  accounts,
  periodNumbers,
  fiscalYear,
  loading,
  currencyCode = "USD",
  bookCode,
}: MonthEndComparisonProps) {
  if (loading) {
    return <ReportSkeleton rows={10} columns={2 + periodNumbers.length} />;
  }

  if (accounts.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No month-end data available. Ensure the reporting cube has been refreshed.
      </div>
    );
  }

  // Group accounts by type for visual separation
  const revenueAccounts = accounts.filter((a) => a.accountType === "REVENUE");
  const expenseAccounts = accounts.filter((a) => a.accountType === "EXPENSE");
  const otherAccounts = accounts.filter(
    (a) => a.accountType !== "REVENUE" && a.accountType !== "EXPENSE",
  );

  const handleExportCsv = () => {
    const headers = ["Account Code", "Account Name", "Type", ...periodNumbers.map((p) => `${periodLabel(p)} ${fiscalYear}`)];
    const csvRows = accounts.map((a) => {
      const periodMap = new Map(a.periods.map((p) => [p.periodNumber, p]));
      return [
        a.accountCode,
        a.accountName,
        a.accountType,
        ...periodNumbers.map((p) => periodMap.get(p)?.amountNet ?? "0"),
      ];
    });
    const isoDate = new Date().toISOString().slice(0, 10);
    downloadCsv(`month-end-${bookCode ?? "stat"}-fy${fiscalYear}-${isoDate}.csv`, headers, csvRows);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
        >
          <Download className="size-3" />
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[200px]">
              Account
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-16">
              Type
            </th>
            {periodNumbers.map((p) => (
              <th
                key={p}
                className={cn(
                  "px-3 py-2 text-xs font-medium text-muted-foreground min-w-[100px]",
                  amountCell,
                )}
              >
                {periodLabel(p)} {fiscalYear}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Revenue Section */}
          {revenueAccounts.length > 0 && (
            <>
              <tr className="bg-green-50/50 dark:bg-green-950/10">
                <td
                  colSpan={2 + periodNumbers.length}
                  className="px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400"
                >
                  Revenue
                </td>
              </tr>
              {revenueAccounts.map((account) => (
                <AccountRow
                  key={account.accountCode}
                  account={account}
                  periodNumbers={periodNumbers}
                />
              ))}
              {/* Revenue subtotals */}
              <SubtotalRow
                label="Total Revenue"
                accounts={revenueAccounts}
                periodNumbers={periodNumbers}
                className="text-green-700 dark:text-green-400"
              />
            </>
          )}

          {/* Expense Section */}
          {expenseAccounts.length > 0 && (
            <>
              <tr className="bg-red-50/50 dark:bg-red-950/10">
                <td
                  colSpan={2 + periodNumbers.length}
                  className="px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400"
                >
                  Expenses
                </td>
              </tr>
              {expenseAccounts.map((account) => (
                <AccountRow
                  key={account.accountCode}
                  account={account}
                  periodNumbers={periodNumbers}
                />
              ))}
              <SubtotalRow
                label="Total Expenses"
                accounts={expenseAccounts}
                periodNumbers={periodNumbers}
                className="text-red-700 dark:text-red-400"
              />
            </>
          )}

          {/* Net Income Row */}
          {revenueAccounts.length > 0 && expenseAccounts.length > 0 && (
            <NetIncomeRow
              revenueAccounts={revenueAccounts}
              expenseAccounts={expenseAccounts}
              periodNumbers={periodNumbers}
            />
          )}

          {/* Other account types */}
          {otherAccounts.length > 0 && (
            <>
              <tr className="bg-muted/30">
                <td
                  colSpan={2 + periodNumbers.length}
                  className="px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                >
                  Other
                </td>
              </tr>
              {otherAccounts.map((account) => (
                <AccountRow
                  key={account.accountCode}
                  account={account}
                  periodNumbers={periodNumbers}
                />
              ))}
            </>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function AccountRow({
  account,
  periodNumbers,
}: {
  account: MonthEndComparisonDTO;
  periodNumbers: number[];
}) {
  // Build a map of period -> data for this account
  const periodMap = new Map(
    account.periods.map((p) => [p.periodNumber, p]),
  );

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="sticky left-0 z-10 bg-background px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground mr-2">
          {account.accountCode}
        </span>
        <span>{account.accountName}</span>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs text-muted-foreground">{account.accountType}</span>
      </td>
      {periodNumbers.map((p) => {
        const data = periodMap.get(p);
        const amount = data?.amountNet ?? "0";
        return (
          <td
            key={p}
            className={cn(
              "px-3 py-2",
              amountCell,
              isNegative(amount) && "text-red-600 dark:text-red-400",
            )}
          >
            {formatAmount(amount)}
          </td>
        );
      })}
    </tr>
  );
}

function SubtotalRow({
  label,
  accounts,
  periodNumbers,
  className,
}: {
  label: string;
  accounts: MonthEndComparisonDTO[];
  periodNumbers: number[];
  className?: string;
}) {
  return (
    <tr className="border-b bg-muted/30 font-medium">
      <td colSpan={2} className={cn("px-3 py-2 text-right text-xs", className)}>
        {label}
      </td>
      {periodNumbers.map((p) => {
        const amounts = accounts
          .map((account) => account.periods.find((pd) => pd.periodNumber === p)?.amountNet)
          .filter((v): v is string => v != null);
        const total = sumAmounts(amounts);
        return (
          <td key={p} className={cn("px-3 py-2", amountCell, className)}>
            {formatAmount(total)}
          </td>
        );
      })}
    </tr>
  );
}

function NetIncomeRow({
  revenueAccounts,
  expenseAccounts,
  periodNumbers,
}: {
  revenueAccounts: MonthEndComparisonDTO[];
  expenseAccounts: MonthEndComparisonDTO[];
  periodNumbers: number[];
}) {
  return (
    <tr className="border-t-2 border-b bg-primary/5 font-semibold">
      <td colSpan={2} className="px-3 py-2 text-right text-xs">
        Net Income
      </td>
      {periodNumbers.map((p) => {
        const revAmounts = revenueAccounts
          .map((a) => a.periods.find((pd) => pd.periodNumber === p)?.amountNet)
          .filter((v): v is string => v != null);
        const expAmounts = expenseAccounts
          .map((a) => a.periods.find((pd) => pd.periodNumber === p)?.amountNet)
          .filter((v): v is string => v != null);
        const netIncome = subtractAmounts(sumAmounts(revAmounts), sumAmounts(expAmounts));
        return (
          <td
            key={p}
            className={cn(
              "px-3 py-2",
              amountCell,
              compareAmounts(netIncome, "0") < 0
                ? "text-red-600 dark:text-red-400"
                : "text-green-700 dark:text-green-400",
            )}
          >
            {formatAmount(netIncome)}
          </td>
        );
      })}
    </tr>
  );
}
