"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Fragment } from "react";
import { CheckCircle2, ChevronRight, Circle, Clock, Clock3, Eye, GitCompare, XCircle } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { WorkPanel } from "@athyper/surface-kit";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import type {
  EffectiveRecordWorkspaceManifest,
  LifecycleStep,
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeLifecycleState,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type {
  SnapshotIndexEntry,
  SnapshotGateEventKind,
  LifecycleEntry,
  LifecycleChangeType,
  AuditLogEntry,
  AuditOperation,
  ChangeReasonSeverity,
  SnapshotRestoreResponse,
} from "@athyper/api-contracts/documents";
import { SnapshotDetailDrawer } from "./snapshot-detail-drawer";
import { SnapshotCompareDrawer } from "./snapshot-compare-drawer";
import type { SnapshotChildContracts } from "./snapshot-field-rules";
import {
  useOptionalRecordWorkspaceQueryContext,
  useOptionalRecordWorkspaceSnapshots,
  useRecordWorkspaceApprovals,
  useRecordWorkspaceLifecycleTimeline,
  useRecordWorkspaceProcessState,
  useRecordWorkspaceSnapshotChildContracts,
  useRecordWorkspaceSnapshotEventInvalidation,
} from "../record-query";

export type RuntimeProcessSurfaceId = "approvals" | "versions" | "lifecycle" | "audit";

/**
 * Map a chrome tab id to the RuntimeProcessSurface variant it should mount.
 * Returns null for surface-section tab ids (fields/lines/etc.) so callers
 * can fall through to their normal section rendering path.
 *
 * `process`/`workflow` are URL-backward-compat aliases for the canonical
 * `approvals` id, while Lifecycle remains an independent surface.
 */
export function resolveProcessSurfaceId(
  value: string | undefined,
): RuntimeProcessSurfaceId | null {
  if (value === "process" || value === "workflow" || value === "approvals") return "approvals";
  if (value === "versions")  return "versions";
  if (value === "lifecycle") return "lifecycle";
  if (value === "audit")     return "audit";
  return null;
}

/** Cheap predicate for tab-list filtering. */
export function isProcessTabId(value: string | undefined): boolean {
  return resolveProcessSurfaceId(value) !== null;
}

/**
 * Effective-manifest gate shared by chrome filtering, click handling and the
 * surface itself. Resource-backed tabs require their authorized resource;
 * Audit is surface-backed because it has no RecordWorkspace resource yet.
 */
export function isRecordWorkspaceProcessSurfaceSupported(
  manifest: EffectiveRecordWorkspaceManifest,
  surface: RuntimeProcessSurfaceId,
): boolean {
  if (surface === "approvals") {
    return manifest.resources.some((resource) => resource.key === "approvals");
  }
  if (surface === "lifecycle") {
    return manifest.resources.some((resource) => resource.key === "lifecycleTimeline");
  }
  if (surface === "versions") {
    return manifest.resources.some((resource) => resource.key === "snapshots");
  }
  return manifest.surfaces.some((candidate) => candidate.kind === "audit_trail");
}

interface RuntimeProcessSurfaceProps {
  activeSurface: RuntimeProcessSurfaceId;
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
  /**
   * Per-section child descriptors for descriptor-aware rendering inside the
   * snapshot Versions and Compare drawers. The host prefetches these on the
   * server when the parent has the relevant has_many relations. Absent /
   * empty → drawers fall back to raw column names for non-header sections.
   */
  snapshotChildContracts?: SnapshotChildContracts;
}

interface WorkflowStageItem {
  id?: string;
  name?: string;
  status?: string;
  outcome?: string | null;
  stage_no?: number;
  started_at?: string | null;
  completed_at?: string | null;
  sla_target_hours?: number;
  sla_deadline?: string;
  sla_status?: string;
}

interface WorkflowRequestItem {
  id?: string;
  workflow_type?: string;
  status?: string;
  decision?: string | null;
  requested_at?: string;
  requested_by?: string;
  stages?: WorkflowStageItem[];
  metadata?: Record<string, unknown>;
}

interface ApprovalItem {
  id?: string;
  task_type?: string;
  workflow_request_id?: string;
  workflow_stage_id?: string;
  order_index?: number;
  assignee_id?: string | null;
  designated_id?: string | null;
  assignee_display_name?: string | null;
  assignee_given_name?: string | null;
  assignee_family_name?: string | null;
  status?: string;
  decision?: string | null;
  reason?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  due_at?: string | null;
  metadata?: Record<string, unknown>;
}

interface VersionItem {
  version?: number | string;
  label?: string;
  status?: string;
  actor?: string;
  at?: string;
}

type ProcessStateExtras = ProcessRuntimeState & {
  workflowRequests?: WorkflowRequestItem[];
  approvals?: {
    items?: ApprovalItem[];
    pendingCount?: number;
    completedCount?: number;
    myPendingCount?: number;
    myActions?: string[];
  };
  versions?: {
    items?: VersionItem[];
    count?: number;
    currentVersion?: string | number;
    publishedAt?: string;
    changedBy?: string;
  };
};

function readCanonicalProcessState(value: unknown): ProcessRuntimeState | undefined {
  if (!isRecord(value)) return undefined;
  const nested = value["processState"];
  if (isRecord(nested)) return nested as ProcessRuntimeState;
  if ("lifecycle" in value || "workflow" in value) return value as ProcessRuntimeState;
  return undefined;
}

function readCanonicalCollection<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!isRecord(value)) return [];
  return Array.isArray(value["data"]) ? value["data"] as T[] : [];
}

export function RuntimeProcessSurface({
  activeSurface,
  contract,
  record,
  recordId,
  processState,
  snapshotChildContracts,
}: RuntimeProcessSurfaceProps) {
  const workspace = useOptionalRecordWorkspaceQueryContext();
  if (
    workspace
    && !isRecordWorkspaceProcessSurfaceSupported(workspace.manifest, activeSurface)
  ) return null;

  if (workspace) {
    return (
      <CanonicalRuntimeProcessSurface
        activeSurface={activeSurface}
        contract={contract}
        record={record}
        recordId={recordId}
        processState={processState}
        snapshotChildContracts={snapshotChildContracts}
      />
    );
  }

  return (
    <RuntimeProcessSurfaceContent
      activeSurface={activeSurface}
      contract={contract}
      record={record}
      recordId={recordId}
      processState={processState}
      snapshotChildContracts={snapshotChildContracts}
    />
  );
}

const PROCESS_SUMMARY_STALE_TIME = Number.POSITIVE_INFINITY;

function CanonicalRuntimeProcessSurface(props: RuntimeProcessSurfaceProps) {
  const needsProcessSummary = props.activeSurface === "approvals" || props.activeSurface === "lifecycle";
  const processQuery = useRecordWorkspaceProcessState<unknown>({
    enabled: needsProcessSummary,
    staleTime: PROCESS_SUMMARY_STALE_TIME,
  });
  const approvalsQuery = useRecordWorkspaceApprovals<unknown>({
    enabled: props.activeSurface === "approvals",
  });
  const lifecycleQuery = useRecordWorkspaceLifecycleTimeline<unknown>({
    enabled: props.activeSurface === "lifecycle",
  });
  const snapshotChildContractsQuery = useRecordWorkspaceSnapshotChildContracts<unknown>({
    enabled: props.activeSurface === "versions",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const canonicalProcessState = readCanonicalProcessState(processQuery.data) ?? props.processState;
  const canonicalApprovalItems = approvalsQuery.data === undefined
    ? undefined
    : readCanonicalCollection<ApprovalItem>(approvalsQuery.data);
  const canonicalLifecycleEntries = lifecycleQuery.data === undefined
    ? []
    : readCanonicalCollection<LifecycleEntry>(lifecycleQuery.data);

  return (
    <RuntimeProcessSurfaceContent
      {...props}
      processState={canonicalProcessState ?? undefined}
      approvalItems={canonicalApprovalItems}
      approvalsLoading={approvalsQuery.isPending}
      approvalsError={approvalsQuery.error?.message ?? null}
      lifecycleTimeline={{
        loading: lifecycleQuery.isPending,
        error: lifecycleQuery.error?.message ?? null,
        entries: canonicalLifecycleEntries,
      }}
      snapshotChildContracts={
        readSnapshotChildContracts(snapshotChildContractsQuery.data)
        ?? props.snapshotChildContracts
      }
    />
  );
}

function readSnapshotChildContracts(value: unknown): SnapshotChildContracts | undefined {
  if (!isRecord(value)) return undefined;
  const data = value["data"];
  return isRecord(data) ? data as SnapshotChildContracts : undefined;
}

interface RuntimeProcessSurfaceContentProps extends RuntimeProcessSurfaceProps {
  approvalItems?: ApprovalItem[];
  approvalsLoading?: boolean;
  approvalsError?: string | null;
  lifecycleTimeline?: LifecycleTimelineState;
}

function RuntimeProcessSurfaceContent({
  activeSurface,
  contract,
  record,
  recordId,
  processState,
  snapshotChildContracts,
  approvalItems,
  approvalsLoading = false,
  approvalsError = null,
  lifecycleTimeline,
}: RuntimeProcessSurfaceContentProps) {
  const metadata = readRuntimePresentation(record);
  const extras = processState as ProcessStateExtras | undefined;

  if (activeSurface === "approvals") {
    return (
      <ApprovalPanel
        contract={contract}
        record={record}
        recordId={recordId}
        processState={extras}
        metadata={metadata}
        approvalItems={approvalItems}
        approvalsLoading={approvalsLoading}
        approvalsError={approvalsError}
      />
    );
  }

  if (activeSurface === "lifecycle") {
    return (
      <LifecyclePanel
        contract={contract}
        record={record}
        recordId={recordId}
        processState={extras}
        timeline={lifecycleTimeline}
      />
    );
  }

  if (activeSurface === "audit") {
    return (
      <AuditPanel
        contract={contract}
        recordId={recordId}
      />
    );
  }

  return (
    <VersionsPanel
      contract={contract}
      recordId={recordId}
      childContracts={snapshotChildContracts}
    />
  );
}

function ApprovalPanel({
  contract,
  record,
  processState,
  metadata,
  approvalItems: canonicalApprovalItems,
  approvalsLoading,
  approvalsError,
}: {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessStateExtras;
  metadata: RuntimePresentation;
  approvalItems?: ApprovalItem[];
  approvalsLoading: boolean;
  approvalsError: string | null;
}) {
  const workflow = processState?.workflow;
  const request = selectWorkflowRequest(processState?.workflowRequests);
  const stageNames = resolveStageNames(contract, request, workflow?.currentStage, metadata);
  const metadataWorkflow = objectAt(metadata.processState, "workflow");
  const metadataLifecycle = objectAt(metadata.processState, "lifecycle");
  const firstStage = stageNames[0] ?? null;
  const currentStage = workflow?.currentStage
    ?? activeStageName(request)
    ?? textAt(metadata.workflow, "currentStage")
    ?? firstStage;
  const lifecycleState = processState?.lifecycle?.currentState
    ?? textAt(metadataLifecycle, "currentState")
    ?? readRecordText(record, ["status", "lifecycle_state", "state"])
    ?? null;

  // Lifecycle steps — split main flow vs exit states
  const lifecycleExt = processState?.lifecycle as (ProcessRuntimeLifecycleState & { terminalStates?: string[] }) | undefined;
  const rawSteps: LifecycleStep[] = lifecycleExt?.steps?.length
    ? lifecycleExt.steps
    : deriveLifecycleSteps(contract.lifecycle?.states ?? [], lifecycleState);
  const terminalCodes = new Set((lifecycleExt?.terminalStates ?? []).map(normalizeCode));
  const flowSteps = terminalCodes.size > 0
    ? rawSteps.filter((s) => !terminalCodes.has(normalizeCode(s.state)))
    : rawSteps;
  const exitStates = lifecycleExt?.terminalStates ?? [];
  // Detect if the record is currently in a terminal/exit state
  const isTerminal = lifecycleExt?.terminal === true
    || (!!lifecycleState && terminalCodes.has(normalizeCode(lifecycleState)));
  const activeExitState = isTerminal ? lifecycleState : null;
  // Approval items (merged from former Approvals tab)
  const approvalItems = canonicalApprovalItems ?? processState?.approvals?.items ?? [];
  const myPendingCount = processState?.approvals?.myPendingCount ?? processState?.workflow?.pendingTasks ?? 0;
  const headline = textAt(metadata.approvals, "headline")
    ?? (myPendingCount > 0 ? "Your approval is requested" : null);
  const subtext = formatApprovalAssignment(metadata, myPendingCount);
  const actions = stringArrayAt(metadata.approvals, "actions")
    .concat(processState?.approvals?.myActions ?? [])
    .filter(uniqueByCode);

  // Section visibility
  // Lifecycle content is owned by the Lifecycle tab. Keep this flag false so
  // legacy `process`/`workflow` URLs cannot duplicate the journey in Approvals.
  const hasLifecycle = false;
  const hasWorkflow = contract.workflow?.enabled === true
    || canonicalApprovalItems !== undefined
    || approvalsLoading
    || approvalsError !== null
    || approvalItems.length > 0
    || stageNames.length > 0;

  // Workflow gate notice:
  //  • non-terminal: "Pending Approval → Approved — requires workflow approval" (forward gate)
  //  • terminal:     "To reopen: Rejected → Draft" (re-entry path, no "requires" text)
  const allowedTransitions = processState?.lifecycle?.allowedTransitions ?? [];
  // For the forward gate, skip exit/terminal states so we show the flow continuation
  // (e.g. "→ Approved") not an exit branch (e.g. "→ Rejected").
  const forwardTransition = allowedTransitions.find((t) => !terminalCodes.has(normalizeCode(t)));
  const reopenTransition  = isTerminal ? (allowedTransitions[0] ?? null) : null;
  const nextState = isTerminal
    ? reopenTransition
    : forwardTransition ?? flowSteps.find((s) => s.status === "future")?.state ?? null;
  const gatedTransition = lifecycleState && nextState
    ? { from: lifecycleState, to: nextState, isReopen: isTerminal }
    : null;

  return (
    <WorkPanel title="Approvals">
      <div className="flex flex-col gap-6">

        {/* ── 1. Where it is — lifecycle journey ── */}
        {hasLifecycle && (
          <div className="space-y-3">
            <SectionLabel>Timeline</SectionLabel>
            <InlineLifecycleStepper steps={flowSteps} />
            {exitStates.length > 0 && (
              <ExitStateChips states={exitStates} activeState={activeExitState} />
            )}
            {/* Exit outcome card — who exited, when, from which stage, remarks */}
            {activeExitState && (
              <ExitOutcomeCard
                state={activeExitState}
                transitions={lifecycleExt?.transitions ?? []}
              />
            )}
          </div>
        )}

        {/* ── 2. What needs to happen next — workflow + approvals ── */}
        {hasWorkflow && (
          <>
            {hasLifecycle && <div className="h-px bg-border" />}
            <div className="space-y-4">
              <SectionLabel>
                {myPendingCount > 0 ? "Needs your attention" : "Approval flow"}
              </SectionLabel>

              {/* Gate / reopen notice */}
              {gatedTransition && (
                <WorkflowGateNotice
                  from={gatedTransition.from}
                  to={gatedTransition.to}
                  isReopen={gatedTransition.isReopen}
                />
              )}

              {/* Horizontal flow diagram */}
              {approvalItems.length > 0 ? (
                <ApprovalFlowStepper items={approvalItems} />
              ) : stageNames.length > 0 ? (
                <StageTracker stages={stageNames} currentStage={currentStage} />
              ) : null}

              {/* Action banner for the current user */}
              {headline && (
                <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{headline}</p>
                    {subtext && (
                      <p className="mt-1 text-sm text-muted-foreground">{subtext}</p>
                    )}
                  </div>
                  {actions.length > 0 && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button
                          key={action}
                          variant={normalizeCode(action) === "approve" ? "primary" : "outline"}
                          size="sm"
                        >
                          {action}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Per-person approval task list */}
              {approvalItems.length > 0 ? (
                <div className="grid gap-2">
                  {approvalItems.map((item) => (
                    <ApprovalTaskCard
                      key={item.id ?? `${item.workflow_request_id}:${item.order_index}`}
                      item={item}
                    />
                  ))}
                </div>
              ) : approvalsLoading ? (
                <EmptyProcessState
                  title="Loading approvals…"
                  detail="Reading the approval tasks for this record."
                />
              ) : approvalsError ? (
                <EmptyProcessState
                  title="Couldn't load approvals"
                  detail={approvalsError}
                />
              ) : !stageNames.length ? (
                <EmptyProcessState
                  title="No approval tasks"
                  detail="There are no approval tasks for this record yet."
                />
              ) : null}
            </div>
          </>
        )}

        {!hasLifecycle && !hasWorkflow && (
          <EmptyProcessState
            title="No approval workflow configured"
            detail="This record has no approval stages or approval tasks."
          />
        )}

      </div>
    </WorkPanel>
  );
}

// ── Inline lifecycle stepper ──────────────────────────────────────────────────

function InlineLifecycleStepper({ steps }: { steps: LifecycleStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex min-w-fit items-start">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          return (
            <Fragment key={`${step.state}:${idx}`}>
              <div className="flex min-w-[80px] max-w-[120px] flex-col items-center px-1">
                <LifecycleStepDot status={step.status} />
                <p className={cn(
                  "mt-2 text-center text-xs font-semibold capitalize leading-tight",
                  step.status === "future" ? "text-muted-foreground/60" : "text-foreground",
                )}>
                  {(step.label ?? step.state).replace(/_/g, " ")}
                </p>
                {step.enteredAt ? (
                  <p className="mt-0.5 text-center text-xs text-muted-foreground">
                    {formatDate(step.enteredAt)}
                  </p>
                ) : <p className="mt-0.5 text-center text-xs text-muted-foreground">—</p>}
                {step.status === "current" && step.enteredAt ? (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{fmtElapsed(step.enteredAt)}</span>
                  </div>
                ) : null}
              </div>
              {!isLast ? (
                <div className="mt-[5px] flex min-w-4 flex-1 items-center">
                  <div className={cn(
                    "h-px w-full",
                    step.status === "completed"
                      ? "bg-foreground/25"
                      : "border-t border-dashed border-border/60",
                  )} />
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function LifecycleStepDot({ status }: { status: LifecycleStep["status"] }) {
  if (status === "completed") {
    return <div className="h-3 w-3 shrink-0 rounded-full bg-foreground" />;
  }
  if (status === "current") {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background">
        <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
      </div>
    );
  }
  return <div className="h-3 w-3 shrink-0 rounded-full border border-border bg-background" />;
}

// ── Section chrome ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function ExitStateChips({
  states,
  activeState,
}: {
  states: string[];
  activeState?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground/60">Exit states</span>
      {states.map((state) => {
        const isActive = activeState && sameCode(state, activeState);
        const intent: SemanticIntent =
          isActive && normalizeCode(state).includes("reject") ? "error" :
          isActive && (normalizeCode(state).includes("cancel") || normalizeCode(state).includes("revers")) ? "warning" :
          isActive ? "neutral" : "neutral";
        const cls = isActive
          ? cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", resolveSemanticColors(intent).subtleBadge)
          : "rounded-full border border-dashed border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground";
        return (
          <span key={state} className={cls}>
            {isActive && <span className="mr-1">●</span>}
            {titleLabel(state)}
          </span>
        );
      })}
    </div>
  );
}

function WorkflowGateNotice({
  from,
  to,
  isReopen,
}: {
  from: string;
  to: string;
  isReopen?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-sm">
      {isReopen && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">To reopen:</span>
      )}
      <span className="font-medium text-foreground">{titleLabel(from)}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      <span className="font-medium text-foreground">{titleLabel(to)}</span>
      {!isReopen && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">— requires workflow approval</span>
      )}
    </div>
  );
}

function ExitOutcomeCard({
  state,
  transitions,
}: {
  state: string;
  transitions: import("@athyper/runtime-contracts").LifecycleTransition[];
}) {
  const code = normalizeCode(state);
  const isNegative = code.includes("reject") || code.includes("cancel");
  const isWarning   = code.includes("revers") || code.includes("hold");
  const intent: SemanticIntent = isNegative ? "error" : isWarning ? "warning" : "neutral";
  const { subtleBadge } = resolveSemanticColors(intent);

  // Last transition INTO this exit state
  const exitEntry = [...transitions].reverse().find((t) => sameCode(t.toStatus, state));
  const fromState = exitEntry?.fromStatus ?? null;
  const actor     = exitEntry?.actorName ?? null;
  const at        = exitEntry?.transitionedAt ?? null;
  const remarks   = exitEntry?.remarks ?? null;

  const Icon = isNegative ? XCircle : isWarning ? Clock : CheckCircle2;

  return (
    <div className={cn("rounded-lg border px-4 py-3", subtleBadge)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-semibold">{titleLabel(state)}</p>
            {fromState && (
              <span className="text-xs text-muted-foreground">
                from {titleLabel(fromState)}
              </span>
            )}
          </div>
          {remarks && (
            <p className="mt-1 text-sm">{remarks}</p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {actor && <p className="font-medium">{actor}</p>}
          {at && <p>{formatDate(at)}</p>}
        </div>
      </div>
    </div>
  );
}

function deriveLifecycleSteps(states: string[], currentState: string | null): LifecycleStep[] {
  const cur = normalizeCode(currentState ?? "");
  const currentIdx = cur ? states.findIndex((s) => normalizeCode(s) === cur) : -1;
  return states.map((state, idx): LifecycleStep => ({
    state,
    status: currentIdx < 0
      ? "future"
      : idx < currentIdx ? "completed" : idx === currentIdx ? "current" : "future",
    enteredAt: null,
  }));
}

function fmtElapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  if (ms < 0) return "0m";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}


/**
 * VersionsPanel — graph-checkpoint timeline for a document record.
 *
 * Data source: GET /api/runtime/v1/entities/:entity/:id/snapshots, backed by
 * snapshot.document_snapshot (hash-chained, append-only). Each row is a full
 * graph snapshot taken at a lifecycle gate event (authoring_lock, commitment,
 * financial_post, amendment_baseline, reversal, etc.).
 *
 * This is the "Versions tab" surface — distinct from the Lifecycle tab
 * (state-transition timeline from log.entity_lifecycle_log), which lands in
 * its own phase. Compare / Restore / View-Snapshot CTAs are placeholders
 * until the per-id detail endpoint + diff view land.
 */
function VersionsPanel({
  contract,
  recordId,
  childContracts,
}: {
  contract:        MetaEntityRuntimeDescriptor;
  recordId:        string;
  childContracts?: SnapshotChildContracts;
}) {
  // Restore and record-event invalidation refresh this canonical cache entry.
  const snapshotQuery = useOptionalRecordWorkspaceSnapshots<unknown>();
  useRecordWorkspaceSnapshotEventInvalidation();
  const snapshots = readCanonicalCollection<SnapshotIndexEntry>(snapshotQuery.data);
  const loading = snapshotQuery.fetchStatus === "fetching" && snapshotQuery.data === undefined;
  const error = snapshotQuery.error?.message ?? null;

  // Most recent snapshot is row 0 (server orders by chain_seq DESC).
  const current = snapshots[0] ?? null;

  // Detail drawer state — null id = closed. Opening sets the id; closing
  // sets `open=false` but keeps the id so the close animation isn't jarring.
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Compare mode — toggle that switches snapshot rows from "click to view"
  // to "click to select" (max 2). Picked ids feed the Compare drawer.
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Inline restore-success notice — fired by the detail drawer after a
  // 200 from the restore endpoint. Auto-clears after 8s so it doesn't
  // linger when the user moves on.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  function handleRestoreSuccess(result: SnapshotRestoreResponse) {
    const counts  = result.counts;
    const summary = [
      counts.lines.inserted > 0         && `${counts.lines.inserted} line${counts.lines.inserted === 1 ? "" : "s"}`,
      counts.components.inserted > 0    && `${counts.components.inserted} pricing row${counts.components.inserted === 1 ? "" : "s"}`,
      counts.distributions.inserted > 0 && `${counts.distributions.inserted} distribution${counts.distributions.inserted === 1 ? "" : "s"}`,
      counts.schedules.inserted > 0     && `${counts.schedules.inserted} schedule row${counts.schedules.inserted === 1 ? "" : "s"}`,
    ].filter((s): s is string => Boolean(s)).join(", ");
    setRestoreNotice(
      `Restored snapshot #${result.snapshot_chain_seq}. ${counts.header_fields_updated} header fields, ${summary || "no child rows"} replayed. Live record data has been refreshed.`,
    );
    if (typeof window !== "undefined") {
      window.setTimeout(() => setRestoreNotice(null), 12_000);
    }
  }

  function openDetail(snapshotId: string) {
    setViewingSnapshotId(snapshotId);
    setDrawerOpen(true);
  }

  function toggleSelection(snapshotId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(snapshotId)) {
        return prev.filter((id) => id !== snapshotId);
      }
      // Cap at 2 — popping the oldest selection keeps the most recent
      // user intent as the active comparison set.
      if (prev.length >= 2) {
        return [prev[1]!, snapshotId];
      }
      return [...prev, snapshotId];
    });
  }

  function handleDrawerOpenChange(next: boolean) {
    setDrawerOpen(next);
  }

  function handleCompareModeToggle() {
    setCompareMode((prev) => {
      // Leaving compare mode clears the selection so re-entering starts
      // fresh — avoids the user wondering why old picks are highlighted.
      if (prev) setSelectedIds([]);
      return !prev;
    });
  }

  function handleCompareOpen() {
    if (selectedIds.length === 2) setCompareOpen(true);
  }

  const [leftId, rightId] = selectedIds.length === 2
    ? [selectedIds[0]!, selectedIds[1]!]
    : [null, null];

  return (
    <WorkPanel title="Versions">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <ProcessFact
            label="Latest snapshot"
            value={current ? `#${current.chain_seq} · ${gateEventKindLabel(current.gate_event_kind, current.gate_event)}` : "—"}
          />
          <ProcessFact
            label="Captured at"
            value={current ? formatDateTime(current.captured_at) : "Not captured yet"}
          />
          <ProcessFact
            label="Captured by"
            value={current?.captured_by_name ?? (current ? "System" : "—")}
          />
        </div>

        {/* Restore success notice — auto-clears after 12s. Surfaces here
            rather than as a toast so the success message stays attached to
            the surface that triggered it. */}
        {restoreNotice && (
          <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
            {restoreNotice}
          </div>
        )}

        {/* Compare-mode toolbar — only when toggled on. Shows count + CTA. */}
        {compareMode && (
          <div className="flex items-center justify-between rounded-md border border-dashed border-foreground/40 bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {selectedIds.length === 0 && "Pick two snapshots to compare."}
              {selectedIds.length === 1 && "One snapshot selected — pick one more."}
              {selectedIds.length === 2 && "Two snapshots selected · server emits older → newer."}
            </span>
            <button
              type="button"
              onClick={handleCompareOpen}
              disabled={selectedIds.length !== 2}
              className={cn(
                "inline-flex h-7 items-center rounded-md bg-foreground px-3 text-[11px] font-medium text-background",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            >
              Compare selected
            </button>
          </div>
        )}

        {loading ? (
          <EmptyProcessState title="Loading snapshots…" detail="Reading the document's checkpoint chain." />
        ) : error ? (
          <EmptyProcessState
            title="Couldn't load snapshots"
            detail={error}
          />
        ) : snapshots.length > 0 ? (
          <div className="grid gap-2">
            {snapshots.map((snapshot) => {
              const selected = selectedIds.includes(snapshot.id);
              return (
                <SnapshotRow
                  key={snapshot.id}
                  snapshot={snapshot}
                  isCurrent={snapshot.id === current?.id}
                  selected={compareMode && selected}
                  onView={
                    compareMode
                      ? () => toggleSelection(snapshot.id)
                      : () => openDetail(snapshot.id)
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyProcessState
            title="No snapshots yet"
            detail="Snapshots are captured automatically at lifecycle gates (submit, approve, post, reverse, amend, cancel)."
          />
        )}

        <div className="flex flex-wrap gap-2">
          <ProcessCommand
            icon={<GitCompare className="h-3.5 w-3.5" />}
            label={compareMode ? "Exit compare" : "Compare"}
            disabled={snapshots.length < 2}
            onClick={handleCompareModeToggle}
          />
          <ProcessCommand
            icon={<Eye className="h-3.5 w-3.5" />}
            label="View Snapshot"
            disabled={!current || compareMode}
            onClick={() => current && openDetail(current.id)}
          />
        </div>
        {/* Restore is intentionally surfaced per-snapshot inside the detail
            drawer, not as a footer-level action. Forcing the user to view a
            snapshot before restoring keeps the destructive op behind a
            "see what you're about to do" gate. */}
      </div>

      <SnapshotDetailDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        entityCode={contract.entityCode}
        recordId={recordId}
        snapshotId={viewingSnapshotId}
        onRestoreSuccess={handleRestoreSuccess}
        contract={contract}
        childContracts={childContracts}
      />

      <SnapshotCompareDrawer
        open={compareOpen}
        onOpenChange={setCompareOpen}
        entityCode={contract.entityCode}
        recordId={recordId}
        leftSnapshotId={leftId}
        rightSnapshotId={rightId}
        contract={contract}
        childContracts={childContracts}
      />
    </WorkPanel>
  );
}

// ─── Snapshot data hook ─────────────────────────────────────────────────────

/**
 * Fetches the snapshot index for a record. Plain GET — no CSRF needed.
 * Abort-safe: cancels in-flight fetch when entityCode/recordId change or the
 * panel unmounts.
 */
// ─── Snapshot row + chip ────────────────────────────────────────────────────

/**
 * Maps the sealed gate_event_kind taxonomy to (label, intent) for chip
 * rendering. Intents map to the existing resolveSemanticColors palette so
 * the chip blends with other status surfaces (no new colour tokens).
 *
 * `gateEvent` is consulted only for the cross-kind special case 'restore'
 * (Phase 14 post-restore capture, gate_event_kind='authoring_lock'). That
 * lets operators tell a restored baseline apart from a normal submit at a
 * glance without expanding the sealed kind taxonomy.
 */
function gateEventKindMeta(
  kind:       SnapshotGateEventKind,
  gateEvent?: string | null,
): { label: string; intent: SemanticIntent } {
  if (gateEvent === "restore") return { label: "Restored", intent: "warning" };
  switch (kind) {
    case "authoring_lock":     return { label: "Submitted",        intent: "info"    };
    case "commitment":         return { label: "Approved",         intent: "info"    };
    case "fulfillment":        return { label: "Fulfilled",        intent: "success" };
    case "financial_post":     return { label: "Posted",           intent: "success" };
    case "match_decision":     return { label: "Matched",          intent: "info"    };
    case "amendment_baseline": return { label: "Amendment baseline", intent: "warning" };
    case "reversal":           return { label: "Reversed",         intent: "error"   };
    default:                   return { label: kind,               intent: "muted"   };
  }
}

function gateEventKindLabel(
  kind:       SnapshotGateEventKind,
  gateEvent?: string | null,
): string {
  return gateEventKindMeta(kind, gateEvent).label;
}

function SnapshotRow({
  snapshot,
  isCurrent,
  selected = false,
  onView,
}: {
  snapshot:  SnapshotIndexEntry;
  isCurrent: boolean;
  /** When true, render selected-style chrome (compare mode picked this row). */
  selected?: boolean;
  onView?:   () => void;
}) {
  const meta   = gateEventKindMeta(snapshot.gate_event_kind, snapshot.gate_event);
  const colors = resolveSemanticColors(meta.intent);
  // Show a short prefix of the SHA-256 so users can correlate with the
  // hash printed in audit exports / verify-chain reports.
  const hashPrefix = snapshot.payload_hash.slice(0, 12);

  return (
    <button
      type="button"
      onClick={onView}
      disabled={!onView}
      className={cn(
        "grid gap-2 rounded-md border bg-background p-3 text-left md:grid-cols-[auto_1fr_auto]",
        "transition-colors",
        onView && "hover:border-foreground/40 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        !onView && "cursor-default",
        isCurrent && "border-foreground/50",
        selected && "border-foreground ring-2 ring-foreground/30 bg-muted/50",
      )}>
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <span className="text-xs tabular-nums text-muted-foreground">
          #{snapshot.chain_seq}
        </span>
        <span className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          colors.subtleBadge,
        )}>
          {meta.label}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {snapshot.gate_event}
          {isCurrent && (
            <span className="ml-2 text-[11px] font-medium text-muted-foreground">· current</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground" title={snapshot.payload_hash}>
          {hashPrefix}…
        </p>
      </div>
      <div className="text-left text-sm text-muted-foreground md:text-right">
        {snapshot.captured_by_name ? <p>{snapshot.captured_by_name}</p> : null}
        <p>{formatDateTime(snapshot.captured_at)}</p>
      </div>
    </button>
  );
}

// ─── Lifecycle panel + timeline ─────────────────────────────────────────────

/**
 * LifecyclePanel — state-transition timeline for a document record.
 *
 * Data source: GET /api/runtime/v1/entities/:entity/:id/versions, backed by
 * log.entity_lifecycle_log. Each row is one state-machine transition
 * (status changed from X to Y, who actioned, why).
 *
 * Distinct from VersionsPanel:
 *   - VersionsPanel reads snapshot.document_snapshot (graph checkpoints)
 *   - LifecyclePanel reads log.entity_lifecycle_log (state transitions)
 *
 * Together they answer two different questions: "what did the document look
 * like at this gate?" (Versions) and "how did it move through the lifecycle?"
 * (Lifecycle). Auditor's recommended Phase-3 UI split.
 */
interface LifecycleTimelineState {
  loading: boolean;
  error: string | null;
  entries: LifecycleEntry[];
}

function LifecyclePanel({
  contract,
  record,
  processState,
  timeline,
}: {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessStateExtras;
  timeline?: LifecycleTimelineState;
}) {
  const { loading, error, entries } = timeline ?? {
    loading: false,
    error: null,
    entries: [],
  };

  // The endpoint returns rows oldest-first (ORDER BY created_at ASC). We
  // reverse here for top-down "newest first" display, matching the
  // Versions panel ordering convention.
  const ordered = [...entries].reverse();
  const current = ordered.find((e) => e.is_current) ?? ordered[0] ?? null;
  const lifecycle = processState?.lifecycle as (ProcessRuntimeLifecycleState & { terminalStates?: string[] }) | undefined;
  const currentState = lifecycle?.currentState
    ?? readRecordText(record, ["status", "lifecycle_state", "state"])
    ?? null;
  const terminalStates = lifecycle?.terminalStates ?? contract.lifecycle?.terminalStates ?? [];
  const terminalCodes = new Set(terminalStates.map(normalizeCode));
  const allSteps: LifecycleStep[] = lifecycle?.steps?.length
    ? lifecycle.steps
    : deriveLifecycleSteps(contract.lifecycle?.states ?? [], currentState);
  const lifecycleFlowSteps = allSteps.filter((step) => !terminalCodes.has(normalizeCode(step.state)));
  const lastTransition = lifecycle?.transitions?.at(-1);

  return (
    <WorkPanel title="Lifecycle">
      <div className="flex flex-col gap-5">
        {lifecycleFlowSteps.length > 0 ? (
          <div className="space-y-3">
            <SectionLabel>Timeline</SectionLabel>
            <InlineLifecycleStepper steps={lifecycleFlowSteps} />
            {terminalStates.length > 0 ? (
              <ExitStateChips
                states={terminalStates}
                activeState={lifecycle?.terminal ? currentState : null}
              />
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <ProcessFact
            label="Current status"
            value={currentState ? titleLabel(currentState) : current ? titleLabel(current.record_status) : "—"}
          />
          <ProcessFact
            label="Last transition"
            value={lastTransition?.transitionedAt
              ? formatDateTime(lastTransition.transitionedAt)
              : current ? formatDateTime(current.created_at) : "—"}
          />
          <ProcessFact
            label="Last actor"
            value={lastTransition?.actorName ?? current?.created_by_name ?? (current || lastTransition ? "System" : "—")}
          />
        </div>

        {loading ? (
          <EmptyProcessState title="Loading lifecycle…" detail="Reading the document's state-transition timeline." />
        ) : error ? (
          <EmptyProcessState
            title="Couldn't load lifecycle"
            detail={error}
          />
        ) : ordered.length > 0 ? (
          <div className="grid gap-2">
            {ordered.map((entry, idx) => {
              // Prior entry in display order is at idx+1 (we reversed).
              const priorStatus = ordered[idx + 1]?.record_status ?? null;
              return (
                <LifecycleRow
                  key={`${entry.version_no}:${entry.created_at}`}
                  entry={entry}
                  priorStatus={priorStatus}
                />
              );
            })}
          </div>
        ) : (
          <EmptyProcessState
            title="No recorded transitions yet"
            detail={currentState
              ? `The current status is ${titleLabel(currentState)}. Transition history will appear here when lifecycle events are recorded.`
              : "State transitions appear here as the document moves through its lifecycle (submit, approve, post, reverse, amend, cancel)."}
          />
        )}
      </div>
    </WorkPanel>
  );
}

/**
 * Maps change_type to (label, intent) for the chip. Intents reuse the
 * existing semantic palette so the chip matches the rest of the chrome.
 */
function changeTypeMeta(
  type: LifecycleChangeType,
): { label: string; intent: SemanticIntent } {
  switch (type) {
    case "original":   return { label: "Original",   intent: "muted"   };
    case "amendment":  return { label: "Amendment",  intent: "warning" };
    case "reversal":   return { label: "Reversal",   intent: "error"   };
    case "correction": return { label: "Correction", intent: "info"    };
    default:           return { label: type,         intent: "muted"   };
  }
}

function LifecycleRow({
  entry,
  priorStatus,
}: {
  entry:       LifecycleEntry;
  priorStatus: string | null;
}) {
  const meta   = changeTypeMeta(entry.change_type);
  const colors = resolveSemanticColors(meta.intent);
  const transitionText = priorStatus
    ? `${titleLabel(priorStatus)} → ${titleLabel(entry.record_status)}`
    : titleLabel(entry.record_status);

  return (
    <div className={cn(
      "grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[auto_1fr_auto]",
      entry.is_current && "border-foreground/50",
    )}>
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <span className="text-xs tabular-nums text-muted-foreground">
          v{entry.version_no}
        </span>
        <span className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          colors.subtleBadge,
        )}>
          {meta.label}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {transitionText}
          {entry.is_current && (
            <span className="ml-2 text-[11px] font-medium text-muted-foreground">· current</span>
          )}
        </p>
        {entry.change_reason && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={entry.change_reason}>
            {entry.change_reason}
          </p>
        )}
        {!entry.change_reason && entry.change_summary && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={entry.change_summary}>
            {entry.change_summary}
          </p>
        )}
      </div>
      <div className="text-left text-sm text-muted-foreground md:text-right">
        {entry.created_by_name ? <p>{entry.created_by_name}</p> : null}
        <p>{formatDateTime(entry.created_at)}</p>
      </div>
    </div>
  );
}

// ─── Audit panel + log ──────────────────────────────────────────────────────

/**
 * AuditPanel — column-level mutation history for a document record.
 *
 * Data source: GET /api/runtime/v1/entities/:entity/:id/audit-log, backed
 * by log.audit_log. Each row is one INSERT/UPDATE/DELETE/status_change
 * carrying old_values + new_values + changed_fields + optional reason_code
 * (Phase 3 plumbing).
 *
 * Distinct from VersionsPanel + LifecyclePanel:
 *   Versions   → snapshot.document_snapshot (graph checkpoints)
 *   Lifecycle  → log.entity_lifecycle_log    (state transitions)
 *   Audit      → log.audit_log               (column-level mutations)
 *
 * The three panels answer different questions: "what was the graph?" /
 * "how did state move?" / "what columns changed and why?".
 */
function AuditPanel({
  contract,
  recordId,
}: {
  contract: MetaEntityRuntimeDescriptor;
  recordId: string;
}) {
  const { loading, error, entries } = useAuditLog(contract.entityCode, recordId);

  // Newest first comes from the server (ORDER BY created_at DESC).
  const latest = entries[0] ?? null;
  const reasonedCount = entries.filter((e) => e.reason_code).length;

  return (
    <WorkPanel title="Audit">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <ProcessFact
            label="Last change"
            value={latest ? formatDateTime(latest.created_at) : "—"}
          />
          <ProcessFact
            label="Last actor"
            value={latest?.actor_name ?? (latest ? "System" : "—")}
          />
          <ProcessFact
            label="With reason codes"
            value={reasonedCount > 0 ? `${reasonedCount} of ${entries.length}` : "None recorded"}
          />
        </div>

        {loading ? (
          <EmptyProcessState title="Loading audit log…" detail="Reading column-level mutation history." />
        ) : error ? (
          <EmptyProcessState
            title="Couldn't load audit log"
            detail={error}
          />
        ) : entries.length > 0 ? (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <EmptyProcessState
            title="No audit entries yet"
            detail="Field-level changes appear here as the record is created, edited, status-changed, or restored."
          />
        )}
      </div>
    </WorkPanel>
  );
}

/**
 * Abort-safe fetch for the audit log;
 * cancels in-flight requests when args change.
 */
function useAuditLog(entityCode: string, recordId: string): {
  loading: boolean;
  error:   string | null;
  entries: AuditLogEntry[];
} {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEntries([]);

    fetch(runtimePath.entityAuditLog(entityCode, recordId), {
      signal: controller.signal,
      cache:  "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Audit log API returned ${res.status}`);
        }
        const body = await res.json() as { data?: AuditLogEntry[] };
        if (!controller.signal.aborted) {
          setEntries(Array.isArray(body.data) ? body.data : []);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [entityCode, recordId]);

  return { loading, error, entries };
}

/**
 * Maps operation + reason severity to chip-rendering meta. Operation chip
 * uses a neutral palette (it's a fact, not a value judgement); reason
 * severity chip carries the actual urgency signal.
 */
function operationMeta(op: AuditOperation): { label: string; intent: SemanticIntent } {
  switch (op) {
    case "insert":        return { label: "Created",     intent: "info"    };
    case "update":        return { label: "Updated",     intent: "info"    };
    case "delete":        return { label: "Deleted",     intent: "error"   };
    case "status_change": return { label: "Status",      intent: "info"    };
    case "bulk_insert":   return { label: "Bulk created", intent: "info"   };
    case "bulk_update":   return { label: "Bulk updated", intent: "info"   };
    case "bulk_delete":   return { label: "Bulk deleted", intent: "error"  };
    case "restore":       return { label: "Restored",    intent: "warning" };
    case "archive":       return { label: "Archived",    intent: "muted"   };
    case "purge":         return { label: "Purged",      intent: "error"   };
    default:              return { label: op,            intent: "muted"   };
  }
}

function reasonSeverityIntent(severity: ChangeReasonSeverity): SemanticIntent {
  switch (severity) {
    case "critical": return "error";
    case "elevated": return "warning";
    case "normal":
    default:         return "muted";
  }
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const opMeta     = operationMeta(entry.operation);
  const opColors   = resolveSemanticColors(opMeta.intent);
  const reasonColors = entry.reason_code_severity
    ? resolveSemanticColors(reasonSeverityIntent(entry.reason_code_severity))
    : null;

  // Cap the visible changed-field chips so a row with 40 columns doesn't
  // overflow the panel. Anything past 6 collapses into a "+N more" chip.
  const visibleFields = entry.changed_fields.slice(0, 6);
  const hiddenCount   = Math.max(0, entry.changed_fields.length - visibleFields.length);

  return (
    <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[auto_1fr_auto]">
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <span className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          opColors.subtleBadge,
        )}>
          {opMeta.label}
        </span>
        {entry.reason_code_name && reasonColors && (
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              reasonColors.subtleBadge,
            )}
            title={entry.reason_code_category ?? undefined}
          >
            {entry.reason_code_name}
          </span>
        )}
      </div>
      <div className="min-w-0">
        {visibleFields.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {visibleFields.map((field) => (
              <span
                key={field}
                className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground"
              >
                {field}
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                +{hiddenCount} more
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">
            {entry.operation === "status_change" ? "Status transition" : "No field diff captured"}
          </span>
        )}
      </div>
      <div className="text-left text-sm text-muted-foreground md:text-right">
        {entry.actor_name ? <p>{entry.actor_name}</p> : null}
        <p>{formatDateTime(entry.created_at)}</p>
      </div>
    </div>
  );
}

function StageTracker({
  stages,
  currentStage,
}: {
  stages: string[];
  currentStage: string | null;
}) {
  const currentIndex = currentStage
    ? stages.findIndex((stage) => sameCode(stage, currentStage))
    : -1;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit items-center gap-2">
        {stages.map((stage, index) => {
          const isCurrent = currentIndex === index;
          const isDone = currentIndex > index;
          const Icon = isDone ? CheckCircle2 : isCurrent ? Clock3 : Circle;
          return (
            <div key={`${stage}:${index}`} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex min-w-28 items-center gap-2 rounded-md border px-3 py-2",
                  isCurrent
                    ? "border-foreground bg-foreground text-background"
                    : isDone
                      ? "border-border bg-muted/50 text-foreground"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-medium">{titleLabel(stage)}</span>
              </div>
              {index < stages.length - 1 ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ApprovalTaskCard({ item }: { item: ApprovalItem }) {
  const status = normalizeCode(item.status ?? "");
  const isPending = isPendingApprovalStatus(item.status);
  const assignee = item.assignee_display_name
    ?? [item.assignee_given_name, item.assignee_family_name].filter(Boolean).join(" ")
    ?? item.assignee_id
    ?? "Unassigned";
  const dateValue = item.due_at ?? item.completed_at ?? item.assigned_at;

  const badgeCls = cn(
    "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium leading-none",
    status === "assigned" || status === "in_progress"
      ? "border-warning/40 bg-warning/10 text-warning"
      : status === "completed"
        ? "border-success/40 bg-success/10 text-success"
        : "border-border bg-muted/50 text-muted-foreground",
  );

  const description = item.reason
    ?? (item.task_type && item.task_type !== "approval"
      ? titleLabel(item.task_type)
      : null);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{assignee}</p>
            <span className={badgeCls}>
              {item.decision ? titleLabel(item.decision) : titleLabel(item.status ?? "unknown")}
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {dateValue ? (
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {isPending
              ? <Clock className="h-3 w-3" />
              : <CheckCircle2 className="h-3 w-3 text-success" />}
            <span className="tabular-nums">{formatDateTime(dateValue)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Approval flow stepper ─────────────────────────────────────────────────────

const APPROVAL_LEGEND: Array<{ intent: SemanticIntent; label: string }> = [
  { intent: "success", label: "Approved" },
  { intent: "primary", label: "Active" },
  { intent: "warning", label: "Watcher" },
  { intent: "neutral", label: "Queued" },
  { intent: "error",   label: "Rejected" },
];

function approvalItemIntent(item: ApprovalItem): SemanticIntent {
  if (normalizeCode(item.task_type ?? "") === "watcher") return "warning";
  const decision = normalizeCode(item.decision ?? "");
  if (decision === "approve") return "success";
  if (decision === "reject" || decision === "escalate") return "error";
  const status = normalizeCode(item.status ?? "");
  if (status === "completed")                            return "success";
  if (status === "escalated")                            return "error";
  if (status === "assigned" || status === "in_progress") return "primary";
  return "neutral";
}

function approvalItemLabel(item: ApprovalItem): string {
  if (normalizeCode(item.task_type ?? "") === "watcher") return "Watcher";
  const decision = normalizeCode(item.decision ?? "");
  if (decision === "approve")  return "Approved";
  if (decision === "reject")   return "Rejected";
  if (decision === "escalate") return "Escalated";
  const status = normalizeCode(item.status ?? "");
  if (status === "completed")                            return "Approved";
  if (status === "assigned" || status === "in_progress") return "Active";
  if (status === "skipped")                              return "Skipped";
  return "Queued";
}

function approvalOverallIntent(items: ApprovalItem[]): SemanticIntent {
  if (items.some((i) => normalizeCode(i.decision ?? "") === "reject")) return "error";
  if (items.every((i) => {
    const d = normalizeCode(i.decision ?? "");
    const s = normalizeCode(i.status ?? "");
    return d === "approve" || s === "completed";
  })) return "success";
  if (items.some((i) => {
    const s = normalizeCode(i.status ?? "");
    return s === "assigned" || s === "in_progress";
  })) return "primary";
  return "neutral";
}

function approvalOverallLabel(items: ApprovalItem[]): string {
  if (items.some((i) => normalizeCode(i.decision ?? "") === "reject")) return "Rejected";
  if (items.every((i) => {
    const d = normalizeCode(i.decision ?? "");
    const s = normalizeCode(i.status ?? "");
    return d === "approve" || s === "completed";
  })) return "Approved";
  return "Pending";
}

function FlowEndpointNode({
  label,
  intent,
  warm,
}: {
  label: string;
  intent: SemanticIntent;
  warm?: boolean;
}) {
  const cls = warm
    ? "border-warning/30 bg-warning/10 text-warning"
    : resolveSemanticColors(intent).subtleBadge;
  return (
    <div className={cn("shrink-0 rounded border px-3 py-1.5 text-xs font-medium", cls)}>
      {label}
    </div>
  );
}

function FlowConnector({ filled }: { filled?: boolean }) {
  return (
    <div className="flex min-w-6 shrink-0 flex-1 items-center">
      <div className={cn("h-px flex-1", filled ? "bg-success/40" : "bg-border")} />
      <ChevronRight
        className={cn("h-3.5 w-3.5 shrink-0 -ml-0.5", filled ? "text-success/60" : "text-border")}
      />
    </div>
  );
}

function ApproverFlowCard({ item }: { item: ApprovalItem }) {
  const intent  = approvalItemIntent(item);
  const label   = approvalItemLabel(item);
  const colors  = resolveSemanticColors(intent);
  const name    = item.assignee_display_name
    ?? [item.assignee_given_name, item.assignee_family_name].filter(Boolean).join(" ")
    ?? `Approver ${item.order_index ?? ""}`;
  const isManual = item.metadata?.["added_manually"] === true;

  return (
    <div className="w-44 shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Vivid status header */}
      <div className={cn("px-3 py-1.5 text-center text-xs font-semibold", colors.badge)}>
        {label}
      </div>

      {/* Assignee row */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        {intent === "success" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : intent === "error" ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : intent === "primary" || intent === "warning" ? (
          <Clock className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        )}
        <span className="truncate text-sm font-medium leading-tight text-foreground">
          {name}
        </span>
        {isManual ? (
          <span className="ml-auto shrink-0 rounded bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground">
            +
          </span>
        ) : null}
      </div>

      {/* Completion date */}
      {item.completed_at ? (
        <div className="border-t px-3 pb-2 pt-1 text-xs text-muted-foreground">
          {new Date(item.completed_at).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
          })}
        </div>
      ) : null}
    </div>
  );
}

function ApprovalFlowStepper({ items }: { items: ApprovalItem[] }) {
  const sorted = [...items].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const finalIntent = approvalOverallIntent(sorted);
  const finalLabel  = approvalOverallLabel(sorted);

  let lastDoneIdx = -1;
  sorted.forEach((item, idx) => {
    const decision = normalizeCode(item.decision ?? "");
    const status   = normalizeCode(item.status ?? "");
    if (decision === "approve" || (status === "completed" && decision !== "reject")) {
      lastDoneIdx = idx;
    }
  });

  return (
    <div className="space-y-4">
      {/* Horizontal stepper — scrollable on narrow screens */}
      <div className="flex items-center gap-0 overflow-x-auto py-2">
        <FlowEndpointNode label="Submitted" intent="neutral" warm />
        {sorted.map((item, idx) => (
          <Fragment key={item.id ?? `${item.workflow_request_id}:${item.order_index ?? idx}`}>
            <FlowConnector filled={idx <= lastDoneIdx} />
            <ApproverFlowCard item={item} />
          </Fragment>
        ))}
        <FlowConnector filled={lastDoneIdx === sorted.length - 1} />
        <FlowEndpointNode label={finalLabel} intent={finalIntent} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        {APPROVAL_LEGEND.map(({ intent, label }) => {
          const { dot } = resolveSemanticColors(intent);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", dot)} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ProcessFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate text-sm font-medium text-foreground", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function EmptyProcessState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed bg-background p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProcessCommand({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-foreground",
        "hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-background",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface RuntimePresentation {
  processState?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  approvals?: Record<string, unknown>;
  versions?: VersionItem[];
  defaultProcessTab?: string;
}

function readRuntimePresentation(record?: RuntimeRecordRow): RuntimePresentation {
  const metadata = readRecordObject(record, "metadata");
  const uiPresentation = objectAt(metadata, "uiPresentation");
  const runtime = objectAt(metadata, "runtime");
  return {
    processState: objectAt(runtime, "processState"),
    workflow: objectAt(uiPresentation, "workflow"),
    approvals: objectAt(uiPresentation, "approvals"),
    versions: arrayAt(uiPresentation, "versions").filter(isVersionItem),
    defaultProcessTab: textAt(uiPresentation, "defaultProcessTab") ?? undefined,
  };
}

function selectWorkflowRequest(items: WorkflowRequestItem[] | undefined): WorkflowRequestItem | undefined {
  if (!items || items.length === 0) return undefined;
  return items.find((item) => item.status === "pending") ?? items[0];
}

function resolveStageNames(
  contract: MetaEntityRuntimeDescriptor,
  request: WorkflowRequestItem | undefined,
  currentStage: string | undefined,
  metadata: RuntimePresentation,
): string[] {
  const withoutLifecycleDuplicates = (stages: string[]): string[] =>
    suppressLifecycleDuplicateStages(stages, contract.lifecycle?.states ?? []);
  const requestStages = request?.stages
    ?.map((stage) => stage.name)
    .filter(isNonBlankString) ?? [];
  if (requestStages.length > 0) return withoutLifecycleDuplicates(requestStages);
  if (contract.workflow?.stages.length) return withoutLifecycleDuplicates(contract.workflow.stages);
  const metadataWorkflow = objectAt(metadata.processState, "workflow");
  const metadataStage = textAt(metadataWorkflow, "currentStage")
    ?? currentStage;
  return metadataStage ? withoutLifecycleDuplicates([metadataStage]) : [];
}

/** Prevent a lifecycle state route from being presented as an approval route. */
export function suppressLifecycleDuplicateStages(stages: string[], lifecycleStates: string[]): string[] {
  const unique = uniqueStrings(stages);
  const lifecycleCodes = new Set(lifecycleStates.map(normalizeCode));
  return unique.length > 0 && unique.every((stage) => lifecycleCodes.has(normalizeCode(stage)))
    ? []
    : unique;
}

function activeStageName(request: WorkflowRequestItem | undefined): string | null {
  const stages = request?.stages ?? [];
  return stages.find((stage) => ["active", "pending", "in_progress"].includes(normalizeCode(stage.status ?? "")))?.name
    ?? stages.find((stage) => !stage.completed_at)?.name
    ?? stages.at(-1)?.name
    ?? null;
}

function formatApprovalAssignment(metadata: RuntimePresentation, myPendingCount: number): string {
  const assignedTo = textAt(metadata.approvals, "assignedTo");
  const dueDate = textAt(metadata.approvals, "dueDate");
  if (assignedTo && dueDate) return `${assignedTo} - due ${formatDate(dueDate)}`;
  if (assignedTo) return assignedTo;
  return myPendingCount > 0 ? `${myPendingCount} task${myPendingCount === 1 ? "" : "s"} assigned to you` : "No action assigned to you";
}

function isPendingApprovalStatus(status: string | null | undefined): boolean {
  return ["assigned", "in_progress", "pending", "open"].includes(normalizeCode(status ?? ""));
}

function readRecordText(record: RuntimeRecordRow | undefined, keys: string[]): string | undefined {
  const data = isRecord(record?.data) ? record.data : {};
  for (const key of keys) {
    const value = data[key] ?? record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readRecordObject(record: RuntimeRecordRow | undefined, key: string): Record<string, unknown> | undefined {
  const data = isRecord(record?.data) ? record.data : {};
  const value = data[key] ?? record?.[key];
  return isRecord(value) ? value : undefined;
}

function objectAt(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const item = value?.[key];
  return isRecord(item) ? item : undefined;
}

function arrayAt(value: Record<string, unknown> | undefined, key: string): unknown[] {
  const item = value?.[key];
  return Array.isArray(item) ? item : [];
}

function textAt(value: Record<string, unknown> | undefined, key: string): string | null {
  const item = value?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function numberAt(value: Record<string, unknown> | undefined, key: string): number | null {
  const item = value?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function stringArrayAt(value: Record<string, unknown> | undefined, key: string): string[] {
  return arrayAt(value, key).filter(isNonBlankString);
}

function isVersionItem(value: unknown): value is VersionItem {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueByCode(value: string, index: number, values: string[]): boolean {
  const code = normalizeCode(value);
  return values.findIndex((item) => normalizeCode(item) === code) === index;
}

function sameCode(left: string, right: string): boolean {
  return normalizeCode(left) === normalizeCode(right);
}

function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, "_").trim();
}

function titleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
