"use client";

// components/finance/admin/CloseCertificationPack.tsx
//
// Phase 9C: Close Certification Pack — audit & board reporting.
// Tabs: Certification Status, Task Evidence, Exception Register,
// Override Register, SLA Compliance, Export.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileWarning,
  Loader2,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  useCloseCertification,
  useCloseTaskEvidence,
  useCloseCertificationPack,
} from "@/lib/finance/use-close-certification";
import { downloadCloseCertificationPack } from "@/lib/finance/export-close-certification";

import type {
  CertificationStatusDTO,
  CertificationTypeDTO,
  CloseCertificationDTO,
  CloseTaskEvidenceDTO,
  CopilotDrillAction,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Sub-tabs
// ---------------------------------------------------------------------------

const CERT_TABS = [
  { id: "status", label: "Certification", icon: Award },
  { id: "evidence", label: "Task Evidence", icon: FileCheck },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { id: "overrides", label: "Overrides", icon: ShieldAlert },
  { id: "sla", label: "SLA Compliance", icon: Clock },
] as const;

type CertTabId = (typeof CERT_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseCertificationPackProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Set by copilot drill-through to open a specific sub-tab */
  initialSubTab?: string;
  /** Set by copilot drill-through to highlight a specific item */
  focusId?: string;
  /** Action to perform on arrival */
  drillAction?: CopilotDrillAction;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CloseCertificationPack({
  entityCode,
  fiscalYear,
  periodNumber,
  initialSubTab,
  focusId,
  drillAction,
}: CloseCertificationPackProps) {
  const [activeTab, setActiveTab] = useState<CertTabId>("status");

  // Respond to drill-through navigation from copilot
  useEffect(() => {
    if (initialSubTab && CERT_TABS.some((t) => t.id === initialSubTab)) {
      setActiveTab(initialSubTab as CertTabId);
    }
  }, [initialSubTab]);

  const params = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  const {
    certification,
    loading: certLoading,
    error: certError,
    assemble,
    certify,
    attest,
  } = useCloseCertification(params);

  const {
    evidence,
    loading: evidenceLoading,
  } = useCloseTaskEvidence(params);

  const {
    pack,
    loading: packLoading,
    fetchPack,
  } = useCloseCertificationPack(params);

  const [actionLoading, setActionLoading] = useState(false);

  const handleAssemble = useCallback(async () => {
    setActionLoading(true);
    try {
      await assemble();
    } catch {
      // error is surfaced via hook
    } finally {
      setActionLoading(false);
    }
  }, [assemble]);

  const handleCertify = useCallback(async () => {
    setActionLoading(true);
    try {
      await certify({ certifiedBy: "current_user" });
    } catch {
      // error is surfaced via hook
    } finally {
      setActionLoading(false);
    }
  }, [certify]);

  const handleAttest = useCallback(async () => {
    setActionLoading(true);
    try {
      await attest({ attestedBy: "current_user" });
    } catch {
      // error is surfaced via hook
    } finally {
      setActionLoading(false);
    }
  }, [attest]);

  const handleExport = useCallback(async () => {
    try {
      const p = pack ?? (await fetchPack());
      downloadCloseCertificationPack(p);
    } catch {
      // error handled via hook
    }
  }, [pack, fetchPack]);

  // Auto-trigger export when copilot sends trigger_export action
  const exportTriggeredRef = useRef(false);
  useEffect(() => {
    if (drillAction?.type === "trigger_export" && !exportTriggeredRef.current) {
      exportTriggeredRef.current = true;
      handleExport();
    }
  }, [drillAction, handleExport]);

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {CERT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}

        {/* Export button */}
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={packLoading}
          >
            {packLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Export Pack
          </Button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "status" && (
        <CertificationStatusTab
          certification={certification}
          loading={certLoading}
          error={certError}
          actionLoading={actionLoading}
          onAssemble={handleAssemble}
          onCertify={handleCertify}
          onAttest={handleAttest}
        />
      )}

      {activeTab === "evidence" && (
        <TaskEvidenceTab
          evidence={evidence}
          loading={evidenceLoading}
        />
      )}

      {activeTab === "exceptions" && (
        <ExceptionRegisterTab
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />
      )}

      {activeTab === "overrides" && (
        <OverrideRegisterTab
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />
      )}

      {activeTab === "sla" && (
        <SlaComplianceTab
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Certification Status Tab
// ---------------------------------------------------------------------------

function CertificationStatusTab({
  certification,
  loading,
  error,
  actionLoading,
  onAssemble,
  onCertify,
  onAttest,
}: {
  certification: CloseCertificationDTO | null;
  loading: boolean;
  error: string | null;
  actionLoading: boolean;
  onAssemble: () => void;
  onCertify: () => void;
  onAttest: () => void;
}) {
  if (loading && !certification) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading certification status...
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

  if (!certification) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4" />
            Period Close Certification
          </CardTitle>
          <CardDescription>
            No certification pack has been assembled for this period yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onAssemble} disabled={actionLoading} size="sm">
            {actionLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Stamp className="mr-1 h-3.5 w-3.5" />
            )}
            Assemble Certification Pack
          </Button>
        </CardContent>
      </Card>
    );
  }

  const cert = certification;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4" />
          Period Close Certification
          <CertStatusBadge status={cert.status} />
          <CertTypeBadge type={cert.certType} />
        </CardTitle>
        <CardDescription>
          {cert.certCode} &middot; v{cert.certVersion}
          {cert.isCleanClose && (
            <Badge variant="outline" className="ml-2 text-green-600">
              <CheckCircle2 className="mr-0.5 h-3 w-3" /> Clean Close
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <KpiCard label="Readiness" value={cert.readinessScore != null ? `${cert.readinessScore}%` : "N/A"} />
          <KpiCard label="SLA" value={cert.slaStatus ?? "N/A"} />
          <KpiCard
            label="Tasks"
            value={`${cert.completedTasks ?? 0}/${cert.totalTasks ?? 0}`}
            sub={cert.waivedTasks ? `${cert.waivedTasks} waived` : undefined}
          />
          <KpiCard
            label="Overrides"
            value={String(cert.totalOverrides)}
            warn={cert.totalOverrides > 0}
          />
          <KpiCard
            label="Exceptions"
            value={String(cert.totalExceptions)}
            sub={cert.openExceptions > 0 ? `${cert.openExceptions} open` : undefined}
            warn={cert.openExceptions > 0}
          />
          <KpiCard
            label="Doc Health"
            value={cert.docHealthScore != null ? `${cert.docHealthScore}%` : "N/A"}
          />
        </div>

        {/* Sign-off Chain */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Sign-off Chain</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SignoffCard
              icon={<Stamp className="h-4 w-4" />}
              label="Assembled"
              person={null}
              timestamp={cert.assembledAt}
              hash={cert.contentHash}
              done={!!cert.assembledAt}
            />
            <SignoffCard
              icon={<BadgeCheck className="h-4 w-4" />}
              label="Controller"
              person={cert.certifiedBy}
              timestamp={cert.certifiedAt}
              notes={cert.controllerNotes}
              done={!!cert.certifiedAt}
            />
            <SignoffCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="CFO Attestation"
              person={cert.attestedBy}
              timestamp={cert.attestedAt}
              notes={cert.attestationNotes}
              done={!!cert.attestedAt}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2">
          {cert.status === "DRAFT" && (
            <Button onClick={onCertify} disabled={actionLoading} size="sm">
              {actionLoading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              )}
              Certify (Controller Sign-off)
            </Button>
          )}
          {cert.status === "PENDING_REVIEW" && (
            <Button onClick={onCertify} disabled={actionLoading} size="sm">
              {actionLoading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              )}
              Approve & Certify
            </Button>
          )}
          {cert.status === "CERTIFIED" && (
            <Button onClick={onAttest} disabled={actionLoading} size="sm" variant="outline">
              {actionLoading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              )}
              Add CFO Attestation
            </Button>
          )}
          {(cert.status === "SUPERSEDED" || cert.status === "REVOKED") && (
            <Badge variant="outline" className="text-muted-foreground">
              <Lock className="mr-1 h-3 w-3" />
              {cert.status === "SUPERSEDED"
                ? `Superseded${cert.supersessionReason ? `: ${cert.supersessionReason}` : ""}`
                : `Revoked${cert.revocationReason ? `: ${cert.revocationReason}` : ""}`}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Task Evidence Tab
// ---------------------------------------------------------------------------

function TaskEvidenceTab({
  evidence,
  loading,
}: {
  evidence: CloseTaskEvidenceDTO[] | null;
  loading: boolean;
}) {
  const stats = useMemo(() => {
    if (!evidence) return null;
    const total = evidence.length;
    const completed = evidence.filter((t) => t.taskStatus === "COMPLETED").length;
    const waived = evidence.filter((t) => t.taskStatus === "WAIVED").length;
    const failed = evidence.filter((t) => t.taskStatus === "FAILED").length;
    const withinSla = evidence.filter((t) => t.withinSla === true).length;
    const breachedSla = evidence.filter((t) => t.withinSla === false).length;
    return { total, completed, waived, failed, withinSla, breachedSla };
  }, [evidence]);

  if (loading && !evidence) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading task evidence...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="h-4 w-4" />
          Task Evidence Register
        </CardTitle>
        {stats && (
          <CardDescription>
            {stats.completed}/{stats.total} completed
            {stats.waived > 0 && ` \u00b7 ${stats.waived} waived`}
            {stats.failed > 0 && ` \u00b7 ${stats.failed} failed`}
            {stats.breachedSla > 0 && ` \u00b7 ${stats.breachedSla} SLA breached`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {evidence && evidence.length > 0 ? (
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Completed By</TableHead>
                  <TableHead>Completed At</TableHead>
                  <TableHead>Waiver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((t) => (
                  <TableRow key={t.taskCode}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{t.taskCode}</div>
                      <div className="text-muted-foreground">{t.taskName}</div>
                    </TableCell>
                    <TableCell className="text-xs">{t.category}</TableCell>
                    <TableCell className="text-xs">{t.requiredBefore}</TableCell>
                    <TableCell>
                      <TaskStatusBadge status={t.taskStatus} />
                    </TableCell>
                    <TableCell>
                      <SlaBadge withinSla={t.withinSla} />
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {t.hoursToComplete != null ? `${t.hoursToComplete.toFixed(1)}h` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">{t.completedBy ?? "\u2014"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.completedAt ? formatDateTime(t.completedAt) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.waiverStatus && t.waiverStatus !== "not_required" ? (
                        <span className="text-orange-600">{t.waiverStatus}</span>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-4 text-sm text-muted-foreground">
            No task evidence available for this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Exception Register Tab (uses override-posture-style lazy fetch)
// ---------------------------------------------------------------------------

function ExceptionRegisterTab({
  entityCode,
  fiscalYear,
  periodNumber,
}: {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}) {
  const { pack, loading, fetchPack } = useCloseCertificationPack(
    useMemo(() => ({ entityCode, fiscalYear, periodNumber }), [entityCode, fiscalYear, periodNumber]),
  );

  // Auto-fetch on mount
  useState(() => {
    fetchPack().catch(() => {});
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading exception register...
        </CardContent>
      </Card>
    );
  }

  const exceptions = pack?.exceptions ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Exception Register
        </CardTitle>
        <CardDescription>
          {exceptions.length === 0
            ? "No exceptions recorded for this period."
            : `${exceptions.length} exception${exceptions.length !== 1 ? "s" : ""} recorded`}
        </CardDescription>
      </CardHeader>
      {exceptions.length > 0 && (
        <CardContent>
          <div className="max-h-[350px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Raised By</TableHead>
                  <TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((e) => (
                  <TableRow key={e.exceptionId}>
                    <TableCell className="text-xs font-mono">{e.exceptionCode}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{e.title}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={e.severity} />
                    </TableCell>
                    <TableCell className="text-xs">{e.status}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {e.impactAmount ? `${e.impactAmount} ${e.impactCurrency ?? ""}` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">{e.raisedBy ?? "\u2014"}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                      {e.resolutionNotes ?? (e.resolvedAt ? "Resolved" : "Open")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Override Register Tab
// ---------------------------------------------------------------------------

function OverrideRegisterTab({
  entityCode,
  fiscalYear,
  periodNumber,
}: {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}) {
  const { pack, loading, fetchPack } = useCloseCertificationPack(
    useMemo(() => ({ entityCode, fiscalYear, periodNumber }), [entityCode, fiscalYear, periodNumber]),
  );

  useState(() => {
    fetchPack().catch(() => {});
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading override register...
        </CardContent>
      </Card>
    );
  }

  const overrides = pack?.overrides ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Override Register
        </CardTitle>
        <CardDescription>
          {overrides.length === 0 ? (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-green-500" />
              No overrides for this period \u2014 clean close posture.
            </span>
          ) : (
            `${overrides.length} override${overrides.length !== 1 ? "s" : ""} recorded`
          )}
        </CardDescription>
      </CardHeader>
      {overrides.length > 0 && (
        <CardContent>
          <div className="max-h-[350px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.overrideId}>
                    <TableCell>
                      <ScopeBadge scope={o.overrideScope} />
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {o.taskName ?? o.taskCategory ?? o.overrideScope}
                    </TableCell>
                    <TableCell className="text-xs">{o.reasonCode}</TableCell>
                    <TableCell className="text-xs">{o.status}</TableCell>
                    <TableCell>
                      {o.isActive ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {o.impactAmount ? `${o.impactAmount} ${o.impactCurrency ?? ""}` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.lastActivity
                        ? `${o.lastActivity} ${o.lastActivityAt ? formatDateTime(o.lastActivityAt) : ""}`
                        : "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SLA Compliance Tab
// ---------------------------------------------------------------------------

function SlaComplianceTab({
  entityCode,
  fiscalYear,
  periodNumber,
}: {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}) {
  const { pack, loading, fetchPack } = useCloseCertificationPack(
    useMemo(() => ({ entityCode, fiscalYear, periodNumber }), [entityCode, fiscalYear, periodNumber]),
  );

  useState(() => {
    fetchPack().catch(() => {});
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading SLA compliance...
        </CardContent>
      </Card>
    );
  }

  const sla = pack?.slaCompliance;

  if (!sla) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          No SLA data available for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          SLA Compliance Report
          <SlaStatusBadge status={sla.slaStatus} />
        </CardTitle>
        <CardDescription>
          {sla.closeType} close &middot; {sla.periodEndDate}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date comparison grid */}
        <div className="grid grid-cols-2 gap-3">
          <DateCompareCard
            label="Soft Close"
            target={sla.softCloseTarget}
            actual={sla.softCloseActual}
            met={sla.softCloseMet}
          />
          <DateCompareCard
            label="Hard Close"
            target={sla.hardCloseTarget}
            actual={sla.hardCloseActual}
            met={sla.hardCloseMet}
          />
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard label="Days Elapsed" value={`${sla.daysElapsed}d`} />
          <KpiCard
            label="Days Remaining"
            value={`${sla.daysRemaining}d`}
            warn={sla.daysRemaining <= 1}
          />
          <KpiCard
            label="Target Days"
            value={sla.targetWorkingDays != null ? `${sla.targetWorkingDays}d` : "N/A"}
          />
          <KpiCard
            label="Actual Days"
            value={sla.actualWorkingDays != null ? `${sla.actualWorkingDays}d` : "N/A"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" : ""}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SignoffCard({
  icon,
  label,
  person,
  timestamp,
  notes,
  hash,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  person: string | null;
  timestamp: string | null;
  notes?: string | null;
  hash?: string | null;
  done: boolean;
}) {
  return (
    <div className={cn(
      "rounded border p-3",
      done ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : "",
    )}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
        {done && <CheckCircle2 className="h-3 w-3 text-green-600" />}
      </div>
      {done ? (
        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
          {person && <div>By: {person}</div>}
          {timestamp && <div>At: {formatDateTime(timestamp)}</div>}
          {notes && <div className="italic">{notes}</div>}
          {hash && <div className="font-mono">SHA: {hash.slice(0, 16)}...</div>}
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-muted-foreground">Pending</div>
      )}
    </div>
  );
}

function CertStatusBadge({ status }: { status: CertificationStatusDTO }) {
  const config: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
    DRAFT: { color: "bg-gray-100 text-gray-700", Icon: FileWarning },
    PENDING_REVIEW: { color: "bg-blue-100 text-blue-700", Icon: Clock },
    CERTIFIED: { color: "bg-green-100 text-green-700", Icon: BadgeCheck },
    CFO_ATTESTED: { color: "bg-emerald-100 text-emerald-700", Icon: ShieldCheck },
    SUPERSEDED: { color: "bg-gray-100 text-gray-500", Icon: XCircle },
    REVOKED: { color: "bg-red-100 text-red-700", Icon: XCircle },
  };
  const c = config[status] ?? config.DRAFT!;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.color}`}>
      <c.Icon className="h-2.5 w-2.5" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CertTypeBadge({ type }: { type: CertificationTypeDTO }) {
  if (type === "STANDARD") return null;
  const colors: Record<string, string> = {
    WITH_EXCEPTIONS: "bg-yellow-100 text-yellow-700",
    QUALIFIED: "bg-orange-100 text-orange-700",
    INTERIM: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[type] ?? ""}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: "bg-green-100 text-green-700",
    WAIVED: "bg-yellow-100 text-yellow-700",
    FAILED: "bg-red-100 text-red-700",
    BLOCKED: "bg-orange-100 text-orange-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    PENDING: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}

function SlaBadge({ withinSla }: { withinSla: boolean | null }) {
  if (withinSla == null) return <span className="text-[10px] text-muted-foreground">\u2014</span>;
  return withinSla ? (
    <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
      <CheckCircle2 className="h-2.5 w-2.5" /> MET
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
      <XCircle className="h-2.5 w-2.5" /> BREACH
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[severity.toUpperCase()] ?? "bg-gray-100"}`}>
      {severity}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
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

function SlaStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
    ON_TRACK: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    MET: { color: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    AT_RISK: { color: "bg-yellow-100 text-yellow-700", Icon: AlertTriangle },
    BREACHED: { color: "bg-red-100 text-red-700", Icon: XCircle },
  };
  const c = config[status] ?? config.ON_TRACK!;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.color}`}>
      <c.Icon className="h-2.5 w-2.5" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DateCompareCard({
  label,
  target,
  actual,
  met,
}: {
  label: string;
  target: string;
  actual: string | null;
  met: boolean | null;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span>Target: {formatDate(target)}</span>
        {actual ? (
          <span className={met ? "text-green-600" : "text-red-600"}>
            Actual: {formatDate(actual)}
          </span>
        ) : (
          <span className="text-muted-foreground">Pending</span>
        )}
      </div>
      {met != null && (
        <div className="mt-1">
          {met ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
              <CheckCircle2 className="h-3 w-3" /> SLA Met
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
              <XCircle className="h-3 w-3" /> SLA Breached
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
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
