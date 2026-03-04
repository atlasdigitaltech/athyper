"use client";

// components/finance/DecisionScorePanel.tsx
//
// Read-only audit panel displaying Decision Grid evaluation results
// for a finance document. Shows composite score, approval route,
// per-module score bars, and any exceptions flagged during evaluation.

import { Badge, Card, Separator } from "@neon/ui";
import { cn } from "@/lib/utils";
import styles from "./DecisionScorePanel.module.css";

// ── Domain types ─────────────────────────────────────────────────────

type ApprovalRoute = "ZERO_APPROVAL" | "STANDARD" | "ENHANCED" | "EXECUTIVE" | "BLOCKED";

interface DecisionEvaluationResult {
    pipelineId: string;
    compositeScore: number;
    approvalRoute: ApprovalRoute;
    moduleScores: Record<string, number>;
    exceptions: string[];
    evaluatedAt: string;
}

export interface DecisionScorePanelProps {
    result: DecisionEvaluationResult | null;
    loading?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function scoreColorClass(score: number): string {
    if (score >= 0.9) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 0.75) return "text-blue-600 dark:text-blue-400";
    if (score >= 0.5) return "text-amber-600 dark:text-amber-400";
    if (score >= 0.25) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
}

function scoreBarColorClass(score: number): string {
    if (score >= 0.9) return "bg-emerald-500 dark:bg-emerald-400";
    if (score >= 0.75) return "bg-blue-500 dark:bg-blue-400";
    if (score >= 0.5) return "bg-amber-500 dark:bg-amber-400";
    if (score >= 0.25) return "bg-orange-500 dark:bg-orange-400";
    return "bg-red-500 dark:bg-red-400";
}

function scoreGradientColor(score: number): string {
    if (score >= 0.9) return "#10b981";
    if (score >= 0.75) return "#3b82f6";
    if (score >= 0.5) return "#f59e0b";
    if (score >= 0.25) return "#f97316";
    return "#ef4444";
}

const APPROVAL_ROUTE_CONFIG: Record<ApprovalRoute, { label: string; className: string }> = {
    ZERO_APPROVAL: {
        label: "Auto-Approved",
        className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    STANDARD: {
        label: "Standard Approval",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    ENHANCED: {
        label: "Enhanced Approval",
        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    },
    EXECUTIVE: {
        label: "Executive Approval",
        className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    },
    BLOCKED: {
        label: "Blocked",
        className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
    },
};

function formatTimestamp(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return iso;
    }
}

// ── Sub-components ───────────────────────────────────────────────────

function CircularScore({ score }: { score: number }) {
    const percentage = Math.round(score * 100);
    const fillColor = scoreGradientColor(score);

    return (
        <div
            className={cn(styles.circularScoreRing, "relative flex h-24 w-24 items-center justify-center rounded-full")}
            style={{ "--score-fill": fillColor, "--score-pct": percentage } as React.CSSProperties}
        >
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-card">
                <span className={cn("text-lg font-bold tabular-nums", scoreColorClass(score))}>
                    {score.toFixed(2)}
                </span>
            </div>
        </div>
    );
}

function ModuleScoreBar({ moduleKey, score }: { moduleKey: string; score: number }) {
    const percentage = Math.round(score * 100);

    return (
        <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-muted-foreground" title={moduleKey}>
                {moduleKey}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(styles.scoreBarFill, "absolute inset-y-0 left-0 rounded-full transition-all", scoreBarColorClass(score))}
                    style={{ "--score-pct": percentage } as React.CSSProperties}
                />
            </div>
            <span className={cn("w-12 shrink-0 text-right text-sm font-medium tabular-nums", scoreColorClass(score))}>
                {score.toFixed(2)}
            </span>
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────

export function DecisionScorePanel({ result, loading }: DecisionScorePanelProps) {
    if (loading) {
        return (
            <Card className="p-6">
                <div className="animate-pulse space-y-6">
                    <div className="h-5 w-48 rounded bg-muted" />
                    <div className="flex items-center gap-6">
                        <div className="h-24 w-24 rounded-full bg-muted" />
                        <div className="h-6 w-36 rounded-full bg-muted" />
                    </div>
                    <Separator />
                    <div className="space-y-3">
                        <div className="h-4 w-32 rounded bg-muted" />
                        <div className="h-5 w-full rounded bg-muted" />
                        <div className="h-5 w-3/4 rounded bg-muted" />
                        <div className="h-5 w-5/6 rounded bg-muted" />
                    </div>
                </div>
            </Card>
        );
    }

    if (!result) {
        return (
            <Card className="p-6">
                <p className="text-sm text-muted-foreground">No evaluation results available</p>
            </Card>
        );
    }

    const routeConfig = APPROVAL_ROUTE_CONFIG[result.approvalRoute];
    const moduleEntries = Object.entries(result.moduleScores);

    return (
        <Card className="p-6">
            <div className="space-y-6">
                <h3 className="text-sm font-semibold">Decision Grid Evaluation</h3>

                {/* Composite Score + Approval Route */}
                <div className="flex items-center gap-6">
                    <CircularScore score={result.compositeScore} />
                    <div className="space-y-2">
                        <Badge variant="outline" className={cn("text-xs", routeConfig.className)}>
                            {routeConfig.label}
                        </Badge>
                        <p className="text-xs text-muted-foreground">Composite Score</p>
                    </div>
                </div>

                {/* Module Scores */}
                {moduleEntries.length > 0 && (
                    <>
                        <Separator />
                        <div className="space-y-3">
                            <p className="text-sm font-medium">Module Scores</p>
                            {moduleEntries.map(([key, score]) => (
                                <ModuleScoreBar key={key} moduleKey={key} score={score} />
                            ))}
                        </div>
                    </>
                )}

                {/* Exceptions */}
                {result.exceptions.length > 0 && (
                    <>
                        <Separator />
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
                            <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                                Exceptions ({result.exceptions.length})
                            </p>
                            <ul className="list-disc space-y-1 pl-5">
                                {result.exceptions.map((ex, idx) => (
                                    <li key={idx} className="text-sm text-amber-700 dark:text-amber-400">{ex}</li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}

                {/* Footer */}
                <Separator />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Pipeline: <span className="font-mono">{result.pipelineId}</span></span>
                    <span>Evaluated: {formatTimestamp(result.evaluatedAt)}</span>
                </div>
            </div>
        </Card>
    );
}
