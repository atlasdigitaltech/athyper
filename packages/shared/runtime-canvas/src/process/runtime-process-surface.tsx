"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
import { CheckCircle2, ChevronRight, Circle, Clock, Clock3, Eye, GitCompare, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { WorkPanel } from "@athyper/surface-kit";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import type { LifecycleStep, MetaEntityRuntimeDescriptor, ProcessRuntimeLifecycleState, ProcessRuntimeState } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";

export type RuntimeProcessSurfaceId = "process" | "versions";

interface RuntimeProcessSurfaceProps {
  activeSurface: RuntimeProcessSurfaceId;
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
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

export function RuntimeProcessSurface({
  activeSurface,
  contract,
  record,
  recordId,
  processState,
}: RuntimeProcessSurfaceProps) {
  const metadata = readRuntimePresentation(record);
  const extras = processState as ProcessStateExtras | undefined;

  if (activeSurface === "process") {
    return (
      <ProcessPanel
        contract={contract}
        record={record}
        recordId={recordId}
        processState={extras}
        metadata={metadata}
      />
    );
  }

  return (
    <VersionsPanel
      contract={contract}
      record={record}
      processState={extras}
      metadata={metadata}
    />
  );
}

function ProcessPanel({
  contract,
  record,
  processState,
  metadata,
}: {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessStateExtras;
  metadata: RuntimePresentation;
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
  const approvalItems = processState?.approvals?.items ?? [];
  const myPendingCount = processState?.approvals?.myPendingCount ?? processState?.workflow?.pendingTasks ?? 0;
  const headline = textAt(metadata.approvals, "headline")
    ?? (myPendingCount > 0 ? "Your approval is requested" : null);
  const subtext = formatApprovalAssignment(metadata, myPendingCount);
  const actions = stringArrayAt(metadata.approvals, "actions")
    .concat(processState?.approvals?.myActions ?? [])
    .filter(uniqueByCode);

  // Section visibility
  const hasLifecycle = contract.lifecycle?.enabled === true && (flowSteps.length > 0 || exitStates.length > 0);
  const hasWorkflow = contract.workflow?.enabled === true || approvalItems.length > 0 || stageNames.length > 0;

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
    <WorkPanel title="Process flow">
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
            title="No process configured"
            detail="This record has no lifecycle or workflow configured."
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


function VersionsPanel({
  contract,
  record,
  processState,
  metadata,
}: {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  processState?: ProcessStateExtras;
  metadata: RuntimePresentation;
}) {
  const metadataVersions = Array.isArray(metadata.versions) ? metadata.versions : [];
  const items = processState?.versions?.items ?? metadataVersions;
  const current = selectCurrentVersion(items, processState, contract, record);
  const count = processState?.versions?.count ?? (items.length > 0 ? items.length : undefined);

  return (
    <WorkPanel title="Versions">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <ProcessFact label="Current Version" value={current.versionLabel} />
          <ProcessFact label="Published" value={current.publishedAt ? formatDateTime(current.publishedAt) : "Not published"} />
          <ProcessFact label="Changed By" value={current.changedBy ?? "Unknown"} />
        </div>

        {items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item, index) => (
              <VersionRow
                key={`${String(item.version ?? index)}:${item.at ?? index}`}
                item={item}
                current={isCurrentVersionItem(item)}
              />
            ))}
          </div>
        ) : (
          <EmptyProcessState
            title="No stored snapshots"
            detail={count ? `${count} version records are available.` : "Version snapshots are not available for this record yet."}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <ProcessCommand icon={<GitCompare className="h-3.5 w-3.5" />} label="Compare" disabled />
          <ProcessCommand icon={<RotateCcw className="h-3.5 w-3.5" />} label="Restore" disabled />
          <ProcessCommand icon={<Eye className="h-3.5 w-3.5" />} label="View Snapshot" disabled={items.length === 0} />
        </div>
      </div>
    </WorkPanel>
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

function VersionRow({ item, current }: { item: VersionItem; current: boolean }) {
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          v{String(item.version ?? "?")} {current ? "Current" : titleLabel(item.status ?? "")}
        </p>
        {item.label ? <p className="text-sm text-muted-foreground">{item.label}</p> : null}
      </div>
      <div className="text-left text-sm text-muted-foreground md:text-right">
        {item.actor ? <p>{item.actor}</p> : null}
        {item.at ? <p>{formatDateTime(item.at)}</p> : null}
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
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-45",
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
  const requestStages = request?.stages
    ?.map((stage) => stage.name)
    .filter(isNonBlankString) ?? [];
  if (requestStages.length > 0) return uniqueStrings(requestStages);
  if (contract.workflow?.stages.length) return contract.workflow.stages;
  const metadataWorkflow = objectAt(metadata.processState, "workflow");
  const metadataStage = textAt(metadataWorkflow, "currentStage")
    ?? currentStage;
  return metadataStage ? [metadataStage] : [];
}

function activeStageName(request: WorkflowRequestItem | undefined): string | null {
  const stages = request?.stages ?? [];
  return stages.find((stage) => ["active", "pending", "in_progress"].includes(normalizeCode(stage.status ?? "")))?.name
    ?? stages.find((stage) => !stage.completed_at)?.name
    ?? stages.at(-1)?.name
    ?? null;
}

function selectCurrentVersion(
  items: VersionItem[],
  processState: ProcessStateExtras | undefined,
  contract: MetaEntityRuntimeDescriptor,
  record?: RuntimeRecordRow,
): { versionLabel: string; publishedAt?: string; changedBy?: string } {
  const current = items.find(isCurrentVersionItem) ?? items.at(-1);
  const version = processState?.versions?.currentVersion
    ?? current?.version
    ?? readRecordText(record, ["version", "row_version"])
    ?? contract.source.versionNo;
  return {
    versionLabel: version ? `v${String(version)}` : "Current",
    publishedAt: processState?.versions?.publishedAt ?? current?.at ?? readRecordText(record, ["updated_at", "created_at"]),
    changedBy: processState?.versions?.changedBy ?? current?.actor ?? readRecordText(record, ["updated_by", "created_by"]),
  };
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

function isCurrentVersionItem(item: VersionItem): boolean {
  return normalizeCode(item.status ?? "") === "current";
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
