"use client";

import { StatementLayout, StatementTotal } from "../components/StatementLayout";
import { StatementSection } from "../components/StatementSection";
import type { FinanceScope } from "../lib/scope";
import { useProfitLoss } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";

interface ProfitLossViewProps {
  scope: FinanceScope;
  onDrillDown?: (accountCode: string) => void;
}

export function ProfitLossView({ scope, onDrillDown }: ProfitLossViewProps) {
  const { data, isLoading, isError } = useProfitLoss(scope);
  const { data: periodData } = usePeriodStatus(scope);

  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;
  const showComparative = !!scope.comparative;

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to view the P&L.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading profit & loss…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load profit & loss.
      </div>
    );
  }

  return (
    <StatementLayout
      title="Profit & Loss"
      companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
      fiscalYear={scope.fiscalYear}
      period={scope.period}
      periodStatus={effectiveStatus}
      currentLabel={String(scope.fiscalYear)}
      priorLabel={String(scope.fiscalYear - 1)}
      showComparative={showComparative}
      isLive={data.isLive}
      footer={
        <StatementTotal
          label="Net Profit / (Loss)"
          current={data.netProfit}
          prior={data.priorNetProfit}
          showComparative={showComparative}
          bold
          borderTop
        />
      }
    >
      {/* Revenue */}
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Revenue</span>
        </div>
        {data.revenue.map((sec) => (
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
        {data.costOfSales.length > 0 && data.costOfSales.map((sec) => (
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
          label="Gross Profit"
          current={data.grossProfit}
          prior={data.priorGrossProfit}
          showComparative={showComparative}
          borderTop
        />
      </div>

      {/* Operating Expenses */}
      {data.operatingExpenses.length > 0 && (
        <div className="border-b">
          <div className="px-2 py-1 bg-muted/10">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Operating Expenses</span>
          </div>
          {data.operatingExpenses.map((sec) => (
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
            label="Operating Profit"
            current={data.operatingProfit}
            prior={data.priorOperatingProfit}
            showComparative={showComparative}
            borderTop
          />
        </div>
      )}

      {/* Other income / expenses */}
      {(data.otherIncome.length > 0 || data.otherExpenses.length > 0) && (
        <div>
          {data.otherIncome.map((sec) => (
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
          {data.otherExpenses.map((sec) => (
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
        </div>
      )}
    </StatementLayout>
  );
}
