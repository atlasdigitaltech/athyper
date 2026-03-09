"use client";

// components/finance/ReleaseDetail.tsx
//
// Detailed view for a single pack release — shows governance posture,
// component status, decision log, overrides, and action buttons.

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
  ArrowLeft,
  Send,
  RefreshCw,
  Loader2,
  FileText,
  History,
  Bell,
  Timer,
  Shield,
  Eye,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAtlasDashboard } from "@/lib/finance/use-atlas-dashboard";
import { AtlasInsightsPanel } from "@/components/finance/AtlasInsightsPanel";

import type { UseReleaseDetailResult } from "@/lib/finance/use-releases";
import type {
  ReleaseStatus,
  ReleaseDecisionLogDTO,
  ReleaseNotificationEventDTO,
  ReleaseSLASnapshotDTO,
  CloseOverrideDTO,
  PublicationManifestItemDTO,
  ReleaseCommandResult,
  DecisionResult,
  NotificationSeverity,
  OverrideStatus,
  ReleaseEventCode,
} from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReleaseDetailProps {
  release: NonNullable<UseReleaseDetailResult["release"]>;
  decisions?: ReleaseDecisionLogDTO[];
  notifications?: ReleaseNotificationEventDTO[];
  sla?: ReleaseSLASnapshotDTO | null;
  overrides?: CloseOverrideDTO[];
  manifestItems?: PublicationManifestItemDTO[];
  onBack?: () => void;
  onRefresh?: () => void;
  // Commands
  onMarkReady?: () => Promise<ReleaseCommandResult | null>;
  onRelease?: () => Promise<ReleaseCommandResult | null>;
  onCancel?: (reason?: string) => Promise<ReleaseCommandResult | null>;
  onExceptionSignoff?: (notes: string) => Promise<ReleaseCommandResult | null>;
  onVerifyIntegrity?: () => Promise<ReleaseCommandResult | null>;
  commanding?: boolean;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ReleaseStatus, { color: string; label: string }> = {
  ASSEMBLING: { color: "bg-amber-100 text-amber-700", label: "Assembling" },
  READY: { color: "bg-blue-100 text-blue-700", label: "Ready" },
  RELEASED: { color: "bg-emerald-100 text-emerald-700", label: "Released" },
  SUPERSEDED: { color: "bg-gray-100 text-gray-500", label: "Superseded" },
  CANCELLED: { color: "bg-red-100 text-red-700", label: "Cancelled" },
};

const DECISION_COLORS: Record<DecisionResult, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  BLOCKED: "bg-red-100 text-red-700",
  DEFERRED: "bg-amber-100 text-amber-700",
};

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  INFO: "bg-blue-100 text-blue-700",
  WARNING: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const OVERRIDE_STATUS_COLORS: Record<OverrideStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
  REVOKED: "bg-orange-100 text-orange-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReleaseDetail({
  release: r,
  decisions = [],
  notifications = [],
  sla,
  overrides = [],
  manifestItems = [],
  onBack,
  onRefresh,
  onMarkReady,
  onRelease,
  onCancel,
  onExceptionSignoff,
  onVerifyIntegrity,
  commanding = false,
}: ReleaseDetailProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "decisions" | "overrides" | "manifest" | "notifications" | "sla">("overview");
  const [signoffNotes, setSignoffNotes] = useState("");

  const atlas = useAtlasDashboard({
    entityCode: r.entityCode,
    fiscalYear: r.fiscalYear,
    periodNumber: r.periodFrom,
  });

  const statusCfg = STATUS_CONFIG[r.status];

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: Eye },
    { key: "decisions" as const, label: `Decisions (${decisions.length})`, icon: History },
    { key: "overrides" as const, label: `Overrides (${overrides.length})`, icon: Shield },
    { key: "manifest" as const, label: `Manifest (${manifestItems.length})`, icon: FileText },
    { key: "notifications" as const, label: `Alerts (${notifications.length})`, icon: Bell },
    { key: "sla" as const, label: "SLA", icon: Timer },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold">{r.releaseName}</h2>
              <Badge className={cn("text-xs", statusCfg.color)}>{statusCfg.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {r.releaseCode} &middot; {r.entityCode} &middot; FY{r.fiscalYear} P{r.periodFrom}
              {r.periodTo !== r.periodFrom ? `-${r.periodTo}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Action buttons based on current status */}
          {r.status === "ASSEMBLING" && onMarkReady && (
            <Button size="sm" onClick={onMarkReady} disabled={commanding}>
              {commanding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Mark Ready
            </Button>
          )}
          {r.status === "READY" && !r.requiresExceptionSignoff && onRelease && (
            <Button size="sm" onClick={onRelease} disabled={commanding}>
              {commanding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Release
            </Button>
          )}
          {r.status === "READY" && r.requiresExceptionSignoff && !r.exceptionSignoffBy && onRelease && (
            <Button size="sm" variant="outline" disabled>
              <AlertTriangle className="h-4 w-4 mr-1" />
              Exception Signoff Required
            </Button>
          )}
          {r.status === "READY" && r.requiresExceptionSignoff && r.exceptionSignoffBy && onRelease && (
            <Button size="sm" onClick={onRelease} disabled={commanding}>
              {commanding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Release (Exception Approved)
            </Button>
          )}
          {onVerifyIntegrity && ["ASSEMBLING", "READY", "RELEASED"].includes(r.status) && (
            <Button size="sm" variant="outline" onClick={onVerifyIntegrity} disabled={commanding}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Verify
            </Button>
          )}
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Governance posture banner */}
      {r.isCleanClose != null && (
        <Card className={cn(
          "p-3 flex items-center gap-3",
          r.isCleanClose ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200",
        )}>
          {r.isCleanClose ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          )}
          <div className="text-sm">
            {r.isCleanClose ? (
              <span className="font-medium text-emerald-700">Clean Close</span>
            ) : (
              <span className="font-medium text-amber-700">
                Non-Clean Close: {r.overrideCount} override{r.overrideCount !== 1 ? "s" : ""}
                {r.overrideImpactTotal && ` ($${parseFloat(r.overrideImpactTotal).toLocaleString()})`}
              </span>
            )}
            {r.readinessScore && (
              <span className="text-muted-foreground ml-2">
                Readiness: {parseFloat(r.readinessScore).toFixed(0)}%
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Actionable notifications — proactive nudges based on state */}
      <ActionableNotifications
        notifications={notifications}
        status={r.status}
        requiresExceptionSignoff={r.requiresExceptionSignoff}
        hasExceptionSignoff={!!r.exceptionSignoffBy}
        onVerifyIntegrity={onVerifyIntegrity}
        onExceptionSignoff={onExceptionSignoff ? () => {} : undefined}
        commanding={commanding}
      />

      {/* Atlas Insights — intelligence dashboard */}
      <AtlasInsightsPanel
        data={atlas.data}
        loading={atlas.loading}
        error={atlas.error}
        onRefresh={atlas.refresh}
      />

      {/* Exception signoff input */}
      {r.status === "READY" && r.requiresExceptionSignoff && !r.exceptionSignoffBy && onExceptionSignoff && (
        <Card className="p-4 bg-red-50 border-red-200">
          <h4 className="text-sm font-medium text-red-700 mb-2">Exception Signoff Required</h4>
          <p className="text-xs text-red-600 mb-3">
            This release has {r.overrideCount} close override{r.overrideCount !== 1 ? "s" : ""} and
            requires CFO/controller exception signoff before it can be released.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Signoff justification notes..."
              value={signoffNotes}
              onChange={(e) => setSignoffNotes(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border rounded-md"
            />
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={commanding || !signoffNotes.trim()}
              onClick={() => {
                onExceptionSignoff(signoffNotes.trim());
                setSignoffNotes("");
              }}
            >
              Grant Signoff
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
              activeTab === key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-muted-foreground hover:text-slate-700",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab release={r} />
      )}
      {activeTab === "decisions" && (
        <DecisionsTab decisions={decisions} />
      )}
      {activeTab === "overrides" && (
        <OverridesTab overrides={overrides} />
      )}
      {activeTab === "manifest" && (
        <ManifestTab items={manifestItems} />
      )}
      {activeTab === "notifications" && (
        <NotificationsTab notifications={notifications} />
      )}
      {activeTab === "sla" && (
        <SLATab sla={sla ?? null} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ release: r }: { release: ReleaseDetailProps["release"] }) {
  const componentRows = [
    { label: "Pack Instance", id: r.packInstanceId, status: r.packStatus },
    { label: "Publication Batch", id: r.publicationBatchId, status: r.batchStatus },
    { label: "Certification", id: r.certificationId, status: r.certificationStatus },
    { label: "Close Run", id: r.closeRunId, status: r.periodStatusAtRelease },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Component status */}
      <Card className="p-4">
        <h4 className="text-sm font-medium mb-3">Release Components</h4>
        <div className="space-y-2">
          {componentRows.map(({ label, id, status }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              {id ? (
                <Badge className="text-xs bg-slate-100 text-slate-700">
                  {status ?? "linked"}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground italic">not linked</span>
              )}
            </div>
          ))}
          {r.manifestHash && (
            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <span className="text-muted-foreground">Manifest Hash</span>
              <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">
                {r.manifestHash.slice(0, 12)}...
              </code>
            </div>
          )}
        </div>
      </Card>

      {/* Timeline */}
      <Card className="p-4">
        <h4 className="text-sm font-medium mb-3">Timeline</h4>
        <div className="space-y-2 text-sm">
          <TimelineRow label="Created" time={r.createdAt} />
          <TimelineRow label="Assembled" time={r.assembledAt} />
          <TimelineRow label="Ready" time={r.readyAt} />
          {r.exceptionSignoffAt && (
            <TimelineRow label="Exception Signoff" time={r.exceptionSignoffAt} />
          )}
          <TimelineRow label="Released" time={r.releasedAt} />
          {r.supersededAt && (
            <TimelineRow label="Superseded" time={r.supersededAt} />
          )}
        </div>
        {r.supersessionReason && (
          <p className="mt-2 text-xs text-muted-foreground italic">
            Supersession reason: {r.supersessionReason}
          </p>
        )}
      </Card>
    </div>
  );
}

function TimelineRow({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {time ? (
        <span className="text-xs">{new Date(time).toLocaleString()}</span>
      ) : (
        <span className="text-xs text-muted-foreground">--</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decisions tab
// ---------------------------------------------------------------------------

function DecisionsTab({ decisions }: { decisions: ReleaseDecisionLogDTO[] }) {
  if (decisions.length === 0) {
    return <EmptyState message="No decisions recorded yet." />;
  }

  return (
    <div className="space-y-2">
      {decisions.map((d) => (
        <Card key={d.id} className="p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", DECISION_COLORS[d.result])}>
                {d.result}
              </Badge>
              <span className="text-sm font-medium">{d.command}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {d.createdAt ? new Date(d.createdAt).toLocaleString() : ""}
            </span>
          </div>
          {d.policyEvaluation && Object.keys(d.policyEvaluation).length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Policy evaluation
              </summary>
              <pre className="mt-1 text-xs bg-slate-50 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(d.policyEvaluation, null, 2)}
              </pre>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overrides tab
// ---------------------------------------------------------------------------

function OverridesTab({ overrides }: { overrides: CloseOverrideDTO[] }) {
  if (overrides.length === 0) {
    return <EmptyState message="No close overrides for this release." />;
  }

  return (
    <div className="space-y-2">
      {overrides.map((o) => (
        <Card key={o.id} className="p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", OVERRIDE_STATUS_COLORS[o.status])}>
                {o.status}
              </Badge>
              <span className="text-sm font-medium">{o.reasonCode}</span>
              {o.reasonSubcode && (
                <span className="text-xs text-muted-foreground">({o.reasonSubcode})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {o.impactAmount && (
                <span className="text-xs font-mono">
                  ${parseFloat(o.impactAmount).toLocaleString()} {o.impactCurrency}
                </span>
              )}
              <Badge className="text-xs bg-slate-100 text-slate-600">
                {o.overrideScope}
              </Badge>
            </div>
          </div>
          {o.reasonDetail && (
            <p className="text-xs text-muted-foreground mt-1">{o.reasonDetail}</p>
          )}
          {o.decisionNotes && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Decision: {o.decisionNotes}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manifest tab
// ---------------------------------------------------------------------------

function ManifestTab({ items }: { items: PublicationManifestItemDTO[] }) {
  if (items.length === 0) {
    return <EmptyState message="No manifest items published yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Version</th>
            <th className="py-2 pr-3">Period</th>
            <th className="py-2 pr-3 text-right">Value</th>
            <th className="py-2 pr-3">Hash</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge className="text-xs bg-slate-100 text-slate-600">
                  {item.artifactType.replace("_", " ")}
                </Badge>
              </td>
              <td className="py-2 pr-3 font-mono text-xs">{item.definitionCode ?? "--"}</td>
              <td className="py-2 pr-3 text-center">{item.definitionVersion ?? "--"}</td>
              <td className="py-2 pr-3">P{item.periodNumber}</td>
              <td className="py-2 pr-3 text-right font-mono">
                {item.publishedValue != null
                  ? `${parseFloat(item.publishedValue).toLocaleString()} ${item.publishedCurrency ?? ""}`
                  : "--"}
              </td>
              <td className="py-2 pr-3">
                {item.artifactHash ? (
                  <code className="text-xs bg-slate-50 px-1 rounded">
                    {item.artifactHash.slice(0, 8)}...
                  </code>
                ) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications tab
// ---------------------------------------------------------------------------

function NotificationsTab({ notifications }: { notifications: ReleaseNotificationEventDTO[] }) {
  if (notifications.length === 0) {
    return <EmptyState message="No notifications emitted." />;
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <Card key={n.id} className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", SEVERITY_COLORS[n.severity])}>
                {n.severity}
              </Badge>
              <span className="text-xs font-medium">{n.eventCode.replace(/_/g, " ")}</span>
            </div>
            <div className="flex items-center gap-2">
              {n.processed && (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              )}
              <span className="text-xs text-muted-foreground">
                {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{n.summary}</p>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SLA tab
// ---------------------------------------------------------------------------

function SLATab({ sla }: { sla: ReleaseSLASnapshotDTO | null }) {
  if (!sla) {
    return <EmptyState message="No SLA snapshot captured for this release." />;
  }

  const stages = [
    { label: "Close Duration", value: sla.closeDurationHours },
    { label: "Assembly", value: sla.assemblyDurationHours },
    { label: "Certification Wait", value: sla.certificationWaitHours },
    { label: "Exception Signoff Wait", value: sla.exceptionSignoffWaitHours },
    { label: "Release to Distribution", value: sla.releaseToDistributionHours },
    { label: "Total Pipeline", value: sla.totalPipelineHours },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">SLA Metrics</h4>
        <Badge className={cn(
          "text-xs",
          sla.closeSlaMet ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
        )}>
          {sla.closeSlaMet ? "SLA Met" : "SLA Missed"}
        </Badge>
      </div>

      <div className="space-y-2">
        {stages.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-xs">
              {value != null ? `${parseFloat(value).toFixed(1)}h` : "--"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
        Captured: {sla.capturedAt ? new Date(sla.capturedAt).toLocaleString() : "--"}
        {sla.isCleanClose != null && ` | ${sla.isCleanClose ? "Clean Close" : "Non-Clean"}`}
        {sla.overrideCount > 0 && ` | ${sla.overrideCount} override(s)`}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Actionable notifications — maps event codes to suggested actions
// ---------------------------------------------------------------------------

const EVENT_ACTION_MAP: Partial<Record<ReleaseEventCode, {
  actionLabel: string | null;
  targetAction: "verify" | "signoff" | null;
  severity: "info" | "warning" | "critical";
  message: string;
}>> = {
  INTEGRITY_VERIFICATION_FAILED: {
    actionLabel: "Run Integrity Check",
    targetAction: "verify",
    severity: "critical",
    message: "The last integrity verification failed. Re-verify before proceeding.",
  },
  EXCEPTION_SIGNOFF_REQUIRED: {
    actionLabel: "Grant Exception Signoff",
    targetAction: "signoff",
    severity: "warning",
    message: "This release requires exception signoff before it can be released.",
  },
  CERTIFICATION_INVALIDATED: {
    actionLabel: "Run Integrity Check",
    targetAction: "verify",
    severity: "critical",
    message: "A certification was invalidated. Verify release integrity.",
  },
  BATCH_SUPERSEDED: {
    actionLabel: "Run Integrity Check",
    targetAction: "verify",
    severity: "warning",
    message: "The publication batch was superseded. Check integrity is still valid.",
  },
  DISTRIBUTION_RECALLED: {
    actionLabel: null,
    targetAction: null,
    severity: "warning",
    message: "A distribution was recalled. Recipients may need to be re-notified.",
  },
  CLEAN_CLOSE_FAILED: {
    actionLabel: null,
    targetAction: null,
    severity: "warning",
    message: "Clean close evaluation failed. Exception signoff may be required.",
  },
};

const ACTION_SEVERITY_COLORS = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  critical: "bg-red-50 border-red-200 text-red-800",
};

function ActionableNotifications({
  notifications,
  status,
  requiresExceptionSignoff,
  hasExceptionSignoff,
  onVerifyIntegrity,
  onExceptionSignoff,
  commanding,
}: {
  notifications: ReleaseNotificationEventDTO[];
  status: ReleaseStatus;
  requiresExceptionSignoff: boolean;
  hasExceptionSignoff: boolean;
  onVerifyIntegrity?: () => Promise<ReleaseCommandResult | null>;
  onExceptionSignoff?: () => void;
  commanding: boolean;
}) {
  // Only show for active releases
  if (!["ASSEMBLING", "READY"].includes(status)) return null;

  // Find unprocessed actionable notifications
  const actionable = notifications
    .filter((n) => !n.processed && EVENT_ACTION_MAP[n.eventCode])
    .map((n) => ({ notification: n, action: EVENT_ACTION_MAP[n.eventCode]! }))
    // Deduplicate by event code (show most recent only)
    .filter((item, i, arr) =>
      arr.findIndex((x) => x.notification.eventCode === item.notification.eventCode) === i,
    );

  // Suppress exception signoff nudge if already signed off
  const filtered = actionable.filter((item) => {
    if (item.notification.eventCode === "EXCEPTION_SIGNOFF_REQUIRED" && hasExceptionSignoff) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  return (
    <div className="space-y-2">
      {filtered.map(({ notification: n, action }) => (
        <Card key={n.id} className={cn("p-3 border", ACTION_SEVERITY_COLORS[action.severity])}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {action.severity === "critical" ? (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              ) : (
                <Bell className="h-4 w-4 shrink-0" />
              )}
              <div>
                <span className="text-xs font-medium">{action.message}</span>
              </div>
            </div>
            {action.targetAction === "verify" && onVerifyIntegrity && (
              <Button size="sm" variant="outline" onClick={onVerifyIntegrity} disabled={commanding}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                {action.actionLabel}
              </Button>
            )}
            {action.targetAction === "signoff" && onExceptionSignoff && (
              <Badge className="text-xs bg-amber-200 text-amber-800 cursor-pointer"
                onClick={onExceptionSignoff}>
                {action.actionLabel}
              </Badge>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="p-6 text-center text-sm text-muted-foreground">
      {message}
    </Card>
  );
}
