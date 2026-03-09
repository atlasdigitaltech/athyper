"use client";

// components/finance/admin/RemediationControlPanel.tsx
//
// Phase 8D — Remediation Control Panel
// Unified campaign management, playbook-aware preview/dry-run,
// and remediation audit export. Embeds into the Close Control Tower.

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Loader2,
  Package,
  Play,
  Shield,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useMemo, useState } from "react";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  useCampaignList,
  useRemediationPreview,
} from "@/lib/finance/use-remediation-campaigns";
import { useRemediationActions } from "@/lib/finance/use-document-health";
import { downloadRemediationAuditPackage } from "@/lib/finance/export-remediation-package";
import type {
  RemediationActionDTO,
  RemediationCampaignDTO,
  RemediationPreviewDTO,
  CampaignStatusDTO,
  CopilotDrillAction,
  PlaybookRiskLevelDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RemediationControlPanelProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Action to perform on arrival (e.g. prefill campaign draft) */
  drillAction?: CopilotDrillAction;
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function RemediationControlPanel({
  entityCode,
  fiscalYear,
  periodNumber,
  drillAction,
}: RemediationControlPanelProps) {
  const params = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  const {
    actions,
    summary,
    loading: actionsLoading,
    error: actionsError,
    refresh: refreshActions,
    approve,
    reject,
    bulkApprove,
  } = useRemediationActions(params);

  const {
    campaigns,
    loading: campaignsLoading,
    error: campaignsError,
    refresh: refreshCampaigns,
    createCampaign,
    approveCampaign,
    cancelCampaign,
  } = useCampaignList(params);

  const {
    preview,
    loading: previewLoading,
    runPreview,
  } = useRemediationPreview();

  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [tab, setTab] = useState<"actions" | "campaigns" | "preview">("actions");

  // Batch selection for campaign creation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pre-select actions from copilot drill-through
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (
      drillAction?.type === "prefill_campaign" &&
      actions &&
      actions.length > 0 &&
      !prefillAppliedRef.current
    ) {
      prefillAppliedRef.current = true;
      const validIds = new Set(
        drillAction.actionIds.filter((id) =>
          actions.some((a) => a.id === id && a.status === "SUGGESTED"),
        ),
      );
      if (validIds.size > 0) {
        setSelectedIds(validIds);
        setTab("actions");
      }
    }
  }, [drillAction, actions]);

  const suggestedActions = useMemo(
    () => actions?.filter((a) => a.status === "SUGGESTED") ?? [],
    [actions],
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePreview = useCallback(async (actionId: string) => {
    setSelectedActionId(actionId);
    setShowPreview(true);
    setTab("preview");
    await runPreview(actionId);
  }, [runPreview]);

  const handleExport = useCallback(() => {
    if (!summary || !actions) return;
    downloadRemediationAuditPackage({
      entityCode,
      fiscalYear,
      periodNumber,
      exportedAt: new Date().toISOString(),
      summary,
      actions,
      campaigns: campaigns ?? [],
      previews: preview ? [preview] : [],
    });
  }, [entityCode, fiscalYear, periodNumber, summary, actions, campaigns, preview]);

  const handleCreateCampaign = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // All selected must be same action type
    const types = new Set(
      suggestedActions
        .filter((a) => ids.includes(a.id))
        .map((a) => a.actionType),
    );
    if (types.size !== 1) {
      alert("All selected actions must be the same type to create a campaign.");
      return;
    }
    const actionType = [...types][0]!;
    await createCampaign({
      campaignName: `${actionType} Campaign — P${periodNumber} FY${fiscalYear}`,
      actionType,
      actionIds: ids,
    });
    setSelectedIds(new Set());
    refreshActions();
  }, [selectedIds, suggestedActions, createCampaign, periodNumber, fiscalYear, refreshActions]);

  const handleBulkApprove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await bulkApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, bulkApprove]);

  if (actionsLoading && !actions) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading remediation data…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Remediation Control
            </CardTitle>
            <CardDescription>
              {summary
                ? `${summary.totalActions} action(s): ${summary.suggestedCount} pending, ${summary.completedCount} completed, ${summary.failedCount} failed`
                : "No remediation data"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => { refreshActions(); refreshCampaigns(); }}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-3 flex gap-1 border-b">
          <TabButton active={tab === "actions"} onClick={() => setTab("actions")}>
            Actions {summary ? `(${summary.totalActions})` : ""}
          </TabButton>
          <TabButton active={tab === "campaigns"} onClick={() => setTab("campaigns")}>
            Campaigns {campaigns ? `(${campaigns.length})` : ""}
          </TabButton>
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            Preview
          </TabButton>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {tab === "actions" && (
          <ActionsTab
            actions={actions ?? []}
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
            onApprove={approve}
            onReject={reject}
            onPreview={handlePreview}
            onBulkApprove={handleBulkApprove}
            onCreateCampaign={handleCreateCampaign}
            error={actionsError}
          />
        )}
        {tab === "campaigns" && (
          <CampaignsTab
            campaigns={campaigns ?? []}
            loading={campaignsLoading}
            error={campaignsError}
            onApprove={approveCampaign}
            onCancel={cancelCampaign}
          />
        )}
        {tab === "preview" && (
          <PreviewTab
            preview={preview}
            loading={previewLoading}
            actionId={selectedActionId}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Actions Tab
// ---------------------------------------------------------------------------

function ActionsTab({
  actions,
  selectedIds,
  toggleSelection,
  onApprove,
  onReject,
  onPreview,
  onBulkApprove,
  onCreateCampaign,
  error,
}: {
  actions: RemediationActionDTO[];
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onPreview: (id: string) => Promise<void>;
  onBulkApprove: () => Promise<void>;
  onCreateCampaign: () => Promise<void>;
  error: string | null;
}) {
  if (error) {
    return <div className="py-4 text-sm text-destructive">{error}</div>;
  }

  if (actions.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No remediation actions for this period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded bg-muted/50 px-3 py-2 text-sm">
          <span>{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={onBulkApprove}>
            <Check className="mr-1 h-3 w-3" />
            Bulk Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onCreateCampaign}>
            <Package className="mr-1 h-3 w-3" />
            Create Campaign
          </Button>
        </div>
      )}

      <div className="max-h-[400px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Doc</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {a.status === "SUGGESTED" && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelection(a.id)}
                      className="h-3.5 w-3.5"
                    />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {a.docNo ?? a.docId?.slice(0, 8) ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {formatActionType(a.actionType)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={a.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.sourceType}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onPreview(a.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview / Dry-Run</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {a.status === "SUGGESTED" && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600"
                          onClick={() => onApprove(a.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600"
                          onClick={() => {
                            const reason = prompt("Rejection reason:");
                            if (reason) onReject(a.id, reason);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaigns Tab
// ---------------------------------------------------------------------------

function CampaignsTab({
  campaigns,
  loading,
  error,
  onApprove,
  onCancel,
}: {
  campaigns: RemediationCampaignDTO[];
  loading: boolean;
  error: string | null;
  onApprove: (id: string) => Promise<void>;
  onCancel: (id: string, reason: string) => Promise<void>;
}) {
  if (loading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading campaigns…
      </div>
    );
  }

  if (error) {
    return <div className="py-4 text-sm text-destructive">{error}</div>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No campaigns. Select actions and create a campaign from the Actions tab.
      </div>
    );
  }

  return (
    <div className="max-h-[400px] space-y-3 overflow-auto">
      {campaigns.map((c) => (
        <div
          key={c.id}
          className="rounded border p-3"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{c.campaignName}</span>
                <CampaignStatusBadge status={c.status} />
                {c.riskLevel && <RiskBadge level={c.riskLevel} />}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatActionType(c.actionType)} — {c.totalActions} action(s)
              </div>
            </div>
            <div className="flex gap-1">
              {c.status === "DRAFT" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApprove(c.id)}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const reason = prompt("Cancel reason:");
                      if (reason) onCancel(c.id, reason);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(c.status === "EXECUTING" || c.status === "COMPLETED" || c.status === "PARTIALLY_COMPLETED") && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{c.completedActions}/{c.totalActions} completed</span>
                {c.failedActions > 0 && (
                  <span className="text-destructive">{c.failedActions} failed</span>
                )}
              </div>
              <div className="h-1.5 w-full rounded bg-muted">
                <div
                  className="h-full rounded bg-green-500 transition-all"
                  style={{
                    width: `${c.totalActions > 0 ? (c.completedActions / c.totalActions) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            <span>Created by {c.createdBy}</span>
            {c.approvedBy && <span>Approved by {c.approvedBy}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview Tab
// ---------------------------------------------------------------------------

function PreviewTab({
  preview,
  loading,
  actionId,
}: {
  preview: RemediationPreviewDTO | null;
  loading: boolean;
  actionId: string | null;
}) {
  if (!actionId) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Select an action and click the preview button to see a dry-run analysis.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Running preview…
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No preview data available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge variant={preview.canExecute ? "default" : "destructive"}>
          {preview.canExecute ? "CAN EXECUTE" : "BLOCKED"}
        </Badge>
        <RiskBadge level={preview.playbook.riskLevel} />
        <span className="text-sm text-muted-foreground">
          {preview.playbook.displayName}
        </span>
      </div>

      {/* Impact summary */}
      <div className="rounded border p-3 text-sm">
        {preview.impactSummary}
      </div>

      {/* Prerequisites */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Prerequisites</h4>
        <div className="space-y-1">
          {preview.prerequisiteResults.map((pr) => (
            <div key={pr.checkCode} className="flex items-center gap-2 text-sm">
              {pr.passed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className={pr.passed ? "text-muted-foreground" : "text-destructive"}>
                {pr.description}
              </span>
              {pr.detail && (
                <span className="text-xs text-muted-foreground">({pr.detail})</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blocking reasons */}
      {preview.blockingReasons.length > 0 && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
          <h4 className="mb-1 text-sm font-medium text-destructive">Blocking Reasons</h4>
          <ul className="list-disc pl-4 text-sm text-destructive">
            {preview.blockingReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Side effects */}
      {preview.predictedSideEffects.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Predicted Side Effects</h4>
          <div className="space-y-1">
            {preview.predictedSideEffects.map((se, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <SideEffectIcon severity={se.severity} />
                <div>
                  <span>{se.description}</span>
                  {se.affectedEntities.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      [{se.affectedEntities.join(", ")}]
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Playbook steps */}
      <div>
        <h4 className="mb-2 text-sm font-medium">
          Execution Steps ({preview.playbook.steps.length})
        </h4>
        <div className="space-y-1">
          {preview.playbook.steps.map((step) => (
            <div key={step.code} className="flex items-center gap-2 text-xs">
              <span className="w-5 text-center text-muted-foreground">{step.order}</span>
              <Badge variant="outline" className="text-[10px]">
                {step.type}
              </Badge>
              <span>{step.description}</span>
              {step.reversible && (
                <Badge variant="secondary" className="text-[10px]">
                  reversible
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    LOW: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUGGESTED: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    EXECUTING: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-gray-100 text-gray-500",
    FAILED: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? ""}`}>
      {status}
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: CampaignStatusDTO }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    EXECUTING: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    PARTIALLY_COMPLETED: "bg-orange-100 text-orange-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? ""}`}>
      {status}
    </span>
  );
}

function RiskBadge({ level }: { level: PlaybookRiskLevelDTO }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-green-100 text-green-700",
  };
  const Icon = level === "CRITICAL" || level === "HIGH" ? ShieldAlert : Shield;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[level]}`}>
      <Icon className="h-2.5 w-2.5" />
      {level}
    </span>
  );
}

function SideEffectIcon({ severity }: { severity: string }) {
  if (severity === "CAUTION") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-orange-500" />;
  if (severity === "WARNING") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-yellow-500" />;
  return <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-blue-400" />;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatActionType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
