import type { Kysely, Transaction } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkflowRuntimeDb = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkflowRuntimeTransaction = Transaction<any>;

export interface WorkflowRuntimeLogger {
  error(event: string, fields?: Record<string, unknown>): void;
  info?(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
}

export interface WorkflowRuntimeFeatureFlags {
  bulkCheck(codes: string[], tenantId?: string): Promise<Map<string, boolean>>;
}

/** Minimal structural view of the API execution descriptor used by workflow. */
export interface WorkflowExecutionDescriptorProvider {
  get(identity: {
    plane: "mesh";
    tenantId: string;
    entityCode: string;
  }): Promise<{
    descriptor: {
      storage: {
        schema: string;
        table: string;
        primaryKey: string;
        tenantColumn: string | null;
        writeCapability: string;
      };
    };
  }>;
}

export interface RuntimeEntityStorage {
  schema: string;
  table: string;
  primaryKey: string;
  tenantColumn: string | null;
  writeCapability?: string;
}

export interface ExecuteOperationCommand {
  tenantId: string;
  entityName: string;
  entityId: string;
  operationCode: string;
  actorId: string;
  idempotencyKey?: string;
  remarks?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export interface CanExecuteOperationQuery {
  tenantId: string;
  entityName: string;
  entityId: string;
  operationCode: string;
  actorId: string;
  payload?: Record<string, unknown>;
}

export interface SubmitWorkflowCommand {
  tenantId: string;
  entityName: string;
  entityId: string;
  actorId: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export interface WorkItemActionCommand {
  tenantId: string;
  workItemId: string;
  actorId: string;
  action: string;
  comment?: string;
  delegateTo?: string;
}

export interface TimerTickCommand {
  tenantId: string;
  entityName: string;
  entityId: string;
  timerPolicyId?: string;
  actorId?: string;
}

export interface RuntimeErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface OperationResult {
  ok: boolean;
  statusCode: number;
  entityName: string;
  entityId: string;
  operationCode: string;
  replayed?: boolean;
  record?: Record<string, unknown>;
  workflowRequestId?: string;
  lifecycle?: {
    instanceId?: string;
    transitionId?: string;
    lifecycleId?: string;
    fromState?: string;
    toState?: string;
  };
  error?: RuntimeErrorBody;
}

export interface OperationEligibility {
  allowed: boolean;
  entityName: string;
  entityId: string;
  operationCode: string;
  reason?: RuntimeErrorBody;
  record?: Record<string, unknown>;
  lifecycle?: OperationResult["lifecycle"];
}

export interface WorkflowSubmissionResult {
  workflowRequestId: string;
  status: string;
  isExisting?: boolean;
}

export interface WorkflowActionResult {
  ok: boolean;
  statusCode: number;
  workItemId: string;
}

export interface TimerTickResult {
  ok: boolean;
  statusCode: number;
}

export interface WorkflowLifecycleRuntime {
  executeOperation(command: ExecuteOperationCommand): Promise<OperationResult>;
  canExecuteOperation(query: CanExecuteOperationQuery): Promise<OperationEligibility>;
  submitWorkflow(command: SubmitWorkflowCommand): Promise<WorkflowSubmissionResult>;
  processWorkItemAction(command: WorkItemActionCommand): Promise<WorkflowActionResult>;
  evaluateTimerTick(command: TimerTickCommand): Promise<TimerTickResult>;
}

export interface RuntimeSourceMutationContext {
  tenantId: string;
  entityName: string;
  entityId: string;
  actorId: string;
  operationCode: string;
  fromStatus: string;
  toStatus: string;
  workflowRequestId?: string;
  remarks?: string;
  payload: Record<string, unknown>;
  storage?: RuntimeEntityStorage;
}

export interface RuntimeSourceMutationResult {
  record: Record<string, unknown>;
}

export interface RuntimeEntityAdapter {
  sourceTable: string;
  applyOperation(
    trx: WorkflowRuntimeTransaction,
    context: RuntimeSourceMutationContext,
  ): Promise<RuntimeSourceMutationResult>;
  postMutationHook?(
    command: ExecuteOperationCommand,
    result: OperationResult,
    trx: WorkflowRuntimeTransaction,
  ): Promise<void>;
}
