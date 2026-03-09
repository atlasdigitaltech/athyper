"use client";

// components/finance/admin/SlaPerformancePanel.tsx
//
// Phase 9A: SLA Performance Panel — target vs actual close dates,
// breach indicators, cross-period trend comparison.

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  CloseExecutiveSummaryDTO,
  SlaPerformanceTrendDTO,
  SlaStatusDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SlaPerformancePanelProps {
  summary: CloseExecutiveSummaryDTO | null;
  trend: SlaPerformanceTrendDTO[] | null;
  trendLoading: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SlaPerformancePanel({
  summary,
  trend,
  trendLoading,
}: SlaPerformancePanelProps) {
  const slaMetOn = useMemo(() => {
    if (!trend) return null;
    const completed = trend.filter((t) => t.hardCloseActual != null);
    if (completed.length === 0) return null;
    const met = completed.filter((t) => t.hardCloseMet).length;
    return { met, total: completed.length, pct: Math.round((met / completed.length) * 100) };
  }, [trend]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          SLA Performance
        </CardTitle>
        <CardDescription>
          Close timeline targets vs actual completion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current period SLA strip */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SlaMetricCard
              label="SLA Status"
              value={summary.slaStatus ?? "N/A"}
              badge={<SlaStatusBadge status={summary.slaStatus} />}
            />
            <SlaMetricCard
              label="Days Elapsed"
              value={summary.daysElapsed != null ? `${summary.daysElapsed}d` : "—"}
              sub={summary.targetWorkingDays ? `of ${summary.targetWorkingDays}d target` : undefined}
            />
            <SlaMetricCard
              label="Days Remaining"
              value={summary.daysRemaining != null ? `${summary.daysRemaining}d` : "—"}
              warn={summary.daysRemaining != null && summary.daysRemaining <= 1}
            />
            <SlaMetricCard
              label="Completion"
              value={summary.completionPct != null ? `${summary.completionPct}%` : "—"}
              sub={summary.totalTasks != null ? `${summary.completedCount ?? 0}/${summary.totalTasks} tasks` : undefined}
            />
          </div>
        )}

        {/* Current period dates */}
        {summary?.softCloseTarget && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Soft Close</div>
              <div className="flex items-center justify-between">
                <span>Target: {formatDate(summary.softCloseTarget)}</span>
                {summary.softCloseActual ? (
                  <span className="text-green-600">Actual: {formatDate(summary.softCloseActual)}</span>
                ) : (
                  <span className="text-muted-foreground">Pending</span>
                )}
              </div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Hard Close</div>
              <div className="flex items-center justify-between">
                <span>Target: {formatDate(summary.hardCloseTarget!)}</span>
                {summary.hardCloseActual ? (
                  <span className="text-green-600">Actual: {formatDate(summary.hardCloseActual)}</span>
                ) : (
                  <span className="text-muted-foreground">Pending</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Historical SLA rate */}
        {slaMetOn && (
          <div className="flex items-center gap-2 rounded bg-muted/50 px-3 py-2 text-sm">
            {slaMetOn.pct >= 80 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-orange-500" />
            )}
            <span>
              SLA met in <strong>{slaMetOn.met}/{slaMetOn.total}</strong> ({slaMetOn.pct}%) recent periods
            </span>
          </div>
        )}

        {/* Trend table */}
        {trendLoading && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading trend…
          </div>
        )}

        {trend && trend.length > 0 && (
          <div className="max-h-[250px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trend.map((t) => (
                  <TableRow key={`${t.fiscalYear}-${t.periodNumber}`}>
                    <TableCell className="text-xs font-mono">
                      P{t.periodNumber} FY{t.fiscalYear}
                    </TableCell>
                    <TableCell className="text-xs">{t.closeType}</TableCell>
                    <TableCell className="text-xs">{formatDate(t.hardCloseTarget)}</TableCell>
                    <TableCell className="text-xs">
                      {t.hardCloseActual ? formatDate(t.hardCloseActual) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.hardCloseDays != null ? `${t.hardCloseDays}d` : "—"}
                    </TableCell>
                    <TableCell>
                      <SlaStatusBadge status={t.slaStatus} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.finalReadinessScore != null
                        ? `${t.finalReadinessScore}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SlaMetricCard({
  label,
  value,
  sub,
  badge,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" : ""}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">
        {badge ?? <span className="text-sm font-semibold">{value}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SlaStatusBadge({ status }: { status: SlaStatusDTO | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">N/A</span>;
  const config: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
    ON_TRACK: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    MET: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    AT_RISK: { color: "bg-yellow-100 text-yellow-700", Icon: AlertTriangle },
    BREACHED: { color: "bg-red-100 text-red-700", Icon: XCircle },
  };
  const c = config[status] ?? config.ON_TRACK!;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.color}`}>
      <c.Icon className="h-2.5 w-2.5" />
      {status.replace("_", " ")}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}
