"use client";

// components/finance/admin/ControlOptimizationPanel.tsx
//
// Phase 19: Autonomous Control Optimization Panel.
// Shows auto-generated program proposals, effectiveness learning insights,
// and policy tuning suggestions.

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
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
  ProgramProposalDTO,
  EffectivenessLearningDTO,
  OptimizationSummaryDTO,
} from "@/lib/finance/use-control-optimization";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ControlOptimizationPanelProps {
  proposals: ProgramProposalDTO[];
  insights: EffectivenessLearningDTO[];
  summary: OptimizationSummaryDTO | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onAcceptProposal: (fingerprint: string) => void;
  onDismissProposal: (fingerprint: string) => void;
  actionLoading: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const SOURCE_LABELS: Record<string, string> = {
  benchmark_red_light: "Benchmark Gap",
  chronic_issue: "Chronic Issue",
  policy_recommendation: "Policy Tuning",
};

const SOURCE_COLORS: Record<string, string> = {
  benchmark_red_light: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  chronic_issue: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  policy_recommendation: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
};

const EFFECTIVENESS_COLORS: Record<string, string> = {
  highly_effective: "text-green-600 dark:text-green-400",
  moderately_effective: "text-yellow-600 dark:text-yellow-400",
  low_effectiveness: "text-orange-600 dark:text-orange-400",
  ineffective: "text-red-600 dark:text-red-400",
  insufficient_data: "text-slate-400 dark:text-slate-500",
};

const TUNING_LABELS: Record<string, { label: string; color: string }> = {
  consider_disabling: { label: "Consider Disabling", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  frequently_rejected: { label: "Frequently Rejected", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  promote_to_auto: { label: "Promote to Auto", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  timing_issue: { label: "Timing Issue", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  maintain: { label: "Maintain", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ControlOptimizationPanel({
  proposals,
  insights,
  summary,
  loading,
  error,
  onRefresh,
  onAcceptProposal,
  onDismissProposal,
  actionLoading,
}: ControlOptimizationPanelProps) {
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [showLearning, setShowLearning] = useState(false);

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="mt-2">
            <RefreshCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <CardTitle className="text-base font-semibold">Autonomous Optimization</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Proposals"
              value={summary.proposals.total}
              sub={summary.proposals.urgent > 0 ? `${summary.proposals.urgent} urgent` : undefined}
              urgent={summary.proposals.urgent > 0}
            />
            <SummaryCard
              label="Policies Tracked"
              value={summary.learning.totalPolicies}
              sub={`${summary.learning.policiesWithData} with data`}
            />
            <SummaryCard
              label="Avg Effectiveness"
              value={`${summary.learning.avgEffectiveness}%`}
              sub={summary.learning.tuning.promoteToAuto > 0
                ? `${summary.learning.tuning.promoteToAuto} ready to promote`
                : undefined}
            />
            <SummaryCard
              label="Avg Acceptance"
              value={`${summary.learning.avgAcceptance}%`}
              sub={summary.learning.tuning.frequentlyRejected > 0
                ? `${summary.learning.tuning.frequentlyRejected} rejected`
                : undefined}
            />
          </div>
        )}

        {/* Proposals section */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <h4 className="text-sm font-medium">Program Proposals</h4>
            <span className="text-xs text-muted-foreground">({proposals.length})</span>
          </div>

          {proposals.length === 0 && !loading && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No program proposals — all gaps are addressed or targets are met.
            </p>
          )}

          <div className="space-y-2">
            {proposals.map((p) => {
              const isExpanded = expandedProposal === p.fingerprint;
              return (
                <div
                  key={p.fingerprint}
                  className="rounded-lg border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={SOURCE_COLORS[p.proposalSource] ?? ""}>
                          {SOURCE_LABELS[p.proposalSource] ?? p.proposalSource}
                        </Badge>
                        <Badge variant="outline" className={PRIORITY_COLORS[p.suggestedPriority] ?? ""}>
                          {p.suggestedPriority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {p.suggestedProgramType}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium">{p.suggestedTitle}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:text-green-700"
                        onClick={() => onAcceptProposal(p.fingerprint)}
                        disabled={actionLoading}
                        title="Accept and create program"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => onDismissProposal(p.fingerprint)}
                        disabled={actionLoading}
                        title="Dismiss proposal"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedProposal(isExpanded ? null : p.fingerprint)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Rationale</span>
                        <p className="mt-0.5 text-sm">{p.rationale}</p>
                      </div>
                      {p.proposalData?.suggested_gaps && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Linked Gaps</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(p.proposalData.suggested_gaps as any[]).map((g: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {g.label ?? g.key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {p.proposalData?.metric_code && (
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Metric: {p.proposalData.metric_label ?? p.proposalData.metric_code}</span>
                          {p.proposalData.red_period_count && (
                            <span>Red periods: {p.proposalData.red_period_count}</span>
                          )}
                          {p.proposalData.avg_actual && (
                            <span>Avg actual: {p.proposalData.avg_actual}</span>
                          )}
                          {p.proposalData.target_value && (
                            <span>Target: {p.proposalData.target_value}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Learning section toggle */}
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/50"
            onClick={() => setShowLearning(!showLearning)}
          >
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span>Effectiveness Learning</span>
            <span className="text-xs text-muted-foreground">({insights.length} policies)</span>
            <span className="ml-auto">
              {showLearning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {showLearning && insights.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="grid grid-cols-12 gap-1 px-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-3">Policy</span>
                <span className="col-span-2 text-center">Accept</span>
                <span className="col-span-2 text-center">Effective</span>
                <span className="col-span-2 text-center">Volume</span>
                <span className="col-span-3 text-right">Suggestion</span>
              </div>

              {insights.map((ins) => {
                const tuning = TUNING_LABELS[ins.tuningSuggestion] ?? TUNING_LABELS.maintain;
                return (
                  <div
                    key={`${ins.entityCode}-${ins.policyCode}`}
                    className="grid grid-cols-12 gap-1 items-center rounded px-2 py-1.5 text-sm hover:bg-muted/30"
                  >
                    <div className="col-span-3 truncate" title={ins.policyName ?? ins.policyCode}>
                      <span className="font-medium">{ins.policyName ?? ins.policyCode}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={parseFloat(ins.acceptanceRate) >= 60 ? "text-green-600" : "text-muted-foreground"}>
                        {ins.acceptanceRate}%
                      </span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={EFFECTIVENESS_COLORS[ins.effectivenessClass] ?? ""}>
                        {ins.ratedCount > 0 ? `${ins.effectivenessRate}%` : "--"}
                      </span>
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">
                      {ins.totalRecommendations}
                      <span className="text-xs"> / {ins.periodsActive}p</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <Badge variant="outline" className={`text-xs ${tuning.color}`}>
                        {tuning.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showLearning && insights.length === 0 && !loading && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No policy effectiveness data yet.
            </p>
          )}
        </div>

        {/* Tuning summary alerts */}
        {summary && (summary.learning.tuning.considerDisabling > 0 || summary.learning.tuning.promoteToAuto > 0) && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-800 dark:text-purple-300">Tuning Recommendations</span>
            </div>
            <div className="space-y-1 text-sm">
              {summary.learning.tuning.promoteToAuto > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  <span>
                    <strong>{summary.learning.tuning.promoteToAuto}</strong> polic{summary.learning.tuning.promoteToAuto === 1 ? "y" : "ies"} consistently
                    effective — consider promoting to auto-execution
                  </span>
                </div>
              )}
              {summary.learning.tuning.considerDisabling > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  <span>
                    <strong>{summary.learning.tuning.considerDisabling}</strong> polic{summary.learning.tuning.considerDisabling === 1 ? "y" : "ies"} consistently
                    ineffective — consider disabling or revising
                  </span>
                </div>
              )}
              {summary.learning.tuning.frequentlyRejected > 0 && (
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-orange-600" />
                  <span>
                    <strong>{summary.learning.tuning.frequentlyRejected}</strong> polic{summary.learning.tuning.frequentlyRejected === 1 ? "y" : "ies"} frequently
                    rejected — review trigger conditions
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Summary Card helper
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  urgent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  urgent?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${urgent ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
