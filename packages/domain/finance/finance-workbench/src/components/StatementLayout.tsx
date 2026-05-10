"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "./format";
import { PeriodStatusBar } from "./PeriodStatusBar";
import { ReportLiveBadge, ReportTitle } from "./ReportScaffold";
import { variance, varianceColor } from "../lib/amounts";
import type { FiscalPeriodStatus } from "../lib/period";

export interface StatementSummarySeriesPoint {
  label: string;
  value: number;
}

export interface StatementSummaryMetric {
  key: string;
  label: string;
  value: number;
  prior?: number;
  displayValue?: string;
  description?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  positiveIsGood?: boolean;
  primary?: boolean;
  series?: StatementSummarySeriesPoint[];
}

export interface StatementSummaryInsight {
  label: string;
  value: string;
  description?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

interface StatementLayoutProps {
  title: string;
  companyCode?: string;
  fiscalYear: number;
  period: number | null;
  periodStatus: FiscalPeriodStatus | null;
  currentLabel?: string;
  priorLabel?: string;
  showComparative?: boolean;
  isLive?: boolean;       // false when reading from snapshot
  periodDisplayLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  summaryTitle?: string;
  summarySubtitle?: string;
  summaryMetrics?: StatementSummaryMetric[];
  summaryInsight?: StatementSummaryInsight;
  comparisonLabel?: string;
  hideColumnHeader?: boolean;
  hideTitle?: boolean;
  headerControls?: React.ReactNode;
  rightHeaderControls?: React.ReactNode;
}

export function StatementLayout({
  title,
  companyCode,
  fiscalYear,
  period,
  periodStatus,
  currentLabel,
  priorLabel,
  showComparative = false,
  isLive = true,
  periodDisplayLabel,
  children,
  footer,
  summaryTitle = "Summary",
  summarySubtitle,
  summaryMetrics,
  summaryInsight,
  hideColumnHeader = false,
  hideTitle = false,
  headerControls,
  rightHeaderControls,
}: StatementLayoutProps) {
  const hasSummary = !!summaryMetrics?.length;
  const columnHeader = !hideColumnHeader ? (
    showComparative ? (
      <div className="flex items-center gap-6 pr-2">
        <span className="w-24 text-right text-xs font-medium text-muted-foreground">
          {currentLabel ?? "Current"}
        </span>
        <span className="w-24 text-right text-xs font-medium text-muted-foreground">
          {priorLabel ?? "Prior year"}
        </span>
        <span className="w-20 text-right text-xs font-medium text-muted-foreground">
          Variance
        </span>
      </div>
    ) : (
      <div className="pr-2">
        <span className="block w-28 text-right text-xs font-medium text-muted-foreground">
          {currentLabel ?? "Balance"}
        </span>
      </div>
    )
  ) : null;

  const body = (
    <>
      {/* Content sections */}
      <div className="flex flex-col gap-0">
        {children}
      </div>

      {/* Footer total */}
      {footer && (
        <div className="border-t mt-1 pt-1">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-0 text-sm text-foreground">
      {/* Header */}
      <div className={cn(
        "-mx-2 mb-0 border-b sm:-mx-4",
      )}>
        <div className="flex h-10 min-w-0 items-center gap-x-2 overflow-x-auto px-2 py-1 text-sm text-muted-foreground sm:px-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            {!hideTitle && (
              <ReportTitle>{title}</ReportTitle>
            )}
            {headerControls ? (
              <>
                {!hideTitle && <span className="hidden text-border/80 sm:inline">|</span>}
                <div className="min-w-0">
                  {headerControls}
                </div>
                <ReportLiveBadge live={isLive} />
              </>
            ) : (
              <>
                <PeriodStatusBar
                  fiscalYear={fiscalYear}
                  period={period}
                  status={periodStatus}
                  companyCode={companyCode}
                  displayLabel={periodDisplayLabel}
                />
                <ReportLiveBadge live={isLive} />
              </>
            )}
          </div>
          <div className="flex-1" />
          {rightHeaderControls && (
            <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end">
              {rightHeaderControls}
            </div>
          )}
          {!rightHeaderControls && columnHeader}
        </div>
      </div>

      {hasSummary ? (
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="min-w-0">{body}</div>
          <StatementIntelligencePanel
            title={summaryTitle}
            subtitle={summarySubtitle}
            metrics={summaryMetrics}
            insight={summaryInsight}
            currentLabel={currentLabel ?? "Current"}
            priorLabel={priorLabel ?? "Prior"}
            showComparative={showComparative}
          />
        </div>
      ) : (
        body
      )}
    </div>
  );
}

function toneClass(tone: StatementSummaryMetric["tone"] | StatementSummaryInsight["tone"]): string {
  switch (tone) {
    case "success":
      return "border-success/20 bg-success/10 text-success";
    case "warning":
      return "border-warning/25 bg-warning/10 text-warning";
    case "danger":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted/30 text-foreground";
  }
}

function metricDisplay(metric: StatementSummaryMetric): string {
  return metric.displayValue ?? fmtCompact(metric.value);
}

function StatementIntelligencePanel({
  title,
  subtitle,
  metrics,
  insight,
  currentLabel,
  priorLabel,
  showComparative,
}: {
  title: string;
  subtitle?: string;
  metrics: StatementSummaryMetric[];
  insight?: StatementSummaryInsight;
  currentLabel: string;
  priorLabel: string;
  showComparative: boolean;
}) {
  const primary = metrics.find((metric) => metric.primary) ?? metrics[0];
  const secondary = metrics.filter((metric) => metric.key !== primary?.key);

  return (
    <aside className="order-first min-w-0 lg:order-none lg:pt-2">
      <div className="space-y-3 rounded-lg border bg-card p-3 lg:sticky lg:top-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {primary && (
          <SummaryPrimaryMetric
            metric={primary}
            currentLabel={currentLabel}
            priorLabel={priorLabel}
            showComparative={showComparative}
          />
        )}

        <div className="divide-y rounded-lg border bg-background">
          {secondary.map((metric) => (
            <SummaryMetricRow
              key={metric.key}
              metric={metric}
              currentLabel={currentLabel}
              priorLabel={priorLabel}
              showComparative={showComparative}
            />
          ))}
        </div>

        {insight && (
          <div className={cn("rounded-lg border px-3 py-2", toneClass(insight.tone))}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium opacity-80">{insight.label}</span>
              <span className="text-sm font-semibold tabular-nums">{insight.value}</span>
            </div>
            {insight.description && (
              <div className="mt-1 text-xs opacity-80">{insight.description}</div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function SummaryPrimaryMetric({
  metric,
  currentLabel,
  priorLabel,
  showComparative,
}: {
  metric: StatementSummaryMetric;
  currentLabel: string;
  priorLabel: string;
  showComparative: boolean;
}) {
  const delta = showComparative && metric.prior !== undefined
    ? variance(metric.value, metric.prior)
    : null;

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClass(metric.tone))}>
      <div className="text-xs font-medium opacity-80">{metric.label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {metricDisplay(metric)}
      </div>
      {metric.description && (
        <div className="mt-1 text-xs opacity-80">{metric.description}</div>
      )}
      {delta && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-background/70 px-2 py-1.5">
            <div className="text-muted-foreground">{priorLabel}</div>
            <div className="font-medium tabular-nums text-foreground">{fmtCompact(metric.prior ?? 0)}</div>
          </div>
          <div className="rounded-md bg-background/70 px-2 py-1.5">
            <div className="text-muted-foreground">Variance</div>
            <div className={cn("font-medium tabular-nums", varianceColor(delta.absolute, metric.positiveIsGood ?? true))}>
              {fmtCompact(delta.absolute)}
              {delta.pct !== null && (
                <span className="ml-1 text-[11px] opacity-80">({delta.pct.toFixed(1)}%)</span>
              )}
            </div>
          </div>
        </div>
      )}
      {metric.series && metric.series.length > 1 && (
        <SummarySeries series={metric.series} />
      )}
      {!metric.series && showComparative && metric.prior !== undefined && (
        <SummarySeries
          series={[
            { label: priorLabel, value: metric.prior },
            { label: currentLabel, value: metric.value },
          ]}
        />
      )}
    </div>
  );
}

function SummaryMetricRow({
  metric,
  currentLabel,
  priorLabel,
  showComparative,
}: {
  metric: StatementSummaryMetric;
  currentLabel: string;
  priorLabel: string;
  showComparative: boolean;
}) {
  const delta = showComparative && metric.prior !== undefined
    ? variance(metric.value, metric.prior)
    : null;

  return (
    <div className="px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{metric.label}</div>
          {metric.description && (
            <div className="truncate text-xs text-muted-foreground/70">{metric.description}</div>
          )}
        </div>
        <div className={cn(
          "shrink-0 text-right text-sm font-semibold tabular-nums",
          metric.tone === "success" && "text-success",
          metric.tone === "danger" && "text-destructive",
          metric.tone === "warning" && "text-warning",
        )}>
          {metricDisplay(metric)}
        </div>
      </div>
      {delta && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {priorLabel}: {fmtCompact(metric.prior ?? 0)}
          </span>
          <span className={cn("font-medium tabular-nums", varianceColor(delta.absolute, metric.positiveIsGood ?? true))}>
            {fmtCompact(delta.absolute)}
            {delta.pct !== null && ` (${delta.pct.toFixed(1)}%)`}
          </span>
        </div>
      )}
      {metric.series && metric.series.length > 1 && (
        <SummarySeries series={metric.series} compact />
      )}
      {!metric.series && showComparative && metric.prior !== undefined && (
        <SummarySeries
          compact
          series={[
            { label: priorLabel, value: metric.prior },
            { label: currentLabel, value: metric.value },
          ]}
        />
      )}
    </div>
  );
}

function SummarySeries({
  series,
  compact = false,
}: {
  series: StatementSummarySeriesPoint[];
  compact?: boolean;
}) {
  const max = Math.max(...series.map((point) => Math.abs(point.value)), 1);

  return (
    <div className={cn("mt-2 space-y-1.5", compact && "mt-1.5")}>
      {series.map((point) => (
        <div key={point.label} className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[11px]">
          <span className="truncate text-muted-foreground">{point.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-foreground/60"
              style={{ width: `${Math.max(4, (Math.abs(point.value) / max) * 100)}%` }}
            />
          </span>
          <span className="truncate text-right font-medium tabular-nums text-foreground">
            {fmtCompact(point.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Total row shown in statement footer or at bottom of a section. */
export function StatementTotal({
  label,
  current,
  prior,
  showComparative = false,
  bold = true,
  borderTop = false,
}: {
  label: string;
  current: number;
  prior?: number;
  showComparative?: boolean;
  bold?: boolean;
  borderTop?: boolean;
}) {
  const variance = showComparative && prior !== undefined ? current - prior : null;

  return (
    <div
      className={cn(
        "flex items-center bg-muted/30 px-3 py-2 text-sm",
        borderTop && "border-t",
        bold && "font-semibold",
      )}
    >
      <span className="flex-1">{label}</span>
      <div className="flex items-center gap-6 pr-0">
        <span className="w-28 text-right tabular-nums">{fmtCompact(current)}</span>
        {showComparative && (
          <>
            <span className="w-28 text-right tabular-nums text-muted-foreground">
              {prior !== undefined ? fmtCompact(prior) : "—"}
            </span>
            <span
              className={cn(
                "w-20 text-right tabular-nums",
                variance !== null && variance > 0
                  ? "text-success"
                  : variance !== null && variance < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {variance !== null ? fmtCompact(variance) : "—"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
