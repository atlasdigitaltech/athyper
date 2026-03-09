"use client";

// components/finance/atlas/AnomalyExplorer.tsx
//
// Full anomaly list with filtering, severity breakdown, and status management.
// Fetches directly from /api/fin/atlas/anomalies.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { finGet, finPost } from "@/lib/finance/fetcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Anomaly {
  id: string;
  entityCode: string;
  anomalyType: string;
  severity: string;
  accountCode: string | null;
  accountName: string | null;
  accountType: string | null;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  observedValue: string | null;
  expectedValue: string | null;
  zScore: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  riskSignalId: string | null;
  status: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  detectedAt: string;
}

interface AnomalySummary {
  activeCount: number;
  criticalCount: number;
  warningCount: number;
  resolvedCount: number;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AnomalyExplorerProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "bg-red-100", text: "text-red-700" },
  WARNING: { bg: "bg-amber-100", text: "text-amber-700" },
  INFO: { bg: "bg-blue-100", text: "text-blue-700" },
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "bg-red-100", text: "text-red-700" },
  ACKNOWLEDGED: { bg: "bg-amber-100", text: "text-amber-700" },
  RESOLVED: { bg: "bg-emerald-100", text: "text-emerald-700" },
  FALSE_POSITIVE: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnomalyExplorer({ entityCode, fiscalYear, periodNumber }: AnomalyExplorerProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAnomalies = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({
        entityCode,
        fiscalYear: String(fiscalYear),
        periodNumber: String(periodNumber),
      });
      if (filterSeverity) qs.set("severity", filterSeverity);
      if (filterStatus) qs.set("status", filterStatus);

      const result = await finGet<{ anomalies: Anomaly[]; summary: AnomalySummary }>(
        `/api/fin/atlas/anomalies?${qs.toString()}`,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setAnomalies(result.anomalies ?? []);
        setSummary(result.summary ?? null);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err?.message ?? "Failed to load anomalies");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [entityCode, fiscalYear, periodNumber, filterSeverity, filterStatus]);

  useEffect(() => {
    fetchAnomalies();
    return () => abortRef.current?.abort();
  }, [fetchAnomalies]);

  const runDetection = async () => {
    setDetecting(true);
    try {
      await finPost("/api/fin/atlas/anomalies", { entityCode, fiscalYear, periodNumber });
      fetchAnomalies();
    } catch (err: any) {
      setError(err?.message ?? "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Total" value={summary.totalCount} />
          <SummaryCard label="Active" value={summary.activeCount} accent="text-red-600" />
          <SummaryCard label="Critical" value={summary.criticalCount} accent="text-red-600" />
          <SummaryCard label="Warning" value={summary.warningCount} accent="text-amber-600" />
          <SummaryCard label="Resolved" value={summary.resolvedCount} accent="text-emerald-600" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="h-8 rounded border bg-background px-2 text-xs"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded border bg-background px-2 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="RESOLVED">Resolved</option>
          <option value="FALSE_POSITIVE">False Positive</option>
        </select>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={runDetection}
          disabled={detecting}
          className="gap-1.5 text-xs"
        >
          {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run Detection
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchAnomalies}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && anomalies.length === 0 && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading anomalies...
        </div>
      )}

      {/* Anomaly list */}
      {anomalies.length > 0 && (
        <Card className="divide-y overflow-hidden">
          {anomalies.map((a) => {
            const sev = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.INFO;
            const stat = STATUS_STYLE[a.status] ?? STATUS_STYLE.OPEN;
            const isExpanded = expandedId === a.id;

            return (
              <div key={a.id} className="px-4 py-3">
                <button
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                >
                  <AlertTriangle className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    a.severity === "CRITICAL" ? "text-red-500" : a.severity === "WARNING" ? "text-amber-500" : "text-blue-500",
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{a.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge className={cn("text-[10px]", sev.bg, sev.text)}>{a.severity}</Badge>
                      <Badge className={cn("text-[10px]", stat.bg, stat.text)}>{a.status}</Badge>
                      <span className="text-[10px] text-muted-foreground">{a.anomalyType}</span>
                      {a.accountCode && (
                        <span className="text-[10px] text-muted-foreground">
                          {a.accountCode} {a.accountName ? `– ${a.accountName}` : ""}
                        </span>
                      )}
                      {a.zScore && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          z={a.zScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(a.detectedAt).toLocaleDateString()}
                  </span>
                  {isExpanded ? <ChevronUp className="mt-1 h-3 w-3 text-muted-foreground" /> : <ChevronDown className="mt-1 h-3 w-3 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="ml-7 mt-2 space-y-2 text-xs text-muted-foreground">
                    <p>{a.description}</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="font-medium text-foreground">Observed: </span>
                        {a.observedValue ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Expected: </span>
                        {a.expectedValue ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Z-Score: </span>
                        {a.zScore ?? "—"}
                      </div>
                    </div>
                    {a.riskSignalId && (
                      <p className="text-[10px]">
                        <span className="font-medium text-foreground">Risk Signal: </span>
                        {a.riskSignalId}
                      </p>
                    )}
                    {a.resolvedAt && (
                      <p className="text-[10px]">
                        <span className="font-medium text-foreground">Resolved: </span>
                        {new Date(a.resolvedAt).toLocaleString()}
                        {a.resolutionNotes && ` — ${a.resolutionNotes}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Empty state */}
      {!loading && anomalies.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm">No anomalies detected for this period.</p>
          <Button variant="outline" size="sm" onClick={runDetection} className="mt-2 gap-1.5 text-xs">
            <Play className="h-3.5 w-3.5" />
            Run Detection
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", accent)}>{value}</p>
    </Card>
  );
}
