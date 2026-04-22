"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "../components/format";
import { StatementLayout, StatementTotal } from "../components/StatementLayout";
import { StatementSection } from "../components/StatementSection";
import type { FinanceScope } from "../lib/scope";
import { useBalanceSheet } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";

interface BalanceSheetViewProps {
  scope: FinanceScope;
  onDrillDown?: (accountCode: string) => void;
}

export function BalanceSheetView({ scope, onDrillDown }: BalanceSheetViewProps) {
  const { data, isLoading, isError } = useBalanceSheet(scope);
  const { data: periodData } = usePeriodStatus(scope);

  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;
  const showComparative = !!scope.comparative;

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to view the balance sheet.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading balance sheet…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load balance sheet.
      </div>
    );
  }

  const assetSections    = data.assets ?? [];
  const liabilitySections = data.liabilities ?? [];
  const equitySections   = data.equity ?? [];

  return (
    <StatementLayout
      title="Balance Sheet"
      companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
      fiscalYear={scope.fiscalYear}
      period={scope.period}
      periodStatus={effectiveStatus}
      currentLabel={String(scope.fiscalYear)}
      priorLabel={String(scope.fiscalYear - 1)}
      showComparative={showComparative}
      isLive={data.isLive}
      footer={
        <div className="space-y-0.5">
          <StatementTotal
            label="Total Liabilities & Equity"
            current={data.totalLiabilitiesAndEquity}
            prior={data.priorTotalLiabilities !== undefined && data.priorTotalEquity !== undefined
              ? data.priorTotalLiabilities + data.priorTotalEquity
              : undefined}
            showComparative={showComparative}
            borderTop
          />
          <div className={cn(
            "text-doc-label px-2 py-0.5 text-right",
            Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01
              ? "text-success"
              : "text-destructive",
          )}>
            {Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01
              ? "✓ Balanced"
              : `Off-balance: ${fmtCompact(data.totalAssets - data.totalLiabilitiesAndEquity)}`}
          </div>
        </div>
      }
    >
      {/* Assets */}
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">Assets</span>
        </div>
        {assetSections.map((sec) => (
          <StatementSection
            key={sec.code}
            title={sec.label}
            rows={sec.rows}
            total={sec.total}
            priorTotal={sec.priorTotal}
            showComparative={showComparative}
            indent={1}
          />
        ))}
        <StatementTotal
          label="Total Assets"
          current={data.totalAssets}
          prior={data.priorTotalAssets}
          showComparative={showComparative}
          borderTop
        />
      </div>

      {/* Liabilities */}
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">Liabilities</span>
        </div>
        {liabilitySections.map((sec) => (
          <StatementSection
            key={sec.code}
            title={sec.label}
            rows={sec.rows}
            total={sec.total}
            priorTotal={sec.priorTotal}
            showComparative={showComparative}
            indent={1}
          />
        ))}
        <StatementTotal
          label="Total Liabilities"
          current={data.totalLiabilities}
          prior={data.priorTotalLiabilities}
          showComparative={showComparative}
          borderTop
        />
      </div>

      {/* Equity */}
      <div>
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">Equity</span>
        </div>
        {equitySections.map((sec) => (
          <StatementSection
            key={sec.code}
            title={sec.label}
            rows={sec.rows}
            total={sec.total}
            priorTotal={sec.priorTotal}
            showComparative={showComparative}
            indent={1}
          />
        ))}
        <StatementTotal
          label="Total Equity"
          current={data.totalEquity}
          prior={data.priorTotalEquity}
          showComparative={showComparative}
          borderTop
        />
      </div>
    </StatementLayout>
  );
}
