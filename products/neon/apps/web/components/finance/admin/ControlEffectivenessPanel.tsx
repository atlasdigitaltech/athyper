"use client";

// components/finance/admin/ControlEffectivenessPanel.tsx
//
// Phase 16: Control effectiveness dashboard panel.
// Shows per-period control metrics: clean close, override density,
// evidence turnaround, attestation coverage, bundle distribution.

import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  ControlEffectivenessDTO,
  ChronicIssueDTO,
} from "@/lib/finance/use-assurance-analytics";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ControlEffectivenessPanelProps {
  periods: ControlEffectivenessDTO[];
  chronicIssues: ChronicIssueDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISSUE_TYPE_LABELS: Record<string, string> = {
  RECURRING_LATE_TASK: "Recurring Late Task",
  OVERRIDE_HEAVY_PERIOD: "Override-Heavy Period",
  REPEAT_EVIDENCE_DOMAIN: "Repeat Evidence Domain",
  NON_CLEAN_CLOSE: "Non-Clean Close",
};

const ISSUE_TYPE_COLORS: Record<string, string> = {
  RECURRING_LATE_TASK: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  OVERRIDE_HEAVY_PERIOD: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  REPEAT_EVIDENCE_DOMAIN: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  NON_CLEAN_CLOSE: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

function MetricCard({
  label,
  value,
  subtext,
  good,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  good?: boolean | null;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-lg font-semibold">{value}</span>
        {good === true && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
        {good === false && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
      </div>
      {subtext && <p className="text-[9px] text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ControlEffectivenessPanel({
  periods,
  chronicIssues,
  loading,
  error,
  onRefresh,
}: ControlEffectivenessPanelProps) {
  const latest = periods[0] ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Control Effectiveness
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Loading / Error */}
        {loading && !latest && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Latest period summary */}
        {latest && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">
                FY{latest.fiscalYear} P{latest.periodNumber}
              </span>
              {latest.isCleanClose ? (
                <Badge className="text-[8px] bg-emerald-100 text-emerald-700">
                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                  Clean Close
                </Badge>
              ) : (
                <Badge className="text-[8px] bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  Non-Clean
                </Badge>
              )}
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Task Completion"
                value={`${latest.completionPct}%`}
                subtext={`${latest.completedTasks}/${latest.totalTasks} tasks`}
                good={Number(latest.completionPct) >= 100}
              />
              <MetricCard
                label="Override Density"
                value={`${latest.overrideDensityPct}%`}
                subtext={`${latest.approvedOverrides} approved of ${latest.totalOverrides}`}
                good={Number(latest.overrideDensityPct) <= 5 ? true : Number(latest.overrideDensityPct) > 15 ? false : null}
              />
              <MetricCard
                label="Evidence Fulfillment"
                value={latest.evidenceTotalRequests > 0
                  ? `${Math.round((latest.evidenceFulfilled / latest.evidenceTotalRequests) * 100)}%`
                  : "N/A"}
                subtext={`${latest.evidenceFulfilled}/${latest.evidenceTotalRequests} fulfilled, ${latest.evidenceOverdue} overdue`}
                good={latest.evidenceOverdue === 0 ? true : latest.evidenceOverdue > 3 ? false : null}
              />
              <MetricCard
                label="Avg Turnaround"
                value={latest.evidenceTotalRequests > 0 ? `${latest.evidenceAvgTurnaroundDays}d` : "N/A"}
                subtext="evidence request fulfillment"
                good={Number(latest.evidenceAvgTurnaroundDays) <= 3 ? true : Number(latest.evidenceAvgTurnaroundDays) > 7 ? false : null}
              />
              <MetricCard
                label="Attestations"
                value={latest.totalAttestations}
                subtext={`${latest.uniqueAttestors} attestors, ${latest.attestationTypesCovered} types`}
                good={latest.attestationTypesCovered >= 3 ? true : latest.totalAttestations === 0 ? false : null}
              />
              <MetricCard
                label="Bundle Distribution"
                value={`${latest.bundleDistributionPct}%`}
                subtext={`${latest.distributedBundles}/${latest.totalBundles} distributed`}
                good={Number(latest.bundleDistributionPct) >= 80 ? true : Number(latest.bundleDistributionPct) < 50 ? false : null}
              />
            </div>

            {/* Period trend (compact) */}
            {periods.length > 1 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Period Trend</p>
                <div className="flex gap-1">
                  {periods.slice(0, 12).reverse().map((p) => (
                    <div
                      key={`${p.fiscalYear}-${p.periodNumber}`}
                      className={`flex-1 h-6 rounded-sm flex items-center justify-center text-[8px] font-medium ${
                        p.isCleanClose
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      }`}
                      title={`FY${p.fiscalYear} P${p.periodNumber}: ${p.isCleanClose ? "Clean" : "Non-Clean"} (${p.completionPct}%)`}
                    >
                      P{p.periodNumber}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Chronic Issues */}
        {chronicIssues.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              Chronic Issues ({chronicIssues.length})
            </p>
            <div className="space-y-1.5">
              {chronicIssues.slice(0, 8).map((issue) => (
                <div
                  key={`${issue.issueType}-${issue.issueKey}`}
                  className="flex items-start gap-2 text-xs border rounded-md px-2 py-1.5"
                >
                  <Badge className={`text-[7px] shrink-0 ${ISSUE_TYPE_COLORS[issue.issueType] ?? ""}`}>
                    {ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{issue.description}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {issue.affectedPeriods.join(", ")}
                      {issue.impactAmount && ` | Impact: ${issue.impactAmount}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && periods.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No control effectiveness data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
