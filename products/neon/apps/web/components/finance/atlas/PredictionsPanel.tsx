"use client";

// components/finance/atlas/PredictionsPanel.tsx
//
// Dedicated predictions view — extracted from the dashboard summary.
// Shows close duration, release readiness, and reconciliation completion.

import {
  Card,
  Badge,
} from "@neon/ui";
import {
  Clock,
  TrendingUp,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AtlasDashboardData } from "@/lib/finance/use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PredictionsPanelProps {
  data: AtlasDashboardData | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PredictionsPanel({ data, loading }: PredictionsPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading predictions...
      </div>
    );
  }

  if (!data) return null;

  const { predictions } = data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Close Duration Prediction */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Close Duration</span>
          </div>
          <div className="px-4 py-4">
            {predictions.closeDuration ? (
              <>
                <p className="text-3xl font-bold tabular-nums">
                  {predictions.closeDuration.expectedCloseDays}
                  <span className="text-base font-normal text-muted-foreground ml-1">days</span>
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Confidence</span>
                    <span className="font-medium text-foreground">{predictions.closeDuration.confidencePercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Historical Avg</span>
                    <span className="font-medium text-foreground">{predictions.closeDuration.historicalAvgDays}d</span>
                  </div>
                  <ConfidenceBar value={predictions.closeDuration.confidencePercent} />
                </div>
              </>
            ) : (
              <EmptyPrediction label="Insufficient data for close duration prediction" />
            )}
          </div>
        </Card>

        {/* Release Readiness Prediction */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Release Readiness</span>
          </div>
          <div className="px-4 py-4">
            {predictions.releaseReadiness ? (
              <>
                <p className="text-3xl font-bold tabular-nums">
                  {Math.round(predictions.releaseReadiness.probability * 100)}
                  <span className="text-base font-normal text-muted-foreground ml-0.5">%</span>
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Confidence</span>
                    <span className="font-medium text-foreground">{predictions.releaseReadiness.confidencePercent}%</span>
                  </div>
                  <ConfidenceBar
                    value={predictions.releaseReadiness.probability * 100}
                    color={predictions.releaseReadiness.probability >= 0.8 ? "bg-emerald-500" : predictions.releaseReadiness.probability >= 0.5 ? "bg-amber-500" : "bg-red-500"}
                  />
                  {predictions.releaseReadiness.blockers.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground mb-1">Blockers</p>
                      {predictions.releaseReadiness.blockers.map((b, i) => (
                        <div key={i} className="flex items-center gap-1 text-[11px] text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          {b}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyPrediction label="Insufficient data for readiness prediction" />
            )}
          </div>
        </Card>

        {/* Reconciliation Completion */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-teal-500" />
            <span className="text-sm font-semibold">Reconciliation</span>
          </div>
          <div className="px-4 py-4">
            {predictions.reconCompletion ? (
              <>
                <p className="text-3xl font-bold tabular-nums">
                  {predictions.reconCompletion.completedSessions}
                  <span className="text-base font-normal text-muted-foreground">
                    /{predictions.reconCompletion.totalSessions}
                  </span>
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Remaining</span>
                    <span className="font-medium text-foreground">{predictions.reconCompletion.sessionsRemaining}</span>
                  </div>
                  <ConfidenceBar
                    value={predictions.reconCompletion.totalSessions > 0
                      ? (predictions.reconCompletion.completedSessions / predictions.reconCompletion.totalSessions) * 100
                      : 0}
                    color="bg-teal-500"
                  />
                </div>
              </>
            ) : (
              <EmptyPrediction label="No reconciliation sessions for this period" />
            )}
          </div>
        </Card>
      </div>

      {/* Computation timestamp */}
      <p className="text-[10px] text-muted-foreground">
        Predictions computed at {new Date(predictions.computedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceBar({ value, color = "bg-blue-500" }: { value: number; color?: string }) {
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
      <div
        className={cn("h-1.5 rounded-full transition-all", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function EmptyPrediction({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
      <span className="text-2xl">—</span>
      <p className="text-[10px] text-center">{label}</p>
    </div>
  );
}
