"use client";

// components/finance/atlas/FeedbackCalibrationPanel.tsx
//
// Phase 6 — Adaptive Learning admin surface.
// Shows effectiveness metrics, calibration suggestions, and approval queue.

import { useState } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Gauge,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAtlasFeedback } from "@/lib/finance/use-atlas-feedback";
import type { CalibrationSuggestion, ActiveCalibration } from "@/lib/finance/use-atlas-feedback";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FeedbackCalibrationPanelProps {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeedbackCalibrationPanel({ entityCode, fiscalYear, periodNumber }: FeedbackCalibrationPanelProps) {
  const { data, loading, error, refresh, approveCalibration, rejectCalibration } = useAtlasFeedback(
    { entityCode, fiscalYear, periodNumber },
  );
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Computing effectiveness metrics...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <MessageSquare className="h-4 w-4" />
          {error}
          <button onClick={refresh} className="ml-auto text-xs underline">Retry</button>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const { effectiveness } = data;
  const ae = effectiveness.anomalyEffectiveness;
  const re = effectiveness.recommendationEffectiveness;
  const suggestions = effectiveness.calibrationSuggestions;
  const suggestedCalibrations = data.activeCalibrations.filter(c => c.status === "SUGGESTED");
  const approvedCalibrations = data.activeCalibrations.filter(c => c.status === "APPROVED");

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    await approveCalibration(id);
    setProcessingId(null);
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setProcessingId(id);
    await rejectCalibration(id, rejectReason);
    setProcessingId(null);
    setRejectingId(null);
    setRejectReason("");
  };

  return (
    <div className="space-y-6">
      {/* Effectiveness KPIs */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Detection Effectiveness</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EffectivenessCard
            icon={<Gauge className="h-3.5 w-3.5 text-blue-500" />}
            label="Anomaly Feedback"
            value={ae.totalFeedback}
          />
          <EffectivenessCard
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            label="Confirmed Rate"
            value={`${ae.confirmedRate}%`}
            detail={`${ae.confirmedCount} confirmed`}
          />
          <EffectivenessCard
            icon={<XCircle className="h-3.5 w-3.5 text-red-500" />}
            label="False Positive Rate"
            value={`${ae.falsePositiveRate}%`}
            detail={`${ae.falsePositiveCount} false positives`}
            accent={Number(ae.falsePositiveRate) > 30 ? "text-red-600" : undefined}
          />
          <EffectivenessCard
            icon={<TrendingUp className="h-3.5 w-3.5 text-indigo-500" />}
            label="Rec. Acceptance"
            value={`${re.acceptanceRate}%`}
            detail={`${re.acceptedCount}/${re.totalFeedback}`}
          />
        </div>
      </div>

      {/* Anomaly effectiveness by type */}
      {Object.keys(ae.byType).length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-2">
            <h4 className="text-xs font-semibold text-muted-foreground">By Anomaly Type</h4>
          </div>
          <div className="divide-y">
            {Object.entries(ae.byType).map(([type, stats]) => {
              const fpRate = stats.total > 0 ? (stats.falsePositive / stats.total * 100).toFixed(1) : "0.0";
              return (
                <div key={type} className="flex items-center gap-3 px-4 py-2">
                  <Badge variant="outline" className="text-[10px]">{type}</Badge>
                  <div className="flex-1 text-xs text-muted-foreground">
                    {stats.total} total · {stats.confirmed} confirmed · {stats.falsePositive} FP
                  </div>
                  <span className={cn(
                    "text-xs font-medium tabular-nums",
                    Number(fpRate) > 30 ? "text-red-600" : "text-muted-foreground",
                  )}>
                    {fpRate}% FP
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recommendation effectiveness by type */}
      {Object.keys(re.byType).length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-2">
            <h4 className="text-xs font-semibold text-muted-foreground">By Recommendation Type</h4>
          </div>
          <div className="divide-y">
            {Object.entries(re.byType).map(([type, stats]) => {
              const acceptRate = stats.total > 0 ? (stats.accepted / stats.total * 100).toFixed(1) : "0.0";
              return (
                <div key={type} className="flex items-center gap-3 px-4 py-2">
                  <Badge variant="outline" className="text-[10px]">{type}</Badge>
                  <div className="flex-1 text-xs text-muted-foreground">
                    {stats.total} total · {stats.accepted} accepted · {stats.dismissed} dismissed
                  </div>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {acceptRate}% accepted
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Calibration suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-500" />
            Calibration Suggestions
          </h3>
          <Card className="divide-y overflow-hidden">
            {suggestions.map((s, i) => (
              <CalibrationSuggestionRow key={i} suggestion={s} />
            ))}
          </Card>
        </div>
      )}

      {/* Pending calibration approvals */}
      {suggestedCalibrations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            Calibration Approval Queue ({suggestedCalibrations.length})
          </h3>
          <Card className="divide-y overflow-hidden">
            {suggestedCalibrations.map((cal) => (
              <div key={cal.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{cal.anomalyType}</Badge>
                  {cal.accountCode && (
                    <span className="text-[10px] text-muted-foreground">{cal.accountCode}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {cal.warningZThreshold}σ / {cal.criticalZThreshold}σ
                  </span>
                  <Badge className="bg-amber-100 text-amber-700 text-[10px]">SUGGESTED</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {cal.confidence && `${cal.confidence}% confidence`}
                    {cal.sampleSize && ` · ${cal.sampleSize} samples`}
                  </span>
                </div>

                {rejectingId === cal.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason..."
                      className="h-7 flex-1 rounded border bg-background px-2 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleReject(cal.id)}
                      disabled={!rejectReason.trim() || processingId === cal.id}
                    >
                      {processingId === cal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reject"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleApprove(cal.id)}
                      disabled={processingId === cal.id}
                    >
                      {processingId === cal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setRejectingId(cal.id)}
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Active approved calibrations */}
      {approvedCalibrations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Active Calibrations</h3>
          <Card className="divide-y overflow-hidden">
            {approvedCalibrations.map((cal) => (
              <div key={cal.id} className="flex items-center gap-2 px-4 py-2">
                <Badge variant="outline" className="text-[10px]">{cal.anomalyType}</Badge>
                {cal.accountCode && (
                  <span className="text-[10px] text-muted-foreground">{cal.accountCode}</span>
                )}
                <span className="text-xs font-mono tabular-nums">
                  {cal.warningZThreshold}σ / {cal.criticalZThreshold}σ
                </span>
                <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">APPROVED</Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {cal.approvedAt && `Approved ${new Date(cal.approvedAt).toLocaleDateString()}`}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Empty state */}
      {ae.totalFeedback === 0 && re.totalFeedback === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <MessageSquare className="h-8 w-8 text-gray-300" />
          <p className="text-sm">No feedback submitted yet for this entity.</p>
          <p className="text-xs">Feedback on anomalies and recommendations will appear here.</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Computed at {new Date(data.computedAt).toLocaleString()}</span>
        <button onClick={refresh} className="flex items-center gap-1 hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EffectivenessCard({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail?: string;
  accent?: string;
}) {
  return (
    <Card className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", accent)}>{value}</p>
      {detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}
    </Card>
  );
}

function CalibrationSuggestionRow({ suggestion: s }: { suggestion: CalibrationSuggestion }) {
  const [expanded, setExpanded] = useState(false);
  const isLoosening = Number(s.suggestedWarningThreshold) > Number(s.currentWarningThreshold);

  return (
    <div className="px-4 py-2.5">
      <button className="flex w-full items-start gap-2 text-left" onClick={() => setExpanded(!expanded)}>
        {isLoosening ? (
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">{s.anomalyType}</Badge>
            {s.accountCode && <span className="text-[10px] text-muted-foreground">{s.accountCode}</span>}
            <span className="text-xs">
              {s.currentWarningThreshold}σ → {s.suggestedWarningThreshold}σ
            </span>
            <Badge className={cn(
              "text-[10px]",
              isLoosening ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700",
            )}>
              {isLoosening ? "Loosen" : "Tighten"}
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            FP Rate: {s.falsePositiveRate}% · {s.sampleSize} samples · {s.confidence}% confidence
          </p>
        </div>
      </button>
      {expanded && (
        <p className="ml-5.5 mt-1.5 text-xs text-muted-foreground">{s.rationale}</p>
      )}
    </div>
  );
}
