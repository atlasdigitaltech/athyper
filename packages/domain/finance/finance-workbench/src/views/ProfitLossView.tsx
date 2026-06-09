"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "../components/format";
import { StatementLayout, type StatementSummaryMetric } from "../components/StatementLayout";
import { StatementMatrix, type StatementMatrixGroup, type StatementMatrixTotalRow } from "../components/StatementMatrix";
import { StatementSection } from "../components/StatementSection";
import { FinanceContextBar } from "../components/FinanceContextBar";
import { ReportGraphMetric, StatementColumnHeader } from "../components/ReportScaffold";
import type { FinanceScope } from "../lib/scope";
import { useProfitLoss, type StatementBucket, type StatementSection as StatementSectionData } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";
import { useStatementReportingLens } from "../hooks/useStatementReportingLens";

interface ProfitLossViewProps {
  scope: FinanceScope;
  onDrillDown?: (accountCode: string) => void;
  showGraph?: boolean;
  onShowGraphChange?: (enabled: boolean) => void;
  moveReportingControlsToHeader?: boolean;
}

interface ProfitLossGraphPoint {
  key: string;
  label: string;
  revenue: number;
  operatingExpenses: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
}

function sumTotals(sections: Array<{ total: number }>): number {
  return sections.reduce((sum, section) => sum + section.total, 0);
}

function sumPriorTotals(sections: Array<{ priorTotal?: number }>): number | undefined {
  const values = sections.map((section) => section.priorTotal).filter((value): value is number => value !== undefined);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

function margin(value: number, base: number): number | null {
  if (base === 0) return null;
  return (value / Math.abs(base)) * 100;
}

function bucketTotals(
  buckets: StatementBucket[],
  sections: StatementSectionData[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of buckets) {
    out[bucket.key] = sections.reduce((sum, section) => sum + (section.bucketTotals?.[bucket.key] ?? 0), 0);
  }
  return out;
}

function subtractBucketTotals(
  buckets: StatementBucket[],
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of buckets) {
    out[bucket.key] = (left[bucket.key] ?? 0) - (right[bucket.key] ?? 0);
  }
  return out;
}

function bucketModeLabel(mode?: "fiscal_year" | "fiscal_quarter" | "fiscal_period"): string {
  switch (mode) {
    case "fiscal_year":
      return "Year";
    case "fiscal_quarter":
      return "Quarter";
    case "fiscal_period":
      return "Fiscal period";
    default:
      return "Period";
  }
}

function graphRange(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  if (max === min) return { max: max + 1, min: min - 1 };
  const padding = (max - min) * 0.12;
  return { max: max + padding, min: min - padding };
}

function xForIndex(index: number, count: number, width: number, padX: number): number {
  if (count <= 1) return width / 2;
  return padX + (index / (count - 1)) * (width - padX * 2);
}

function makeLinePath(
  points: ProfitLossGraphPoint[],
  valueOf: (point: ProfitLossGraphPoint) => number,
  yForValue: (value: number) => number,
  width: number,
  padX: number,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const x = xForIndex(0, 1, width, padX);
    const y = yForValue(valueOf(points[0]!));
    return `M ${x - 24} ${y} L ${x + 24} ${y}`;
  }
  return points
    .map((point, index) => {
      const x = xForIndex(index, points.length, width, padX);
      const y = yForValue(valueOf(point));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function makeAreaPath(
  points: ProfitLossGraphPoint[],
  valueOf: (point: ProfitLossGraphPoint) => number,
  yForValue: (value: number) => number,
  baselineY: number,
  width: number,
  padX: number,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const x = xForIndex(0, 1, width, padX);
    const y = yForValue(valueOf(points[0]!));
    return `M ${x - 26} ${baselineY} L ${x} ${y} L ${x + 26} ${baselineY} Z`;
  }

  const line = makeLinePath(points, valueOf, yForValue, width, padX);
  const firstX = xForIndex(0, points.length, width, padX);
  const lastX = xForIndex(points.length - 1, points.length, width, padX);
  return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
}

function ProfitLossTrendGraph({
  points,
  modeLabel,
  accumulatedValues,
}: {
  points: ProfitLossGraphPoint[];
  modeLabel: string;
  accumulatedValues?: boolean;
}) {
  if (points.length === 0) return null;

  const width = 720;
  const height = 188;
  const padX = 34;
  const padTop = 14;
  const padBottom = 34;
  const chartHeight = height - padTop - padBottom;
  const values = points.flatMap((point) => [
    point.revenue,
    point.operatingExpenses,
    point.grossProfit,
    point.operatingProfit,
    point.netProfit,
  ]);
  const { max, min } = graphRange(values);
  const yForValue = (value: number) => padTop + ((max - value) / (max - min)) * chartHeight;
  const baselineY = yForValue(0);
  const latest = points[points.length - 1]!;
  const netTone = latest.netProfit >= 0 ? "text-success" : "text-destructive";
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const chartKey = points.map((point) => point.key).join("|");

  return (
    <section
      key={chartKey}
      className="mb-3 mt-3 overflow-hidden rounded-lg border bg-card animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-3 py-2">
        <div>
          <div className="text-sm font-medium">P&L movement</div>
          <div className="text-xs text-muted-foreground">
            Revenue, operating expenses, and net profit by {modeLabel.toLowerCase()}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border bg-background px-2 py-0.5 font-medium text-muted-foreground">
            {modeLabel}
          </span>
          {accumulatedValues !== undefined && (
            <span className="rounded-full border bg-background px-2 py-0.5 font-medium text-muted-foreground">
              {accumulatedValues ? "Accumulated" : "Movement"}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Profit and loss movement graph"
            className="h-56 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="plRevenueArea" x1="0" x2="0" y1="0" y2="1">
                <stop className="text-success" offset="0%" stopColor="currentColor" stopOpacity="0.38" />
                <stop className="text-success" offset="100%" stopColor="currentColor" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id="plExpenseArea" x1="0" x2="0" y1="0" y2="1">
                <stop className="text-warning" offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop className="text-warning" offset="100%" stopColor="currentColor" stopOpacity="0.03" />
              </linearGradient>
            </defs>

            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={padX}
                x2={width - padX}
                y1={padTop + chartHeight * ratio}
                y2={padTop + chartHeight * ratio}
                stroke="currentColor"
                className="text-border"
                strokeOpacity="0.55"
              />
            ))}
            <line
              x1={padX}
              x2={width - padX}
              y1={baselineY}
              y2={baselineY}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeOpacity="0.25"
            />

            <path
              d={makeAreaPath(points, (point) => point.operatingExpenses, yForValue, baselineY, width, padX)}
              fill="url(#plExpenseArea)"
            />
            <path
              d={makeAreaPath(points, (point) => point.revenue, yForValue, baselineY, width, padX)}
              fill="url(#plRevenueArea)"
            />
            <path
              d={makeLinePath(points, (point) => point.operatingExpenses, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className="text-warning"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={makeLinePath(points, (point) => point.revenue, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className="text-success"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={makeLinePath(points, (point) => point.netProfit, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className={netTone}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />

            {points.map((point, index) => {
              const x = xForIndex(index, points.length, width, padX);
              const showLabel = points.length <= 5 || index === 0 || index === points.length - 1 || index % labelEvery === 0;
              return (
                <g key={point.key}>
                  <circle
                    cx={x}
                    cy={yForValue(point.netProfit)}
                    r="3"
                    fill="currentColor"
                    className={point.netProfit >= 0 ? "text-success" : "text-destructive"}
                  />
                  {showLabel && (
                    <text
                      x={x}
                      y={height - 10}
                      textAnchor="middle"
                      className="fill-muted-foreground text-xs"
                    >
                      {point.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="grid gap-2 text-sm">
          <ReportGraphMetric label="Revenue" value={latest.revenue} tone="success" />
          <ReportGraphMetric label="Gross Profit" value={latest.grossProfit} tone={latest.grossProfit >= 0 ? "success" : "danger"} />
          <ReportGraphMetric label="Operating Expenses" value={latest.operatingExpenses} tone="neutral" />
          <ReportGraphMetric label="Net Profit / Loss" value={latest.netProfit} tone={latest.netProfit >= 0 ? "success" : "danger"} />
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Revenue</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Expenses</span>
            <span className={cn("inline-flex items-center gap-1", netTone)}><span className="h-2 w-2 rounded-full bg-current" /> Net</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProfitLossView({
  scope,
  onDrillDown,
  showGraph = false,
  onShowGraphChange,
  moveReportingControlsToHeader = false,
}: ProfitLossViewProps) {
  const { data, isLoading, isError } = useProfitLoss(scope);
  const { data: periodData } = usePeriodStatus(scope);
  const reportingLens = useStatementReportingLens(scope);

  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;
  const hasBuckets = (data?.buckets?.length ?? 0) > 0;
  const showComparative = !!scope.comparative && !hasBuckets;

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
        Loading profit & loss...
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

  const totalRevenue = sumTotals(data.revenue);
  const priorRevenue = sumPriorTotals(data.revenue);
  const totalOperatingExpenses = sumTotals(data.operatingExpenses);
  const priorOperatingExpenses = sumPriorTotals(data.operatingExpenses);
  const grossMargin = margin(data.grossProfit, totalRevenue);
  const netMargin = margin(data.netProfit, totalRevenue);
  const buckets = data.buckets ?? [];
  const revenueBucketTotals = bucketTotals(buckets, data.revenue);
  const costOfSalesBucketTotals = bucketTotals(buckets, data.costOfSales);
  const grossProfitBucketTotals = subtractBucketTotals(buckets, revenueBucketTotals, costOfSalesBucketTotals);
  const operatingExpenseBucketTotals = bucketTotals(buckets, data.operatingExpenses);
  const operatingProfitBucketTotals = subtractBucketTotals(buckets, grossProfitBucketTotals, operatingExpenseBucketTotals);
  const otherIncomeBucketTotals = bucketTotals(buckets, data.otherIncome);
  const otherExpenseBucketTotals = bucketTotals(buckets, data.otherExpenses);
  const netProfitBucketTotals = subtractBucketTotals(
    buckets,
    Object.fromEntries(buckets.map((bucket) => [
      bucket.key,
      (operatingProfitBucketTotals[bucket.key] ?? 0) + (otherIncomeBucketTotals[bucket.key] ?? 0),
    ])),
    otherExpenseBucketTotals,
  );
  const matrixGroups: StatementMatrixGroup[] = [
    { key: "revenue", title: "Revenue", sections: data.revenue },
    { key: "cost-of-sales", title: "Cost of Sales", sections: data.costOfSales },
    { key: "operating-expenses", title: "Operating Expenses", sections: data.operatingExpenses },
    { key: "other-income", title: "Other Income", sections: data.otherIncome },
    { key: "other-expenses", title: "Other Expenses", sections: data.otherExpenses },
  ].filter((group) => group.sections.length > 0);
  const matrixTotals: StatementMatrixTotalRow[] = [
    { key: "gross-profit", label: "Gross Profit", values: grossProfitBucketTotals },
    { key: "operating-profit", label: "Operating Profit", values: operatingProfitBucketTotals },
    {
      key: "net-profit",
      label: "Net Profit / (Loss)",
      values: netProfitBucketTotals,
      tone: Object.values(netProfitBucketTotals).some((value) => value < -0.005) ? "danger" : "success",
    },
  ];
  const graphPoints: ProfitLossGraphPoint[] = buckets.length > 0
    ? buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      revenue: revenueBucketTotals[bucket.key] ?? 0,
      operatingExpenses: operatingExpenseBucketTotals[bucket.key] ?? 0,
      grossProfit: grossProfitBucketTotals[bucket.key] ?? 0,
      operatingProfit: operatingProfitBucketTotals[bucket.key] ?? 0,
      netProfit: netProfitBucketTotals[bucket.key] ?? 0,
    }))
    : [
      ...(showComparative && priorRevenue !== undefined && data.priorGrossProfit !== undefined && data.priorOperatingProfit !== undefined && data.priorNetProfit !== undefined
        ? [{
          key: "prior",
          label: reportingLens.priorLabel,
          revenue: priorRevenue,
          operatingExpenses: priorOperatingExpenses ?? 0,
          grossProfit: data.priorGrossProfit,
          operatingProfit: data.priorOperatingProfit,
          netProfit: data.priorNetProfit,
        }]
        : []),
      {
        key: "current",
        label: reportingLens.currentLabel,
        revenue: totalRevenue,
        operatingExpenses: totalOperatingExpenses,
        grossProfit: data.grossProfit,
        operatingProfit: data.operatingProfit,
        netProfit: data.netProfit,
      },
    ];

  const summaryMetrics: StatementSummaryMetric[] = [
    {
      key: "net-profit",
      label: "Net Profit / Loss",
      value: data.netProfit,
      prior: data.priorNetProfit,
      primary: true,
      tone: data.netProfit >= 0 ? "success" : "danger",
      positiveIsGood: true,
      description: netMargin === null ? undefined : `Net margin ${netMargin.toFixed(1)}%`,
    },
    {
      key: "revenue",
      label: "Revenue",
      value: totalRevenue,
      prior: priorRevenue,
      tone: totalRevenue >= 0 ? "success" : "danger",
      positiveIsGood: true,
    },
    {
      key: "gross-profit",
      label: "Gross Profit",
      value: data.grossProfit,
      prior: data.priorGrossProfit,
      tone: data.grossProfit >= 0 ? "success" : "danger",
      positiveIsGood: true,
      description: grossMargin === null ? undefined : `Gross margin ${grossMargin.toFixed(1)}%`,
    },
    {
      key: "operating-profit",
      label: "Operating Profit",
      value: data.operatingProfit,
      prior: data.priorOperatingProfit,
      tone: data.operatingProfit >= 0 ? "success" : "danger",
      positiveIsGood: true,
    },
    {
      key: "operating-expenses",
      label: "Operating Expenses",
      value: totalOperatingExpenses,
      prior: priorOperatingExpenses,
      tone: "neutral",
      positiveIsGood: false,
    },
  ];

  return (
    <StatementLayout
      title="Profit & Loss"
      companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
      fiscalYear={scope.fiscalYear}
      period={scope.period}
      periodStatus={reportingLens.isFiscalLens ? effectiveStatus : null}
      periodDisplayLabel={reportingLens.headerLabel}
      currentLabel={reportingLens.currentLabel}
      priorLabel={reportingLens.priorLabel}
      showComparative={showComparative}
      isLive={data.isLive}
      summaryTitle="P&L Intelligence"
      summarySubtitle={reportingLens.summarySubtitle}
      summaryMetrics={hasBuckets ? undefined : summaryMetrics}
      summaryInsight={hasBuckets ? undefined : {
        label: "Profitability",
        value: netMargin === null ? "No revenue" : `${netMargin.toFixed(1)}%`,
        description: `Gross profit ${fmtCompact(data.grossProfit)}; operating profit ${fmtCompact(data.operatingProfit)}.`,
        tone: data.netProfit >= 0 ? "success" : "danger",
      }}
      comparisonLabel={showComparative ? "Prior year" : reportingLens.comparisonLabel}
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
    >
      {showGraph && (
        <ProfitLossTrendGraph
          points={graphPoints}
          modeLabel={buckets.length > 0 ? bucketModeLabel(data.bucketMode) : "Report"}
          accumulatedValues={buckets.length > 0 ? data.accumulatedValues : undefined}
        />
      )}
      {hasBuckets ? (
        <StatementMatrix
          buckets={buckets}
          groups={matrixGroups}
          totals={matrixTotals}
          onRowSelect={onDrillDown}
        />
      ) : (
        <>
      <StatementColumnHeader
        currentLabel={reportingLens.currentLabel}
        priorLabel={reportingLens.priorLabel}
        showComparative={showComparative}
      />
      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-xs font-medium text-muted-foreground">Revenue</span>
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
            onRowSelect={onDrillDown}
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
            onRowSelect={onDrillDown}
          />
        ))}
      </div>

      {data.operatingExpenses.length > 0 && (
        <div className="border-b">
          <div className="px-2 py-1 bg-muted/10">
            <span className="text-xs font-medium text-muted-foreground">Operating Expenses</span>
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
              onRowSelect={onDrillDown}
            />
          ))}
        </div>
      )}

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
              onRowSelect={onDrillDown}
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
              onRowSelect={onDrillDown}
            />
          ))}
        </div>
      )}
        </>
      )}
    </StatementLayout>
  );
}
