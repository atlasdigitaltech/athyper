import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  fingerprintCommand,
  parseIdempotencyKey,
  type CommandExecutionStore,
  type OutboxWriter,
} from "@athyper/server-contract-events";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordAggregateExecutor, RecordMutationResult, RecordRepository, RecordTransactionCoordinator } from "@athyper/server-contract-records";

export interface RecordExecutionOptions<Transaction> {
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly commandExecutions: CommandExecutionStore<Transaction, RecordMutationResult>;
  readonly repository: RecordRepository<Transaction>;
  readonly transactions: RecordTransactionCoordinator<Transaction>;
  readonly aggregateExecutor?: RecordAggregateExecutor<Transaction>;
}

type IdempotentRecordCommand = {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly idempotencyKey?: string;
  readonly recordId?: string;
  readonly transitionCode?: string;
  readonly expectedVersion?: number;
  readonly input?: Readonly<Record<string, unknown>>;
};

export function idempotencyFailure(command: IdempotentRecordCommand): RecordMutationResult | undefined {
  const key = parseIdempotencyKey(command.idempotencyKey);
  return key.ok ? undefined : { kind: "IdempotencyConflict", reason: key.reason };
}

export async function executeRecordCommand<Transaction>(
  options: RecordExecutionOptions<Transaction>,
  command: IdempotentRecordCommand,
  transaction: Transaction,
  action: "create" | "patch" | "delete" | "transition" | "aggregate",
  work: () => Promise<RecordMutationResult>,
): Promise<RecordMutationResult> {
  const key = parseIdempotencyKey(command.idempotencyKey);
  if (!key.ok) return { kind: "IdempotencyConflict", reason: key.reason };
  const commandCode = `records.${command.entityCode}.${action}`;
  const requestFingerprint = fingerprintCommand({
    principalId: command.context.principalId,
    entityCode: command.entityCode,
    action,
    recordId: command.recordId,
    transitionCode: command.transitionCode,
    expectedVersion: command.expectedVersion,
    input: command.input,
  });
  const begun = await options.commandExecutions.begin({
    tenantId: command.context.tenantId,
    commandCode,
    idempotencyKey: key.value,
    requestFingerprint,
    actorPrincipalId: command.context.principalId,
    sourceService: "records",
    ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}),
  }, transaction);
  if (begun.kind === "conflict") return { kind: "IdempotencyConflict", reason: "reused" };
  if (begun.kind === "in_progress") return { kind: "IdempotencyConflict", reason: "in_progress" };
  if (begun.kind === "replay") {
    return begun.result.kind === "Committed" ? { ...begun.result, replayed: true } : begun.result;
  }
  const result = await work();
  await options.commandExecutions.complete(begun.executionId, result, command.context.principalId, transaction);
  return result;
}

export async function appendRecordSideEffects<Transaction>(
  options: RecordExecutionOptions<Transaction>,
  command: { context: VerifiedRequestContext; entityCode: string; idempotencyKey?: string },
  transaction: Transaction,
  action: "create" | "patch" | "delete" | "transition" | "aggregate",
  recordId: string,
  record?: Readonly<Record<string, unknown>>,
): Promise<void> {
  await options.outbox.append({ tenantId: command.context.tenantId, topic: "records", eventType: eventType(action), ...(command.idempotencyKey ? { eventKey: command.idempotencyKey } : {}), entityType: command.entityCode, entityId: recordId, actorId: command.context.principalId, correlationId: command.context.correlationId, payload: { action, entityCode: command.entityCode, recordId, ...(record ? { record } : {}) } }, transaction);
  await options.audit.record({ eventCode: eventType(action), action, outcome: "success", actor: { kind: "user", principalId: command.context.principalId }, tenantId: command.context.tenantId, entityType: command.entityCode, entityId: recordId, requestId: command.context.requestId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
}

function eventType(action: "create" | "patch" | "delete" | "transition" | "aggregate"): string {
  const pastTense = { create: "created", patch: "patched", delete: "deleted", transition: "transitioned", aggregate: "aggregate_mutated" } as const;
  return `records.record.${pastTense[action]}`;
}
