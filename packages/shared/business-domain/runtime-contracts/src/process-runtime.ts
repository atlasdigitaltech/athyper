import type {
  DisabledOperationReason,
  MetaEntityOperation,
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeLifecycleSource,
  ProcessRuntimeState,
  RuntimeMutationError,
  RuntimeOperationExecutionInput,
  RuntimeOperationExecutionResult,
  RuntimeRecord,
} from "./schemas";

export type RuntimeOperationMode = "list" | "detail" | "new" | "edit";

export type RuntimeRecordLike = RuntimeRecord & {
  id?: string | number | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ResolveLifecycleRuntimeInput {
  descriptor: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordLike | null;
  processState?: ProcessRuntimeState | null;
  statusFieldCandidates?: readonly string[];
}

export interface ResolvedLifecycleRuntime {
  currentState: string | null;
  source: ProcessRuntimeLifecycleSource;
  states: string[];
  terminalStates: string[];
  allowedTransitions: string[];
  terminal: boolean;
  drift?: {
    lifecycleInstanceState?: string | null;
    recordStatus?: string | null;
  };
  applicableOperations: MetaEntityOperation[];
}

export interface ResolveRuntimeOperationsInput {
  descriptor: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordLike | null;
  processState?: ProcessRuntimeState | null;
  mode: RuntimeOperationMode;
  permissions?: Iterable<string> | null;
  enforcePermissions?: boolean;
  includeDisabled?: boolean;
  includeUnsupportedMode?: boolean;
  includeWorkflowTaskOperations?: boolean;
}

export interface ResolvedRuntimeOperation {
  operation: MetaEntityOperation;
  enabled: boolean;
  disabledReason?: DisabledOperationReason;
  disabledReasons: DisabledOperationReason[];
  lifecycleTransition?: NonNullable<MetaEntityOperation["lifecycleTransitions"]>[number];
}

export interface RuntimePrincipal {
  id?: string;
  permissions?: Iterable<string>;
  [key: string]: unknown;
}

export interface RuntimeOperationContext {
  input: RuntimeOperationExecutionInput;
  descriptor: MetaEntityRuntimeDescriptor;
  operation: MetaEntityOperation;
  record?: RuntimeRecord | null;
  processState?: ProcessRuntimeState | null;
  principal?: RuntimePrincipal;
}

export interface RuntimeOperationHandler {
  canHandle(operation: MetaEntityOperation): boolean;
  execute(context: RuntimeOperationContext): Promise<RuntimeOperationExecutionResult>;
}

export interface RuntimeOperationExecutor {
  run(
    input: RuntimeOperationExecutionInput,
    principal?: RuntimePrincipal,
  ): Promise<RuntimeOperationExecutionResult>;
}

export interface RuntimeOperationExecutorDependencies {
  loadDescriptor(entityCode: string): Promise<MetaEntityRuntimeDescriptor | null>;
  loadRecord(entityCode: string, recordId: string): Promise<RuntimeRecord | null>;
  fetchProcessState(
    entityCode: string,
    recordId: string,
    principal?: RuntimePrincipal,
  ): Promise<ProcessRuntimeState | null>;
  handlers: RuntimeOperationHandler[];
}

const DEFAULT_STATUS_FIELD_CANDIDATES = [
  "status",
  "lifecycle_state",
  "state",
  "current_state",
] as const;

const PERMISSION_DENY_DECISIONS = new Set([
  "deny",
  "not_found",
  "not_in_plan",
  "addon_required",
  "not_granted",
]);

export function resolveLifecycleRuntime({
  descriptor,
  record,
  processState,
  statusFieldCandidates = DEFAULT_STATUS_FIELD_CANDIDATES,
}: ResolveLifecycleRuntimeInput): ResolvedLifecycleRuntime {
  const lifecycle = descriptor.lifecycle;
  const states = lifecycle?.states ?? [];
  const terminalStates = lifecycle?.terminalStates ?? [];
  const processLifecycle = processState?.lifecycle;
  const recordStatus = readRecordState(record, statusFieldCandidates);
  const currentState = processLifecycle?.currentState ?? recordStatus ?? null;
  const source = processLifecycle?.source ?? (recordStatus ? "record_status" : "none");
  const terminal = processLifecycle?.terminal
    ?? (currentState ? includesRuntimeCode(terminalStates, currentState) : false);
  const allowedTransitions = processLifecycle?.allowedTransitions ?? [];
  const drift = processLifecycle?.drift
    ?? deriveLifecycleDrift(source, currentState, recordStatus);

  const runtime: ResolvedLifecycleRuntime = {
    currentState,
    source,
    states,
    terminalStates,
    allowedTransitions,
    terminal,
    drift,
    applicableOperations: [],
  };

  runtime.applicableOperations = descriptor.operations.filter((operation) => (
    operation.lifecycleTransitions?.length
      ? Boolean(resolveLifecycleTransition(operation, runtime))
      : false
  ));

  return runtime;
}

export function resolveRuntimeOperations({
  descriptor,
  record,
  processState,
  mode,
  permissions,
  enforcePermissions = false,
  includeDisabled = true,
  includeUnsupportedMode = false,
  includeWorkflowTaskOperations = true,
}: ResolveRuntimeOperationsInput): ResolvedRuntimeOperation[] {
  const lifecycle = resolveLifecycleRuntime({ descriptor, record, processState });
  const permissionSet = permissions ? new Set([...permissions].map(normalizeRuntimeCode)) : null;
  const workflowActionSet = new Set(
    (processState?.workflow?.userTaskActions ?? []).map(normalizeRuntimeCode),
  );
  const hasRecord = Boolean(record);
  const resolved: ResolvedRuntimeOperation[] = [];

  for (const operation of descriptor.operations) {
    const isWorkflowTask = isWorkflowTaskOperation(operation);
    if (isWorkflowTask && !includeWorkflowTaskOperations) continue;

    const reasons: DisabledOperationReason[] = [];
    const surfaceApplies = operationSurfaceAppliesToMode(operation, mode);
    if (!surfaceApplies) {
      if (!includeUnsupportedMode) continue;
      reasons.push(disabled("unsupported_mode", "Action is not available in this view."));
    }

    if (operation.isRecordRequired && !hasRecord) {
      reasons.push(disabled("record_required", "Action requires a saved record."));
    }

    if (!operation.enabled) {
      reasons.push(disabled("handler_disabled", operation.disabledReason ?? "Action is disabled."));
    }

    const processDisabled = readProcessDisabledReason(processState, operation);
    if (processDisabled) reasons.push(processDisabled);

    const lifecycleTransition = operation.lifecycleTransitions?.length
      ? resolveLifecycleTransition(operation, lifecycle)
      : undefined;

    if (operation.lifecycleTransitions?.length) {
      if (lifecycle.terminal) {
        reasons.push(disabled("terminal_state", "Record is in a terminal lifecycle state."));
      } else if (!lifecycleTransition) {
        reasons.push(disabled("wrong_state", "Action is not allowed from the current lifecycle state."));
      }
    }

    if (isWorkflowTask && !operationMatchesCodeSet(operation, workflowActionSet)) {
      reasons.push(disabled("workflow_task_not_assigned", "Workflow task is not assigned to the current user."));
    }

    if (isPermissionDenied(operation)) {
      reasons.push(disabled("missing_permission", "Permission is not granted."));
    }

    if (enforcePermissions && permissionSet && !operationMatchesCodeSet(operation, permissionSet)) {
      reasons.push(disabled("missing_permission", "Permission is not granted."));
    }

    if (reasons.length > 0 && !includeDisabled) continue;

    resolved.push({
      operation,
      enabled: reasons.length === 0,
      disabledReason: reasons[0],
      disabledReasons: reasons,
      lifecycleTransition,
    });
  }

  return resolved.sort((left, right) => left.operation.order - right.operation.order);
}

export function createRuntimeOperationExecutor({
  loadDescriptor,
  loadRecord,
  fetchProcessState,
  handlers,
}: RuntimeOperationExecutorDependencies): RuntimeOperationExecutor {
  return {
    async run(input, principal) {
      const descriptor = await loadDescriptor(input.entityCode);
      if (!descriptor) {
        return failedMutation("descriptor_not_found", `Entity descriptor "${input.entityCode}" was not found.`);
      }

      const operation = descriptor.operations.find((item) => (
        matchesRuntimeCode(item.permissionCode, input.operationCode)
        || matchesRuntimeCode(item.key, input.operationCode)
      ));
      if (!operation) {
        return failedMutation("operation_not_found", `Operation "${input.operationCode}" was not found.`);
      }

      const record = input.recordId ? await loadRecord(input.entityCode, input.recordId) : null;
      const processState = input.recordId
        ? await fetchProcessState(input.entityCode, input.recordId, principal)
        : null;

      const [resolution] = resolveRuntimeOperations({
        descriptor,
        record,
        processState,
        mode: input.recordId ? "detail" : "list",
        permissions: principal?.permissions ?? null,
        enforcePermissions: Boolean(principal?.permissions),
        includeWorkflowTaskOperations: true,
        includeUnsupportedMode: true,
        includeDisabled: true,
      }).filter((item) => item.operation === operation);

      if (!resolution?.enabled) {
        const reason = resolution?.disabledReason ?? disabled("handler_disabled", "Action cannot be executed.");
        return failedMutation(reason.code, reason.message);
      }

      const handler = handlers.find((candidate) => candidate.canHandle(operation));
      if (!handler) {
        return failedMutation("handler_not_found", `No runtime handler is registered for "${operation.handlerType}".`);
      }

      return handler.execute({
        input,
        descriptor,
        operation,
        record,
        processState,
        principal,
      });
    },
  };
}

function resolveLifecycleTransition(
  operation: MetaEntityOperation,
  lifecycle: Pick<ResolvedLifecycleRuntime, "currentState" | "allowedTransitions">,
): NonNullable<MetaEntityOperation["lifecycleTransitions"]>[number] | undefined {
  const transitions = operation.lifecycleTransitions ?? [];
  if (transitions.length === 0) return undefined;

  const currentState = lifecycle.currentState;
  const stateMatches = currentState
    ? transitions.filter((transition) => matchesRuntimeCode(transition.fromState, currentState))
    : transitions;

  if (stateMatches.length === 0) return undefined;
  if (lifecycle.allowedTransitions.length === 0) return stateMatches[0];

  return stateMatches.find((transition) => lifecycle.allowedTransitions.some((allowed) => (
    matchesRuntimeCode(allowed, operation.permissionCode)
    || matchesRuntimeCode(allowed, lastRuntimeCodeSegment(operation.permissionCode))
    || matchesRuntimeCode(allowed, operation.key)
    || matchesRuntimeCode(allowed, transition.transitionId)
    || matchesRuntimeCode(allowed, transition.toState)
    || matchesRuntimeCode(allowed, `${transition.fromState}->${transition.toState}`)
  )));
}

function operationSurfaceAppliesToMode(operation: MetaEntityOperation, mode: RuntimeOperationMode): boolean {
  if (operation.surface === "HIDDEN" || operation.surface === "PALETTE_ONLY") return false;
  if (mode === "list") return operation.surface === "LIST" || operation.surface === "BOTH";
  if (mode === "detail" || mode === "edit") return operation.surface === "DETAIL" || operation.surface === "BOTH";
  if (mode === "new") return !operation.isRecordRequired && (operation.surface === "LIST" || operation.surface === "BOTH");
  return false;
}

function isWorkflowTaskOperation(operation: MetaEntityOperation): boolean {
  return operation.source === "workflow_task" || operation.actionGroup === "workflow_task";
}

function isPermissionDenied(operation: MetaEntityOperation): boolean {
  return operation.permissionDecision ? PERMISSION_DENY_DECISIONS.has(operation.permissionDecision) : false;
}

function readProcessDisabledReason(
  processState: ProcessRuntimeState | null | undefined,
  operation: MetaEntityOperation,
): DisabledOperationReason | undefined {
  const disabledOperations = processState?.disabledOperations;
  if (!disabledOperations) return undefined;
  return disabledOperations[operation.key]
    ?? disabledOperations[operation.permissionCode]
    ?? disabledOperations[lastRuntimeCodeSegment(operation.permissionCode)];
}

function readRecordState(
  record: RuntimeRecordLike | null | undefined,
  candidates: readonly string[],
): string | null {
  if (!record) return null;
  const data = isRecord(record.data) ? record.data : {};
  for (const candidate of candidates) {
    const value = data[candidate] ?? record[candidate];
    const text = toNonBlankString(value);
    if (text) return text;
  }
  return null;
}

function deriveLifecycleDrift(
  source: ProcessRuntimeLifecycleSource,
  currentState: string | null,
  recordStatus: string | null,
): ResolvedLifecycleRuntime["drift"] {
  if (source !== "lifecycle_instance" || !currentState || !recordStatus) return undefined;
  if (matchesRuntimeCode(currentState, recordStatus)) return undefined;
  return {
    lifecycleInstanceState: currentState,
    recordStatus,
  };
}

function operationMatchesCodeSet(operation: MetaEntityOperation, set: Set<string>): boolean {
  if (set.size === 0) return false;
  return [
    operation.key,
    operation.permissionCode,
    lastRuntimeCodeSegment(operation.permissionCode),
    operation.handlerTarget,
  ].some((candidate) => candidate ? set.has(normalizeRuntimeCode(candidate)) : false);
}

function includesRuntimeCode(values: readonly string[], candidate: string): boolean {
  return values.some((value) => matchesRuntimeCode(value, candidate));
}

function matchesRuntimeCode(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return normalizeRuntimeCode(left) === normalizeRuntimeCode(right);
}

function normalizeRuntimeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function lastRuntimeCodeSegment(value: string): string {
  const parts = value.split(/[.:/]+/).filter(Boolean);
  return parts.at(-1) ?? value;
}

function disabled(code: DisabledOperationReason["code"], message: string): DisabledOperationReason {
  return { code, message };
}

function failedMutation(code: string, message: string): RuntimeOperationExecutionResult {
  const errors: RuntimeMutationError[] = [{ code, message }];
  return { errors };
}

function toNonBlankString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
