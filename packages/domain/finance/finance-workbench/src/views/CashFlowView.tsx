"use client";

import { StatementLayout, StatementTotal } from "../components/StatementLayout";
import { StatementSection } from "../components/StatementSection";
import { fmtFull } from "../components/format";
import type { FinanceScope } from "../lib/scope";
import { useCashFlow } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";

interface CashFlowViewProps {
  scope: FinanceScope;
}

export function CashFlowView({ scope }: CashFlowViewProps) {
  const { data, isLoading, isError } = useCashFlow(scope);
  const { data: periodData } = usePeriodStatus(scope);

  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;
  const showComparative = !!scope.comparative;

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to view the cash flow statement.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading cash flow…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load cash flow statement.
      </div>
    );
  }

  return (
    <StatementLayout
      title="Cash Flow Statement"
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
            label="Net Change in Cash"
            current={data.netChange}
            prior={data.priorNetChange}
            showComparative={showComparative}
            borderTop
          />
          <div className="flex justify-between px-2 py-1 text-xs text-muted-foreground border-t">
            <span>Opening cash balance</span>
            <span className="font-mono">{fmtFull(data.openingCash)}</span>
          </div>
          <div className="flex justify-between px-2 py-1 text-xs font-semibold border-t-2">
            <span>Closing cash balance</span>
            <span className="font-mono">{fmtFull(data.closingCash)}</span>
          </div>
        </div>
      }
    >
      {/* Operating Activities */}
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">
            Operating Activities
          </span>
        </div>
        {data.operating.map((sec) => (
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
          label="Net Cash from Operating"
          current={data.netOperating}
          prior={data.priorNetOperating}
          showComparative={showComparative}
          borderTop
        />
      </div>

      {/* Investing Activities */}
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">
            Investing Activities
          </span>
        </div>
        {data.investing.map((sec) => (
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
          label="Net Cash from Investing"
          current={data.netInvesting}
          prior={data.priorNetInvesting}
          showComparative={showComparative}
          borderTop
        />
      </div>

      {/* Financing Activities */}
      <div>
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-doc-support font-semibold uppercase text-muted-foreground tracking-wide">
            Financing Activities
          </span>
        </div>
        {data.financing.map((sec) => (
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
          label="Net Cash from Financing"
          current={data.netFinancing}
          prior={data.priorNetFinancing}
          showComparative={showComparative}
          borderTop
        />
      </div>
    </StatementLayout>
  );
}
