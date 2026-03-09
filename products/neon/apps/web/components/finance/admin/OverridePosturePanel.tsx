"use client";

// components/finance/admin/OverridePosturePanel.tsx
//
// Phase 9A: Override/Waiver Posture Panel — counts by scope, reason,
// approval status, and monetary impact.

import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Shield,
  ShieldAlert,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  OverridePostureDTO,
  OverridePostureSummaryDTO,
  OverrideScopeDTO,
  OverrideStatusDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OverridePosturePanelProps {
  overrides: OverridePostureDTO[] | null;
  summary: OverridePostureSummaryDTO | null;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OverridePosturePanel({
  overrides,
  summary,
  loading,
  error,
}: OverridePosturePanelProps) {
  if (loading && !summary) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading override posture…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Override Posture
        </CardTitle>
        <CardDescription>
          Waivers and exceptions for the current close cycle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary strip */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard
              label="Active"
              value={summary.activeOverrides}
              total={summary.totalOverrides}
              color={summary.activeOverrides > 0 ? "text-orange-600" : "text-green-600"}
            />
            <MetricCard label="Pending Approval" value={summary.pendingCount} warn={summary.pendingCount > 0} />
            <MetricCard label="Impact Total" value={formatCurrency(summary.activeImpactTotal)} isText />
            <MetricCard label="Gate Overrides" value={summary.gateOverrides} warn={summary.gateOverrides > 0} />
          </div>
        )}

        {/* Reason breakdown */}
        {summary && summary.totalOverrides > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">By Reason</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(REASON_LABELS).map(([key, label]) => {
                const count = summary.reasonBreakdown[key as keyof typeof summary.reasonBreakdown] ?? 0;
                if (count === 0) return null;
                return (
                  <Badge key={key} variant="outline" className="text-[10px]">
                    {label}: {count}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Scope breakdown bar */}
        {summary && summary.totalOverrides > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">By Scope</h4>
            <div className="flex h-3 w-full overflow-hidden rounded">
              {summary.taskOverrides > 0 && (
                <div
                  className="bg-blue-400"
                  style={{ width: `${(summary.taskOverrides / summary.totalOverrides) * 100}%` }}
                  title={`Task: ${summary.taskOverrides}`}
                />
              )}
              {summary.categoryOverrides > 0 && (
                <div
                  className="bg-yellow-400"
                  style={{ width: `${(summary.categoryOverrides / summary.totalOverrides) * 100}%` }}
                  title={`Category: ${summary.categoryOverrides}`}
                />
              )}
              {summary.gateOverrides > 0 && (
                <div
                  className="bg-red-400"
                  style={{ width: `${(summary.gateOverrides / summary.totalOverrides) * 100}%` }}
                  title={`Gate: ${summary.gateOverrides}`}
                />
              )}
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
              {summary.taskOverrides > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-blue-400" />Task ({summary.taskOverrides})</span>}
              {summary.categoryOverrides > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-yellow-400" />Category ({summary.categoryOverrides})</span>}
              {summary.gateOverrides > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-red-400" />Gate ({summary.gateOverrides})</span>}
            </div>
          </div>
        )}

        {/* Override detail table */}
        {overrides && overrides.length > 0 && (
          <div className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.overrideId}>
                    <TableCell>
                      <ScopeBadge scope={o.overrideScope} />
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{o.taskName ?? o.taskCategory ?? o.overrideScope}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {o.taskCode ? `${o.taskCode}: ${o.taskName}` : o.taskCategory ?? o.overrideScope}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-xs">
                      {REASON_LABELS[o.reasonCode] ?? o.reasonCode}
                    </TableCell>
                    <TableCell>
                      <OverrideStatusBadge status={o.status} isActive={o.isActive} />
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {o.impactAmount
                        ? `${formatCurrency(o.impactAmount)} ${o.impactCurrency ?? ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.requestedAt ? formatDateTime(o.requestedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {(!overrides || overrides.length === 0) && !loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-green-500" />
            No overrides for this period — clean close posture.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  total,
  color,
  warn,
  isText,
}: {
  label: string;
  value: number | string;
  total?: number;
  color?: string;
  warn?: boolean;
  isText?: boolean;
}) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" : ""}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${color ?? ""}`}>
        {isText ? value : value}
        {total != null && <span className="text-xs font-normal text-muted-foreground">/{total}</span>}
      </div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: OverrideScopeDTO }) {
  const colors: Record<string, string> = {
    TASK: "bg-blue-100 text-blue-700",
    CATEGORY: "bg-yellow-100 text-yellow-700",
    GATE: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[scope] ?? ""}`}>
      {scope}
    </span>
  );
}

function OverrideStatusBadge({ status, isActive }: { status: OverrideStatusDTO; isActive: boolean }) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
        <AlertTriangle className="h-2.5 w-2.5" />
        ACTIVE
      </span>
    );
  }
  const colors: Record<string, string> = {
    PENDING: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-gray-100 text-gray-500",
    REVOKED: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? ""}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<string, string> = {
  immaterial: "Immaterial",
  timing: "Timing",
  externalDelay: "External Delay",
  systemIssue: "System Issue",
  processGap: "Process Gap",
  managementJudgement: "Mgmt Judgement",
  regulatory: "Regulatory",
  other: "Other",
};

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
