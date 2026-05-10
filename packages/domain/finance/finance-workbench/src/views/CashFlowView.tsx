"use client";

import { StatementLayout, StatementTotal } from "../components/StatementLayout";
import { StatementSection } from "../components/StatementSection";
import { FinanceContextBar } from "../components/FinanceContextBar";
import { ReportGraphMetric, StatementColumnHeader } from "../components/ReportScaffold";
import { fmtCompact, fmtFull } from "../components/format";
import type { FinanceScope } from "../lib/scope";
import { useCashFlow } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";
import { useStatementReportingLens } from "../hooks/useStatementReportingLens";

interface CashFlowViewProps {
  scope: FinanceScope;
  showGraph?: boolean;
  onShowGraphChange?: (enabled: boolean) => void;
  moveReportingControlsToHeader?: boolean;
}

function CashFlowMovementGraph({
  operating,
  investing,
  financing,
  netChange,
  openingCash,
  closingCash,
}: {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
}) {
  const flows = [
    { label: "Operating", value: operating },
    { label: "Investing", value: investing },
    { label: "Financing", value: financing },
  ];
  const max = Math.max(...flows.map((flow) => Math.abs(flow.value)), Math.abs(netChange), 1);

  return (
    <section className="mb-3 mt-3 overflow-hidden rounded-lg border bg-card animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-3 py-2">
        <div>
          <div className="text-sm font-semibold">Cash movement</div>
          <div className="text-xs text-muted-foreground">
            Operating, investing, and financing cash movements
          </div>
        </div>
        <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Movement
        </span>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid gap-2">
          {flows.map((flow) => {
            const width = Math.max(4, (Math.abs(flow.value) / max) * 100);
            const positive = flow.value >= 0;
            return (
              <div key={flow.label} className="grid grid-cols-[7rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-foreground">{flow.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className={positive ? "block h-full rounded-full bg-success" : "block h-full rounded-full bg-destructive"}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className={positive ? "text-right font-semibold tabular-nums text-success" : "text-right font-semibold tabular-nums text-destructive"}>
                  {fmtCompact(flow.value)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2 text-sm">
          <ReportGraphMetric label="Net Change" value={netChange} tone={netChange >= 0 ? "success" : "danger"} />
          <ReportGraphMetric label="Opening Cash" value={openingCash} tone="neutral" />
          <ReportGraphMetric label="Closing Cash" value={closingCash} tone={closingCash >= openingCash ? "success" : "neutral"} />
        </div>
      </div>
    </section>
  );
}

export function CashFlowView({
  scope,
  showGraph = false,
  onShowGraphChange,
  moveReportingControlsToHeader = false,
}: CashFlowViewProps) {
  const { data, isLoading, isError } = useCashFlow(scope);
  const { data: periodData } = usePeriodStatus(scope);
  const reportingLens = useStatementReportingLens(scope);

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
      periodStatus={reportingLens.isFiscalLens ? effectiveStatus : null}
      periodDisplayLabel={reportingLens.headerLabel}
      currentLabel={reportingLens.currentLabel}
      priorLabel={reportingLens.priorLabel}
      showComparative={showComparative}
      isLive={data.isLive}
      hideColumnHeader
      rightHeaderControls={
        moveReportingControlsToHeader ? (
          <FinanceContextBar
            variant="inline"
            className="shrink-0 justify-end gap-x-2"
            hideScope
            hideFiscalLens
            showGraphViewToggle={!!onShowGraphChange}
            graphViewEnabled={showGraph}
            onGraphViewChange={onShowGraphChange}
          />
        ) : undefined
      }
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
      {showGraph && (
        <CashFlowMovementGraph
          operating={data.netOperating}
          investing={data.netInvesting}
          financing={data.netFinancing}
          netChange={data.netChange}
          openingCash={data.openingCash}
          closingCash={data.closingCash}
        />
      )}

      <StatementColumnHeader
        currentLabel={reportingLens.currentLabel}
        priorLabel={reportingLens.priorLabel}
        showComparative={showComparative}
      />

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
