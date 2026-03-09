"use client";

// components/finance/ReleaseDashboard.tsx
//
// Release Control Tower — dashboard view showing all releases
// with status, governance posture, and component readiness.

import { useState } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Package,
  Send,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  ReleaseDashboardDTO,
  ReleaseKPIs,
  ReleaseStatus,
  ReleaseType,
} from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReleaseDashboardProps {
  releases: ReleaseDashboardDTO[];
  kpis?: ReleaseKPIs | null;
  loading?: boolean;
  onSelectRelease?: (releaseCode: string) => void;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ReleaseStatus, {
  color: string;
  icon: typeof CheckCircle2;
  label: string;
}> = {
  ASSEMBLING: { color: "bg-amber-100 text-amber-700", icon: Clock, label: "Assembling" },
  READY: { color: "bg-blue-100 text-blue-700", icon: Package, label: "Ready" },
  RELEASED: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Released" },
  SUPERSEDED: { color: "bg-gray-100 text-gray-500", icon: XCircle, label: "Superseded" },
  CANCELLED: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Cancelled" },
};

const TYPE_LABELS: Record<ReleaseType, string> = {
  MANAGEMENT_PACK: "Management Pack",
  BOARD_PACK: "Board Pack",
  REGULATORY: "Regulatory",
  AD_HOC: "Ad Hoc",
  INTERIM: "Interim",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReleaseDashboard({
  releases,
  kpis,
  loading = false,
  onSelectRelease,
  onRefresh,
}: ReleaseDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<ReleaseStatus | "ALL">("ALL");

  const safeReleases = releases ?? [];
  const filtered = statusFilter === "ALL"
    ? safeReleases
    : safeReleases.filter((r) => r.status === statusFilter);

  // Aggregate counts for filter pills
  const counts = safeReleases.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      acc.ALL = (acc.ALL ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Release Control Tower</h2>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* KPI strip */}
      {kpis && <KPIStrip kpis={kpis} />}

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["ALL", "ASSEMBLING", "READY", "RELEASED", "SUPERSEDED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              statusFilter === s
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            {counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {/* Release cards */}
      {filtered.length === 0 && !loading && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No releases found.
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((rel) => {
          const statusCfg = STATUS_CONFIG[rel.status];
          const StatusIcon = statusCfg.icon;

          return (
            <Card
              key={rel.releaseCode}
              className={cn(
                "p-4 cursor-pointer hover:border-slate-400 transition-colors",
                rel.status === "SUPERSEDED" && "opacity-60",
              )}
              onClick={() => onSelectRelease?.(rel.releaseCode)}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: identity + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={cn("text-xs", statusCfg.color)}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusCfg.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[rel.releaseType]}
                    </span>
                  </div>

                  <h3 className="font-medium text-sm truncate">{rel.releaseName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {rel.entityCode} &middot; FY{rel.fiscalYear} P{rel.periodFrom}
                    {rel.periodTo !== rel.periodFrom ? `-${rel.periodTo}` : ""}
                  </p>
                </div>

                {/* Center: governance posture */}
                <div className="flex items-center gap-3">
                  {/* Clean close indicator */}
                  {rel.isCleanClose != null && (
                    <div className="flex items-center gap-1">
                      {rel.isCleanClose ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-xs">
                        {rel.isCleanClose ? "Clean" : `${rel.overrideCount} override${rel.overrideCount !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                  )}

                  {/* Exception signoff status */}
                  {rel.requiresExceptionSignoff && (
                    <Badge className={cn(
                      "text-xs",
                      rel.hasExceptionSignoff
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700",
                    )}>
                      {rel.hasExceptionSignoff ? "Signed Off" : "Exception Pending"}
                    </Badge>
                  )}

                  {/* Distribution count */}
                  {rel.distributionsSent > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Send className="h-3 w-3" />
                      {rel.distributionsSent}
                    </div>
                  )}
                </div>

                {/* Right: component status dots */}
                <div className="flex flex-col items-end gap-1 text-xs">
                  <ComponentDot label="Pack" status={rel.packStatus} />
                  <ComponentDot label="Batch" status={rel.batchStatus} />
                  <ComponentDot label="Cert" status={rel.certificationStatus} />
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
              </div>

              {/* Timeline footer */}
              {rel.releaseDurationHours != null && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  Pipeline: {rel.releaseDurationHours.toFixed(1)}h
                  {rel.readinessScore && ` | Readiness: ${parseFloat(rel.readinessScore).toFixed(0)}%`}
                  {rel.manifestItemCount != null && ` | ${rel.manifestItemCount} manifest items`}
                  {rel.hasManifestHash && (
                    <CheckCircle2 className="inline h-3 w-3 ml-1 text-emerald-500" />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComponentDot — compact status indicator for sub-components
// ---------------------------------------------------------------------------

function KPIStrip({ kpis }: { kpis: ReleaseKPIs }) {
  const cards = [
    { label: "In Progress", value: kpis.inProgress, highlight: kpis.inProgress > 0 },
    { label: "Policy Blocked", value: kpis.policyBlocked, highlight: kpis.policyBlocked > 0, warn: true },
    { label: "Awaiting Signoff", value: kpis.awaitingExceptionSignoff, highlight: kpis.awaitingExceptionSignoff > 0, warn: true },
    { label: "Superseded", value: kpis.supersededCount, highlight: false },
    { label: "Released", value: kpis.releasedCount, highlight: false },
    { label: "Avg Duration", value: kpis.avgReleaseHours != null ? `${kpis.avgReleaseHours}h` : "--", highlight: false },
    { label: "Integrity Fails", value: kpis.integrityFailures, highlight: kpis.integrityFailures > 0, warn: true },
  ];

  return (
    <div className="grid grid-cols-7 gap-2">
      {cards.map(({ label, value, highlight, warn }) => (
        <Card key={label} className={cn(
          "p-3 text-center",
          highlight && warn ? "border-amber-300 bg-amber-50" : "",
        )}>
          <div className={cn(
            "text-xl font-semibold tabular-nums",
            highlight && warn ? "text-amber-700" : "text-slate-900",
          )}>
            {value}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
            {label}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComponentDot — compact status indicator for sub-components
// ---------------------------------------------------------------------------

function ComponentDot({ label, status }: { label: string; status: string | null }) {
  if (!status) return null;

  const isGood = ["PUBLISHED", "CERTIFIED", "RELEASED", "APPROVED", "FINALIZED", "SENT"].includes(status);
  const isBad = ["REJECTED", "FAILED", "INVALIDATED", "RECALLED", "CANCELLED"].includes(status);
  const color = isGood ? "bg-emerald-500" : isBad ? "bg-red-500" : "bg-amber-400";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <div className={cn("h-2 w-2 rounded-full", color)} title={status} />
    </div>
  );
}
