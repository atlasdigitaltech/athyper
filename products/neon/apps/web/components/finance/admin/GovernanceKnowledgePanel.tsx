"use client";

// components/finance/admin/GovernanceKnowledgePanel.tsx
//
// Phase 20: Governance Knowledge Graph & Control Memory Panel.
// Shows relationship graph summary, control memory cards, governance
// pathways with stage progression, and provenance confidence levels.

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  GitBranch,
  Loader2,
  Network,
  RefreshCw,
  Shield,
  TrendingUp,
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
  KnowledgeSummaryDTO,
  ControlMemoryDTO,
  GovernancePathwayDTO,
  PathwayStatsDTO,
} from "@/lib/finance/use-governance-knowledge";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GovernanceKnowledgePanelProps {
  summary: KnowledgeSummaryDTO | null;
  memory: ControlMemoryDTO[];
  pathways: GovernancePathwayDTO[];
  pathwayStats: PathwayStatsDTO | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  issue_only: { label: "Issue Only", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: AlertTriangle },
  recommendation_only: { label: "Has Recommendation", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: BookOpen },
  program_in_progress: { label: "Program Active", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: GitBranch },
  full_pathway: { label: "Outcome Tracked", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: Check },
};

const MEMORY_KIND_LABELS: Record<string, string> = {
  chronic_issue: "Chronic Issues",
  policy_recommendation: "Recommendations",
  benchmark_metric: "Benchmark Metrics",
  control_program: "Programs",
};

const OUTCOME_COLORS: Record<string, string> = {
  improved_to_green: "text-green-600 dark:text-green-400",
  improved_to_amber: "text-yellow-600 dark:text-yellow-400",
  unchanged: "text-slate-500",
  declined: "text-red-600 dark:text-red-400",
};

const TRAFFIC_DOTS: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GovernanceKnowledgePanel({
  summary,
  memory,
  pathways,
  pathwayStats,
  loading,
  error,
  onRefresh,
}: GovernanceKnowledgePanelProps) {
  const [activeTab, setActiveTab] = useState<"pathways" | "memory">("pathways");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

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
          <Network className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <CardTitle className="text-base font-semibold">Governance Knowledge Graph</CardTitle>
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
            <StatCard
              label="Graph Edges"
              value={summary.graph.totalEdges}
              sub={`${summary.graph.uniqueNodeKinds} node types`}
            />
            <StatCard
              label="Memory Objects"
              value={summary.memory.objects.reduce((s, o) => s + o.count, 0)}
              sub={`${summary.memory.objects.reduce((s, o) => s + o.resolvedCount, 0)} resolved`}
            />
            <StatCard
              label="Pathways"
              value={summary.pathways.stages.reduce((s, p) => s + p.count, 0)}
              sub={`${summary.pathways.stages.find((p) => p.stage === "full_pathway")?.count ?? 0} complete`}
            />
            <StatCard
              label="Success Rate"
              value={pathwayStats ? `${pathwayStats.successRate}%` : "--"}
              sub="completed pathways"
            />
          </div>
        )}

        {/* Pathway stage progression bar */}
        {pathwayStats && pathwayStats.total > 0 && (
          <PathwayProgressBar stats={pathwayStats} />
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 border-b">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "pathways"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("pathways")}
          >
            <GitBranch className="mr-1 inline h-3.5 w-3.5" />
            Pathways ({pathways.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "memory"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("memory")}
          >
            <Brain className="mr-1 inline h-3.5 w-3.5" />
            Memory ({memory.length})
          </button>
        </div>

        {/* Pathways tab */}
        {activeTab === "pathways" && (
          <div className="space-y-2">
            {pathways.length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No governance pathways found.
              </p>
            )}
            {pathways.map((pw, idx) => {
              const isExpanded = expandedIssue === `${pw.issueKey}-${idx}`;
              const stageConf = STAGE_CONFIG[pw.pathwayStage] ?? STAGE_CONFIG.issue_only;
              return (
                <div key={`${pw.issueKey}-${idx}`} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={stageConf.color}>
                          {stageConf.label}
                        </Badge>
                        {pw.pathwaySuccessful && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            Success
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {pw.issueSeverityCount}x
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{pw.issueLabel}</p>
                      {/* Mini pathway visualization */}
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium">{pw.issueSource === "chronic_issue" ? "Issue" : "Red Metric"}</span>
                        {pw.recommendationType && (
                          <>
                            <ArrowRight className="h-3 w-3" />
                            <span>{pw.recommendationType}</span>
                          </>
                        )}
                        {pw.programCode && (
                          <>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-medium">{pw.programCode}</span>
                            {pw.programHealth && (
                              <span className={`inline-block h-2 w-2 rounded-full ${TRAFFIC_DOTS[pw.programHealth] ?? "bg-slate-400"}`} />
                            )}
                          </>
                        )}
                        {pw.outcomeDirection && (
                          <>
                            <ArrowRight className="h-3 w-3" />
                            <span className={OUTCOME_COLORS[pw.outcomeDirection] ?? ""}>
                              {pw.outcomeDirection.replace(/_/g, " ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setExpandedIssue(isExpanded ? null : `${pw.issueKey}-${idx}`)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                      {pw.recommendationTitle && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Recommendation</span>
                          <p className="mt-0.5 text-sm">{pw.recommendationTitle}</p>
                          <p className="text-xs text-muted-foreground">{pw.policyArea} / {pw.recommendationPriority}</p>
                        </div>
                      )}
                      {pw.programTitle && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Program</span>
                          <p className="mt-0.5 text-sm">{pw.programTitle}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{pw.programStatus}</span>
                            {pw.milestoneCompletionPct && <span>{pw.milestoneCompletionPct}% milestones</span>}
                            {pw.elapsedDays != null && <span>{pw.elapsedDays}d elapsed</span>}
                          </div>
                        </div>
                      )}
                      {pw.outcomeMetric && (
                        <div className="sm:col-span-2">
                          <span className="text-xs font-medium text-muted-foreground">Outcome</span>
                          <div className="mt-0.5 flex items-center gap-3 text-sm">
                            <span>
                              <span className={`inline-block mr-1 h-2 w-2 rounded-full ${TRAFFIC_DOTS[pw.baselineTrafficLight ?? ""] ?? "bg-slate-400"}`} />
                              Baseline: {pw.baselineValue}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span>
                              <span className={`inline-block mr-1 h-2 w-2 rounded-full ${TRAFFIC_DOTS[pw.currentTrafficLight ?? ""] ?? "bg-slate-400"}`} />
                              Current: {pw.currentValue}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Memory tab */}
        {activeTab === "memory" && (
          <div className="space-y-4">
            {memory.length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No control memory data available.
              </p>
            )}

            {/* Group by objectKind */}
            {Object.entries(
              memory.reduce<Record<string, ControlMemoryDTO[]>>((acc, m) => {
                (acc[m.objectKind] ??= []).push(m);
                return acc;
              }, {}),
            ).map(([kind, items]) => (
              <div key={kind}>
                <h5 className="mb-1.5 text-sm font-medium text-muted-foreground">
                  {MEMORY_KIND_LABELS[kind] ?? kind} ({items.length})
                </h5>
                <div className="space-y-1">
                  {items.map((m) => (
                    <div
                      key={`${m.objectKind}-${m.objectKey}`}
                      className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{m.objectLabel}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{m.occurrenceCount}x seen</span>
                          {m.programsCreated > 0 && (
                            <span>{m.programsCreated} program{m.programsCreated > 1 ? "s" : ""}</span>
                          )}
                          {m.programsCompleted > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              {m.programsCompleted} completed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-2">
                        {m.everResolved ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 text-xs dark:bg-green-900/20 dark:text-green-400">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 text-xs dark:bg-red-900/20 dark:text-red-400">
                            Open
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat Card helper
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pathway Progress Bar
// ---------------------------------------------------------------------------

function PathwayProgressBar({ stats }: { stats: PathwayStatsDTO }) {
  const total = stats.total;
  if (total === 0) return null;

  const stages = ["issue_only", "recommendation_only", "program_in_progress", "full_pathway"];
  const colors = ["bg-red-400", "bg-yellow-400", "bg-blue-400", "bg-green-400"];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Pathway Progression</span>
        <span>{total} total</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {stages.map((stage, i) => {
          const count = stats.stageDistribution[stage] ?? 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={stage}
              className={`${colors[i]} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${STAGE_CONFIG[stage]?.label ?? stage}: ${count}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        {stages.map((stage, i) => {
          const count = stats.stageDistribution[stage] ?? 0;
          if (count === 0) return null;
          return (
            <div key={stage} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${colors[i]}`} />
              <span className="text-muted-foreground">{STAGE_CONFIG[stage]?.label}: {count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
