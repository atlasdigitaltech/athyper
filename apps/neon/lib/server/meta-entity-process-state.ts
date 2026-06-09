import "server-only";

import { cache } from "react";
import type { V4Session } from "@athyper/auth-bff";
import type {
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
  LifecycleStep,
  LifecycleTransition,
} from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { readRuntimeRecordText } from "@athyper/runtime-shared/core";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

interface StatusRoutePayload {
  all_states?: string[];
  terminal_states?: string[];
  allowed_transitions?: Record<string, unknown>;
}

interface LifecycleApiStep {
  state: string;
  label?: string | null;
  status: "completed" | "current" | "future";
  entered_at?: string | null;
  actor_name?: string | null;
}

interface LifecycleApiTransition {
  from_status: string | null;
  to_status: string;
  transitioned_at: string;
  operation_code?: string | null;
  actor_name?: string | null;
  remarks?: string | null;
}

interface LifecycleRoutePayload {
  lifecycle_code?: string | null;
  states?: string[];
  terminal_states?: string[];
  current_state?: string | null;
  steps?: LifecycleApiStep[];
  transitions?: LifecycleApiTransition[];
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

type ProcessStateWithSurfaces = ProcessRuntimeState & {
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

const PENDING_APPROVAL_STATUSES = new Set(["assigned", "in_progress", "pending", "open"]);

export const getMetaEntityProcessRuntimeState = cache(
  async (
    routeEntity: string,
    routeRecordId: string,
    descriptor: MetaEntityRuntimeDescriptor | undefined,
    record: RuntimeRecordRow | undefined,
  ): Promise<ProcessRuntimeState | null> => {
    const entityCode = normalizeEntityCode(routeEntity);
    const upstreamRecordId = readResolvedRecordId(record, routeRecordId);
    if (!entityCode || !upstreamRecordId || !record) return null;

    const session = await getNeonServerSession();
    if (!session) return null;

    const headers = buildRuntimeHeaders(session);
    const encodedEntity = encodeURIComponent(entityCode);
    const encodedRecord = encodeURIComponent(upstreamRecordId);

    const [workflowBody, approvalsBody, versionsBody, statusRouteBody, lifecycleBody] = await Promise.all([
      fetchRuntimeJson(`/api/records/${encodedEntity}/${encodedRecord}/workflow`, headers),
      fetchRuntimeJson(`/api/records/${encodedEntity}/${encodedRecord}/approvals`, headers),
      fetchRuntimeJson(`/api/records/${encodedEntity}/${encodedRecord}/versions`, headers),
      fetchRuntimeJson(`/api/metadata/entities/${encodedEntity}/status-route`, headers),
      fetchRuntimeJson(`/api/records/${encodedEntity}/${encodedRecord}/lifecycle`, headers),
    ]);

    const lifecycleData = readLifecyclePayload(lifecycleBody);
    const workflowRequests = readArrayField(workflowBody, "data")
      .map(normalizeWorkflowRequest)
      .filter(isPresent);
    const approvalItems = readArrayField(approvalsBody, "data")
      .map(normalizeApprovalItem)
      .filter(isPresent);
    const statusRoute = isRecord(statusRouteBody) ? statusRouteBody as StatusRoutePayload : undefined;
    const recordStatus = readRecordStatus(record);
    const metadataPresentation = readRuntimePresentation(record);
    const metadataProcessState = isRecord(metadataPresentation.processState)
      ? metadataPresentation.processState
      : undefined;
    const metadataLifecycle = readObject(metadataProcessState?.["lifecycle"]);
    const metadataWorkflow = readObject(metadataProcessState?.["workflow"]);
    const currentState = lifecycleData?.current_state
      ?? recordStatus
      ?? readString(metadataLifecycle?.["currentState"])
      ?? readString(metadataLifecycle?.["current_state"])
      ?? null;
    const terminalStates = readStringArray(lifecycleData?.terminal_states)
      ?? readStringArray(statusRoute?.terminal_states)
      ?? descriptor?.lifecycle?.terminalStates
      ?? [];
    const allowedTransitions = currentState
      ? readAllowedTransitions(statusRoute, currentState)
      : [];
    const activeRequest = selectWorkflowRequest(workflowRequests);
    const activeStage = selectActiveStage(activeRequest);
    const pendingApprovals = approvalItems.filter((item) => isPendingApprovalStatus(item.status));
    const completedApprovals = approvalItems.filter((item) => !isPendingApprovalStatus(item.status));
    const myPendingApprovals = pendingApprovals.filter((item) => isAssignedToPrincipal(item, session));
    const safeApprovalItems = approvalItems
      .filter((item) => !isPendingApprovalStatus(item.status) || isAssignedToPrincipal(item, session))
      .map((item) => sanitizeApprovalItem(item, session));
    const myActionLabels = resolveMyApprovalActions(myPendingApprovals);
    const userTaskActions = expandWorkflowActionCodes(myActionLabels);
    const versionItems = readArrayField(versionsBody, "data")
      .map(normalizeVersionItem)
      .filter(isPresent);
    const metadataVersions = metadataPresentation.versions;
    const versions = versionItems.length > 0 ? versionItems : metadataVersions;
    const currentVersion = selectCurrentVersion(versions);

    const state: ProcessStateWithSurfaces = {
      entityCode,
      recordId: upstreamRecordId,
      lifecycle: {
        currentState,
        currentStateEnteredAt: lifecycleData?.steps?.find(
          (s) => s.status === "current",
        )?.entered_at ?? null,
        source: lifecycleData?.steps?.length
          ? "lifecycle_instance"
          : recordStatus
            ? "record_status"
            : "none",
        allowedTransitions,
        terminal: currentState ? includesCode(terminalStates, currentState) : false,
        terminalStates,
        drift: recordStatus ? { recordStatus } : undefined,
        steps: lifecycleData?.steps?.map(normalizeLifecycleStep).filter(isPresent),
        transitions: lifecycleData?.transitions?.map(normalizeLifecycleTransition).filter(isPresent),
      },
      workflow: workflowRequests.length > 0 || metadataWorkflow
        ? {
            requestId: readString(activeRequest?.id) ?? readString(metadataWorkflow?.["requestId"]) ?? undefined,
            status: activeRequest?.status ?? readString(metadataWorkflow?.["status"]) ?? undefined,
            currentStage: activeStage?.name
              ?? readString(metadataWorkflow?.["currentStage"])
              ?? readString(metadataWorkflow?.["current_stage"])
              ?? undefined,
            pendingTasks: pendingApprovals.length,
            userTaskActions,
          }
        : undefined,
      workflowRequests,
      approvals: {
        items: safeApprovalItems,
        pendingCount: pendingApprovals.length,
        completedCount: completedApprovals.length,
        myPendingCount: myPendingApprovals.length,
        myActions: myActionLabels,
      },
      versions: {
        items: versions,
        count: versions.length,
        currentVersion: currentVersion?.version,
        publishedAt: currentVersion?.at,
        changedBy: currentVersion?.actor,
      },
    };

    return state;
  },
);

async function fetchRuntimeJson(pathname: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const response = await fetch(buildRuntimeUrl(pathname), {
      headers,
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    return await response.json().catch(() => null) as unknown;
  } catch {
    return null;
  }
}

function normalizeWorkflowRequest(value: unknown): WorkflowRequestItem | null {
  if (!isRecord(value)) return null;
  return {
    id: readString(value["id"]),
    workflow_type: readString(value["workflow_type"]),
    status: readString(value["status"]),
    decision: readNullableString(value["decision"]),
    requested_at: readString(value["requested_at"]),
    requested_by: readString(value["requested_by"]),
    stages: readArray(value["stages"]).map(normalizeWorkflowStage).filter(isPresent),
    metadata: readObject(value["metadata"]),
  };
}

function normalizeWorkflowStage(value: unknown): WorkflowStageItem | null {
  if (!isRecord(value)) return null;
  return {
    id: readString(value["id"]),
    name: readString(value["name"]),
    status: readString(value["status"]),
    outcome: readNullableString(value["outcome"]),
    stage_no: readNumber(value["stage_no"]),
    started_at: readNullableString(value["started_at"]),
    completed_at: readNullableString(value["completed_at"]),
    sla_target_hours: readNumber(value["sla_target_hours"]),
    sla_deadline: readString(value["sla_deadline"]),
    sla_status: readString(value["sla_status"]),
  };
}

function normalizeApprovalItem(value: unknown): ApprovalItem | null {
  if (!isRecord(value)) return null;
  return {
    id: readString(value["id"]),
    task_type: readString(value["task_type"]),
    workflow_request_id: readString(value["workflow_request_id"]),
    workflow_stage_id: readString(value["workflow_stage_id"]),
    order_index: readNumber(value["order_index"]),
    assignee_id: readNullableString(value["assignee_id"]),
    designated_id: readNullableString(value["designated_id"]),
    assignee_display_name: readNullableString(value["assignee_display_name"]),
    assignee_given_name: readNullableString(value["assignee_given_name"]),
    assignee_family_name: readNullableString(value["assignee_family_name"]),
    status: readString(value["status"]),
    decision: readNullableString(value["decision"]),
    reason: readNullableString(value["reason"]),
    assigned_at: readNullableString(value["assigned_at"]),
    completed_at: readNullableString(value["completed_at"]),
    due_at: readNullableString(value["due_at"]),
    metadata: readObject(value["metadata"]),
  };
}

function normalizeVersionItem(value: unknown): VersionItem | null {
  if (!isRecord(value)) return null;
  return {
    version: readString(value["version"]) ?? readNumber(value["version"]),
    label: readString(value["label"]),
    status: readString(value["status"]),
    actor: readString(value["actor"]) ?? readString(value["changed_by"]),
    at: readString(value["at"]) ?? readString(value["published_at"]) ?? readString(value["created_at"]),
  };
}

function selectWorkflowRequest(items: WorkflowRequestItem[]): WorkflowRequestItem | undefined {
  return items.find((item) => isActiveWorkflowStatus(item.status)) ?? items[0];
}

function selectActiveStage(request: WorkflowRequestItem | undefined): WorkflowStageItem | undefined {
  const stages = request?.stages ?? [];
  return stages.find((stage) => ["active", "pending", "in_progress"].includes(normalizeCode(stage.status ?? "")))
    ?? stages.find((stage) => !stage.completed_at)
    ?? stages.at(-1);
}

function selectCurrentVersion(items: VersionItem[]): VersionItem | undefined {
  return items.find((item) => normalizeCode(item.status ?? "") === "current") ?? items.at(-1);
}

function resolveMyApprovalActions(items: ApprovalItem[]): string[] {
  const explicit = uniqueStrings(items.flatMap((item) => readStringArray(readObject(item.metadata)?.["actions"]) ?? []));
  return explicit.length > 0 && items.length > 0
    ? explicit
    : items.length > 0
      ? ["Approve", "Reject", "Request changes"]
      : [];
}

function expandWorkflowActionCodes(labels: string[]): string[] {
  const values = new Set<string>();
  for (const label of labels) {
    const code = normalizeCode(label);
    if (!code) continue;
    values.add(code);
    values.add(`workflow_${code}`);
  }
  return [...values];
}

function readAllowedTransitions(statusRoute: StatusRoutePayload | undefined, state: string): string[] {
  const transitions = statusRoute?.allowed_transitions;
  if (!transitions) return [];
  const matchingKey = Object.keys(transitions).find((key) => sameCode(key, state));
  const value = matchingKey ? transitions[matchingKey] : undefined;
  return readStringArray(value) ?? [];
}

function isAssignedToPrincipal(item: ApprovalItem, session: V4Session): boolean {
  const principalKeys = principalIdentityKeys(session);
  const candidates = [
    item.assignee_id,
    item.designated_id,
    item.assignee_display_name,
    item.assignee_given_name,
    item.assignee_family_name,
    ...metadataIdentityCandidates(item.metadata),
  ];
  return candidates.some((candidate) => identityMatches(candidate, principalKeys));
}

function sanitizeApprovalItem(item: ApprovalItem, session: V4Session): ApprovalItem {
  if (isAssignedToPrincipal(item, session)) return item;
  return {
    ...item,
    assignee_id: null,
    designated_id: null,
    assignee_display_name: "Approver",
    assignee_given_name: null,
    assignee_family_name: null,
    metadata: undefined,
  };
}

function principalIdentityKeys(session: V4Session): Set<string> {
  return new Set(
    [session.userId, session.username, session.email, session.displayName]
      .map(normalizeIdentity)
      .filter((value) => value.length > 0),
  );
}

function metadataIdentityCandidates(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  return [
    readString(metadata["assignedTo"]),
    readString(metadata["assigned_to"]),
    readString(metadata["assignee"]),
    readString(metadata["assignee_id"]),
    readString(metadata["designated_id"]),
    readString(metadata["principal"]),
    readString(metadata["principalId"]),
    readString(metadata["principal_id"]),
    readString(metadata["username"]),
    readString(metadata["email"]),
  ].filter(isPresent);
}

function identityMatches(value: string | null | undefined, principalKeys: Set<string>): boolean {
  const normalized = normalizeIdentity(value);
  if (!normalized) return false;
  if (principalKeys.has(normalized)) return true;
  if (normalized.length < 4) return false;
  return [...principalKeys].some((principal) => (
    principal.length >= 4 && (normalized.includes(principal) || principal.includes(normalized))
  ));
}

function readRuntimePresentation(record: RuntimeRecordRow): {
  processState?: unknown;
  versions: VersionItem[];
} {
  const metadata = readRecordObject(record, "metadata");
  const runtime = readObject(metadata?.["runtime"]);
  const uiPresentation = readObject(metadata?.["uiPresentation"]);
  return {
    processState: runtime?.["processState"],
    versions: readArray(uiPresentation?.["versions"]).map(normalizeVersionItem).filter(isPresent),
  };
}

function readRecordObject(record: RuntimeRecordRow, key: string): Record<string, unknown> | undefined {
  const data = isRecord(record.data) ? record.data : {};
  return readObject(data[key] ?? record[key]);
}

function readResolvedRecordId(record: RuntimeRecordRow | undefined, fallback: string): string | null {
  if (!record) return fallback.trim() || null;
  return readRuntimeRecordText(record, "id")
    ?? readString(record.id)
    ?? (fallback.trim() || null);
}

function readRecordStatus(record: RuntimeRecordRow): string | null {
  return readRuntimeRecordText(record, "status")
    ?? readRuntimeRecordText(record, "lifecycle_state")
    ?? readRuntimeRecordText(record, "state")
    ?? null;
}

function isPendingApprovalStatus(status: string | null | undefined): boolean {
  return PENDING_APPROVAL_STATUSES.has(normalizeCode(status ?? ""));
}

function isActiveWorkflowStatus(status: string | null | undefined): boolean {
  return ["pending", "active", "in_progress", "assigned"].includes(normalizeCode(status ?? ""));
}

function includesCode(values: string[], candidate: string): boolean {
  return values.some((value) => sameCode(value, candidate));
}

function sameCode(left: string, right: string): boolean {
  return normalizeCode(left) === normalizeCode(right);
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeEntityCode(routeEntity: string): string {
  const parts = routeEntity.trim().split(".").filter(Boolean);
  return (parts.at(-1) ?? "").replace(/-/g, "_");
}

function readArrayField(value: unknown, key: string): unknown[] {
  return isRecord(value) ? readArray(value[key]) : [];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : [];
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readLifecyclePayload(body: unknown): LifecycleRoutePayload | undefined {
  if (!isRecord(body)) return undefined;
  const data = isRecord(body["data"]) ? body["data"] : body;
  return {
    lifecycle_code:  readString(data["lifecycle_code"]) ?? null,
    states:          readStringArray(data["states"]) ?? [],
    terminal_states: readStringArray(data["terminal_states"]) ?? [],
    current_state:   readNullableString(data["current_state"]) ?? null,
    steps:           readArray(data["steps"])
                       .map(normalizeLifecycleApiStep)
                       .filter(isPresent),
    transitions:     readArray(data["transitions"])
                       .map(normalizeLifecycleApiTransition)
                       .filter(isPresent),
  };
}

function normalizeLifecycleApiStep(value: unknown): LifecycleApiStep | null {
  if (!isRecord(value)) return null;
  const status = readString(value["status"]);
  if (status !== "completed" && status !== "current" && status !== "future") return null;
  return {
    state:      readString(value["state"]) ?? "",
    label:      readNullableString(value["label"]),
    status,
    entered_at: readNullableString(value["entered_at"]),
    actor_name: readNullableString(value["actor_name"]),
  };
}

function normalizeLifecycleApiTransition(value: unknown): LifecycleApiTransition | null {
  if (!isRecord(value)) return null;
  const toStatus = readString(value["to_status"]);
  if (!toStatus) return null;
  return {
    from_status:     readNullableString(value["from_status"]) ?? null,
    to_status:       toStatus,
    transitioned_at: readString(value["transitioned_at"]) ?? "",
    operation_code:  readNullableString(value["operation_code"]),
    actor_name:      readNullableString(value["actor_name"]),
    remarks:         readNullableString(value["remarks"]),
  };
}

function normalizeLifecycleStep(step: LifecycleApiStep): LifecycleStep | null {
  if (!step.state) return null;
  return {
    state:     step.state,
    label:     step.label ?? undefined,
    status:    step.status,
    enteredAt: step.entered_at ?? undefined,
    actorName: step.actor_name ?? undefined,
  };
}

function normalizeLifecycleTransition(t: LifecycleApiTransition): LifecycleTransition | null {
  if (!t.to_status) return null;
  return {
    fromStatus:     t.from_status,
    toStatus:       t.to_status,
    transitionedAt: t.transitioned_at,
    operationCode:  t.operation_code ?? undefined,
    actorName:      t.actor_name ?? undefined,
    remarks:        t.remarks ?? undefined,
  };
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
