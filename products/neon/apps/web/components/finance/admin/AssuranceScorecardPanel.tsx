"use client";

// components/finance/admin/AssuranceScorecardPanel.tsx
//
// Phase 16: Assurance scorecard & heatmap panel.
// Composite scores: close control (35%), evidence fulfillment (25%),
// attestation compliance (20%), distribution governance (20%).

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
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
  AssuranceScorecardDTO,
  WorkloadSummaryDTO,
} from "@/lib/finance/use-assurance-analytics";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AssuranceScorecardPanelProps {
  scorecards: AssuranceScorecardDTO[];
  workloadSummary: WorkloadSummaryDTO | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Rating config
// ---------------------------------------------------------------------------

const RATING_COLORS: Record<string, string> = {
  STRONG: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  ADEQUATE: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  NEEDS_IMPROVEMENT: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  WEAK: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Score bar
// ---------------------------------------------------------------------------

function ScoreBar({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label} <span className="text-[8px]">({weight})</span></span>
        <span className={`font-semibold ${scoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(score)}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssuranceScorecardPanel({
  scorecards,
  workloadSummary,
  loading,
  error,
  onRefresh,
}: AssuranceScorecardPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const latest = scorecards[0] ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Assurance Scorecard
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

        {/* Latest scorecard */}
        {latest && (
          <>
            {/* Overall score + rating */}
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className={`text-3xl font-bold ${scoreColor(latest.overallAssuranceScore)}`}>
                  {latest.overallAssuranceScore}
                </div>
                <p className="text-[9px] text-muted-foreground">Overall Score</p>
              </div>
              <div className="flex-1">
                <Badge className={`text-xs ${RATING_COLORS[latest.assuranceRating] ?? ""}`}>
                  {latest.assuranceRating.replace(/_/g, " ")}
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-1">
                  FY{latest.fiscalYear} P{latest.periodNumber}
                </p>
              </div>
            </div>

            {/* Score breakdown */}
            <div className="space-y-2">
              <ScoreBar label="Close Control" score={latest.closeControlScore} weight="35%" />
              <ScoreBar label="Evidence Fulfillment" score={latest.evidenceFulfillmentScore} weight="25%" />
              <ScoreBar label="Attestation Compliance" score={latest.attestationComplianceScore} weight="20%" />
              <ScoreBar label="Distribution Governance" score={latest.distributionGovernanceScore} weight="20%" />
            </div>

            {/* Chronic flags */}
            {(latest.chronicLateTasks > 0 ||
              latest.chronicOverridePeriods > 0 ||
              latest.chronicEvidenceDomains > 0 ||
              latest.nonCleanPeriodCount > 0) && (
              <div className="border rounded-md p-2">
                <p className="text-[10px] font-medium flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Chronic Flags
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                  {latest.chronicLateTasks > 0 && (
                    <span className="text-red-600">{latest.chronicLateTasks} recurring late tasks</span>
                  )}
                  {latest.chronicOverridePeriods > 0 && (
                    <span className="text-orange-600">{latest.chronicOverridePeriods} override-heavy periods</span>
                  )}
                  {latest.chronicEvidenceDomains > 0 && (
                    <span className="text-amber-600">{latest.chronicEvidenceDomains} repeat evidence domains</span>
                  )}
                  {latest.nonCleanPeriodCount > 0 && (
                    <span className="text-purple-600">{latest.nonCleanPeriodCount} non-clean closes</span>
                  )}
                </div>
              </div>
            )}

            {/* Workload summary */}
            {workloadSummary && workloadSummary.openCount > 0 && (
              <div className="border rounded-md p-2">
                <p className="text-[10px] font-medium mb-1">Open Workload</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-sm font-semibold">{workloadSummary.openCount}</span>
                    <p className="text-[8px] text-muted-foreground">Open</p>
                  </div>
                  <div>
                    <span className={`text-sm font-semibold ${workloadSummary.overdueCount > 0 ? "text-red-600" : ""}`}>
                      {workloadSummary.overdueCount}
                    </span>
                    <p className="text-[8px] text-muted-foreground">Overdue</p>
                  </div>
                  <div>
                    <span className="text-sm font-semibold">{workloadSummary.avgAgeDays}d</span>
                    <p className="text-[8px] text-muted-foreground">Avg Age</p>
                  </div>
                </div>
                {Object.keys(workloadSummary.bySeverity).length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {Object.entries(workloadSummary.bySeverity).map(([sev, count]) => (
                      <Badge key={sev} variant="outline" className="text-[7px]">
                        {sev}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Period heatmap */}
            {scorecards.length > 1 && (
              <div>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Period Heatmap ({scorecards.length} periods)
                </button>
                {showHistory && (
                  <div className="mt-1.5 grid grid-cols-6 gap-1">
                    {scorecards.slice(0, 12).reverse().map((sc) => (
                      <div
                        key={`${sc.fiscalYear}-${sc.periodNumber}`}
                        className={`rounded-sm p-1 text-center ${
                          sc.overallAssuranceScore >= 80
                            ? "bg-emerald-100 dark:bg-emerald-900"
                            : sc.overallAssuranceScore >= 60
                              ? "bg-blue-100 dark:bg-blue-900"
                              : sc.overallAssuranceScore >= 40
                                ? "bg-amber-100 dark:bg-amber-900"
                                : "bg-red-100 dark:bg-red-900"
                        }`}
                        title={`FY${sc.fiscalYear} P${sc.periodNumber}: ${sc.overallAssuranceScore} (${sc.assuranceRating})`}
                      >
                        <p className="text-[8px] text-muted-foreground">P{sc.periodNumber}</p>
                        <p className={`text-xs font-semibold ${scoreColor(sc.overallAssuranceScore)}`}>
                          {sc.overallAssuranceScore}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && scorecards.length === 0 && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No scorecard data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
