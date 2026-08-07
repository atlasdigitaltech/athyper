"use client";

import { cn } from "@athyper/platform-theme/utils";
import { fmtCompact } from "../components/format";
import { StatementLayout, type StatementSummaryMetric } from "../components/StatementLayout";
import { StatementMatrix, type StatementMatrixGroup, type StatementMatrixTotalRow } from "../components/StatementMatrix";
import { StatementSection } from "../components/StatementSection";
import { FinanceContextBar } from "../components/FinanceContextBar";
import { ReportGraphMetric, StatementColumnHeader } from "../components/ReportScaffold";
import type { FinanceScope } from "../lib/scope";
import { useBalanceSheet, type StatementBucket, type StatementSection as StatementSectionData } from "../hooks/useFinancialStatements";
import { usePeriodStatus } from "../hooks/usePeriodStatus";
import { useStatementReportingLens } from "../hooks/useStatementReportingLens";

interface BalanceSheetViewProps {
  scope: FinanceScope;
  onDrillDown?: (accountCode: string) => void;
  showGraph?: boolean;
  onShowGraphChange?: (enabled: boolean) => void;
  hideStatementTitle?: boolean;
  repeatHeaderControls?: boolean;
  moveReportingControlsToHeader?: boolean;
}

interface BalanceSheetGraphPoint {
  key: string;
  label: string;
  assets: number;
  liabilities: number;
  equity: number;
  liabilitiesAndEquity: number;
  balanceCheck: number;
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

function combineBucketTotals(
  buckets: StatementBucket[],
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bucket of buckets) {
    out[bucket.key] = (left[bucket.key] ?? 0) + (right[bucket.key] ?? 0);
  }
  return out;
}

function diffBucketTotals(
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
  points: BalanceSheetGraphPoint[],
  valueOf: (point: BalanceSheetGraphPoint) => number,
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
  points: BalanceSheetGraphPoint[],
  valueOf: (point: BalanceSheetGraphPoint) => number,
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

function BalanceSheetTrendGraph({
  points,
  modeLabel,
  accumulatedValues,
}: {
  points: BalanceSheetGraphPoint[];
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
    point.assets,
    point.liabilities,
    point.equity,
    point.liabilitiesAndEquity,
    point.balanceCheck,
  ]);
  const { max, min } = graphRange(values);
  const yForValue = (value: number) => padTop + ((max - value) / (max - min)) * chartHeight;
  const baselineY = yForValue(0);
  const latest = points[points.length - 1]!;
  const balanced = Math.abs(latest.balanceCheck) < 0.01;
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const chartKey = points.map((point) => point.key).join("|");

  return (
    <section
      key={chartKey}
      className="mb-3 mt-3 overflow-hidden rounded-lg border bg-card animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-3 py-2">
        <div>
          <div className="text-sm font-medium">Balance movement</div>
          <div className="text-xs text-muted-foreground">
            Assets, liabilities, equity, and balance check by {modeLabel.toLowerCase()}
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
            aria-label="Balance sheet movement graph"
            className="h-56 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="bsAssetsArea" x1="0" x2="0" y1="0" y2="1">
                <stop className="text-info" offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop className="text-info" offset="100%" stopColor="currentColor" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id="bsLiabilitiesArea" x1="0" x2="0" y1="0" y2="1">
                <stop className="text-primary" offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop className="text-primary" offset="100%" stopColor="currentColor" stopOpacity="0.03" />
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
              d={makeAreaPath(points, (point) => point.liabilitiesAndEquity, yForValue, baselineY, width, padX)}
              fill="url(#bsLiabilitiesArea)"
            />
            <path
              d={makeAreaPath(points, (point) => point.assets, yForValue, baselineY, width, padX)}
              fill="url(#bsAssetsArea)"
            />
            <path
              d={makeLinePath(points, (point) => point.liabilitiesAndEquity, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={makeLinePath(points, (point) => point.assets, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className="text-info"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={makeLinePath(points, (point) => point.balanceCheck, yForValue, width, padX)}
              fill="none"
              stroke="currentColor"
              className={balanced ? "text-success" : "text-destructive"}
              strokeWidth="2"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />

            {points.map((point, index) => {
              const x = xForIndex(index, points.length, width, padX);
              const showLabel = points.length <= 5 || index === 0 || index === points.length - 1 || index % labelEvery === 0;
              return (
                <g key={point.key}>
                  <circle
                    cx={x}
                    cy={yForValue(point.assets)}
                    r="3"
                    fill="currentColor"
                    className="text-info"
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
          <ReportGraphMetric label="Total Assets" value={latest.assets} tone={latest.assets >= 0 ? "neutral" : "danger"} />
          <ReportGraphMetric label="Liabilities" value={latest.liabilities} tone="neutral" />
          <ReportGraphMetric label="Equity" value={latest.equity} tone={latest.equity >= 0 ? "success" : "danger"} />
          <ReportGraphMetric label="Balance Check" value={latest.balanceCheck} displayValue={balanced ? "Balanced" : undefined} tone={balanced ? "success" : "danger"} />
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" /> Assets</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> L + E</span>
            <span className={cn("inline-flex items-center gap-1", balanced ? "text-success" : "text-destructive")}><span className="h-2 w-2 rounded-full bg-current" /> Check</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BalanceSheetView({
  scope,
  onDrillDown,
  showGraph = false,
  onShowGraphChange,
  hideStatementTitle = false,
  repeatHeaderControls = false,
  moveReportingControlsToHeader = false,
}: BalanceSheetViewProps) {
  const { data, isLoading, isError } = useBalanceSheet(scope);
  const { data: periodData } = usePeriodStatus(scope);
  const reportingLens = useStatementReportingLens(scope);

  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;
  const hasBuckets = (data?.buckets?.length ?? 0) > 0;
  const showComparative = !!scope.comparative && !hasBuckets;

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
        Loading balance sheet...
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

  const assetSections = data.assets ?? [];
  const liabilitySections = data.liabilities ?? [];
  const equitySections = data.equity ?? [];
  const buckets = data.buckets ?? [];
  const balanceDifference = data.totalAssets - data.totalLiabilitiesAndEquity;
  const isBalanced = Math.abs(balanceDifference) < 0.01;
  const priorTotalLiabilitiesAndEquity =
    data.priorTotalLiabilities !== undefined && data.priorTotalEquity !== undefined
      ? data.priorTotalLiabilities + data.priorTotalEquity
      : undefined;
  const liabilityRatio = data.totalAssets === 0
    ? null
    : (data.totalLiabilities / Math.abs(data.totalAssets)) * 100;

  const summaryMetrics: StatementSummaryMetric[] = [
    {
      key: "assets",
      label: "Total Assets",
      value: data.totalAssets,
      prior: data.priorTotalAssets,
      primary: true,
      tone: data.totalAssets >= 0 ? "neutral" : "danger",
      positiveIsGood: true,
    },
    {
      key: "liabilities",
      label: "Total Liabilities",
      value: data.totalLiabilities,
      prior: data.priorTotalLiabilities,
      tone: "neutral",
      positiveIsGood: false,
    },
    {
      key: "equity",
      label: "Total Equity",
      value: data.totalEquity,
      prior: data.priorTotalEquity,
      tone: data.totalEquity >= 0 ? "success" : "danger",
      positiveIsGood: true,
    },
    {
      key: "liabilities-equity",
      label: "Liabilities & Equity",
      value: data.totalLiabilitiesAndEquity,
      prior: priorTotalLiabilitiesAndEquity,
      tone: "neutral",
      positiveIsGood: true,
    },
    {
      key: "balance-check",
      label: "Balance Check",
      value: balanceDifference,
      displayValue: isBalanced ? "Balanced" : fmtCompact(balanceDifference),
      tone: isBalanced ? "success" : "danger",
      positiveIsGood: false,
    },
  ];

  const assetBucketTotals = bucketTotals(buckets, assetSections);
  const liabilityBucketTotals = bucketTotals(buckets, liabilitySections);
  const equityBucketTotals = bucketTotals(buckets, equitySections);
  const liabilitiesAndEquityBucketTotals = combineBucketTotals(buckets, liabilityBucketTotals, equityBucketTotals);
  const balanceCheckBucketTotals = diffBucketTotals(buckets, assetBucketTotals, liabilitiesAndEquityBucketTotals);
  const matrixGroups: StatementMatrixGroup[] = [
    { key: "assets", title: "Assets", sections: assetSections },
    { key: "liabilities", title: "Liabilities", sections: liabilitySections },
    { key: "equity", title: "Equity", sections: equitySections },
  ].filter((group) => group.sections.length > 0);
  const matrixTotals: StatementMatrixTotalRow[] = [
    { key: "total-assets", label: "Total Assets", values: assetBucketTotals },
    { key: "total-liabilities", label: "Total Liabilities", values: liabilityBucketTotals },
    { key: "total-equity", label: "Total Equity", values: equityBucketTotals },
    { key: "liabilities-equity", label: "Total Liabilities & Equity", values: liabilitiesAndEquityBucketTotals },
    {
      key: "balance-check",
      label: "Balance Check",
      values: balanceCheckBucketTotals,
      tone: Object.values(balanceCheckBucketTotals).every((value) => Math.abs(value) < 0.01) ? "success" : "danger",
    },
  ];
  const graphPoints: BalanceSheetGraphPoint[] = buckets.length > 0
    ? buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      assets: assetBucketTotals[bucket.key] ?? 0,
      liabilities: liabilityBucketTotals[bucket.key] ?? 0,
      equity: equityBucketTotals[bucket.key] ?? 0,
      liabilitiesAndEquity: liabilitiesAndEquityBucketTotals[bucket.key] ?? 0,
      balanceCheck: balanceCheckBucketTotals[bucket.key] ?? 0,
    }))
    : [
      ...(showComparative && data.priorTotalAssets !== undefined && priorTotalLiabilitiesAndEquity !== undefined
        ? [{
          key: "prior",
          label: reportingLens.priorLabel,
          assets: data.priorTotalAssets,
          liabilities: data.priorTotalLiabilities ?? 0,
          equity: data.priorTotalEquity ?? 0,
          liabilitiesAndEquity: priorTotalLiabilitiesAndEquity,
          balanceCheck: data.priorTotalAssets - priorTotalLiabilitiesAndEquity,
        }]
        : []),
      {
        key: "current",
        label: reportingLens.currentLabel,
        assets: data.totalAssets,
        liabilities: data.totalLiabilities,
        equity: data.totalEquity,
        liabilitiesAndEquity: data.totalLiabilitiesAndEquity,
        balanceCheck: balanceDifference,
      },
    ];

  return (
    <StatementLayout
      title="Balance Sheet"
      companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
      fiscalYear={scope.fiscalYear}
      period={scope.period}
      periodStatus={reportingLens.isFiscalLens ? effectiveStatus : null}
      periodDisplayLabel={reportingLens.headerLabel}
      currentLabel={reportingLens.currentLabel}
      priorLabel={reportingLens.priorLabel}
      showComparative={showComparative}
      isLive={data.isLive}
      summaryTitle="Balance Intelligence"
      summarySubtitle={reportingLens.summarySubtitle}
      summaryMetrics={showComparative || hasBuckets ? undefined : summaryMetrics}
      summaryInsight={showComparative || hasBuckets ? undefined : {
        label: liabilityRatio === null ? "Capital Structure" : "Liability Ratio",
        value: liabilityRatio === null ? "No assets" : `${liabilityRatio.toFixed(1)}%`,
        description: isBalanced
          ? "Assets match liabilities plus equity."
          : `Difference ${fmtCompact(balanceDifference)}.`,
        tone: isBalanced ? "success" : "danger",
      }}
      comparisonLabel={showComparative ? "Prior year" : reportingLens.comparisonLabel}
      hideColumnHeader
      hideTitle={hideStatementTitle}
      headerControls={
        repeatHeaderControls && !moveReportingControlsToHeader ? (
          <FinanceContextBar
            variant="inline"
            className="w-full gap-x-2"
          />
        ) : undefined
      }
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
        <BalanceSheetTrendGraph
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
          <span className="text-xs font-medium text-muted-foreground">Assets</span>
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
            onRowSelect={onDrillDown}
          />
        ))}
      </div>

      <div className="border-b">
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-xs font-medium text-muted-foreground">Liabilities</span>
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
            onRowSelect={onDrillDown}
          />
        ))}
      </div>

      <div>
        <div className="px-2 py-1 bg-muted/10">
          <span className="text-xs font-medium text-muted-foreground">Equity</span>
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
            onRowSelect={onDrillDown}
          />
        ))}
      </div>
        </>
      )}
    </StatementLayout>
  );
}
