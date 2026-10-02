import { assertLocalRecordSource, type RecordSourceAuthorityResolver } from "./record-source-authority.js";
import { prepareRecordOwnerAccess, type RecordOwnerAccessAdapter } from "./record-owner-access.js";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  fingerprintCommand,
  parseIdempotencyKey,
  type CommandExecutionStore,
  type OutboxWriter,
} from "@athyper/server-contract-events";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordAggregateExecutor, RecordMutationResult, RecordRepository, RecordTransactionCoordinator } from "@athyper/server-contract-records";

export interface RecordHistoryHook<Transaction> {
  prepare(input: { command: IdempotentRecordCommand; action: "create" | "patch" | "delete" | "transition" | "aggregate" | "domain"; descriptor: EntityRuntimeDescriptor }, transaction: Transaction): Promise<((result: RecordMutationResult) => Promise<void>) | undefined>;
}
export interface RecordExecutionOptions<Transaction> {
  readonly referenceChoices?: import("./entity-list-service.js").EntityListService["referenceChoices"];
  readonly mutationPolicies?: ReadonlyMap<string,import("./record-mutation-policy.js").RecordMutationPolicy<Transaction>>;
  readonly ownerAccess?: RecordOwnerAccessAdapter<Transaction>;
  readonly collectionScopes?: import("@athyper/server-contract-records").RecordCollectionScopeResolver;
  readonly history?: RecordHistoryHook<Transaction>;
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly commandExecutions: CommandExecutionStore<Transaction, RecordMutationResult>;
  readonly repository: RecordRepository<Transaction>;
  readonly transactions: RecordTransactionCoordinator<Transaction>;
  readonly sourceAuthorities?: ReadonlyMap<string, RecordSourceAuthorityResolver<Transaction>>;
  readonly aggregateExecutor?: RecordAggregateExecutor<Transaction>;
}

export type IdempotentRecordCommand = {
  readonly scopeCoordinate?: import("@athyper/server-contract-records").RecordListScopeCoordinate;
  readonly ownerPrincipalId?: string;
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly idempotencyKey?: string;
  readonly recordId?: string;
  readonly transitionCode?: string;
  readonly expectedVersion?: number;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly actionCode?: string;
  readonly changes?: import("@athyper/server-contract-records").AggregateChangeSet;
  readonly planHash?: string;
  readonly requestHash?: string;
  readonly transition?: { readonly code: string; readonly payload?: Readonly<Record<string, unknown>> };
};

export function idempotencyFailure(command: IdempotentRecordCommand): RecordMutationResult | undefined {
  const key = parseIdempotencyKey(command.idempotencyKey);
  return key.ok ? undefined : { kind: "IdempotencyConflict", reason: key.reason };
}

export async function executeRecordCommand<Transaction>(
  options: RecordExecutionOptions<Transaction>,
  command: IdempotentRecordCommand,
  transaction: Transaction,
  action: "create" | "patch" | "delete" | "transition" | "aggregate" | "domain",
  work: () => Promise<RecordMutationResult>,
  descriptor?: EntityRuntimeDescriptor,
): Promise<RecordMutationResult> {
  const key = parseIdempotencyKey(command.idempotencyKey);
  if (!key.ok) return { kind: "IdempotencyConflict", reason: key.reason };
  const commandCode = `records.${command.entityCode}.${action}`;
  const requestFingerprint = fingerprintCommand({
    principalId: command.context.principalId,
    ...(command.scopeCoordinate ? {scopeCoordinate:command.scopeCoordinate} : {}),
    ...(command.ownerPrincipalId ? {ownerPrincipalId:command.ownerPrincipalId} : {}),
    entityCode: command.entityCode,
    action,
    recordId: command.recordId,
    transitionCode: command.transitionCode,
    expectedVersion: command.expectedVersion,
    input: command.input,
    actionCode: command.actionCode, changes: command.changes, planHash: command.planHash, requestHash: command.requestHash, transition: command.transition,
  });
  if (descriptor) await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:action,ownerPrincipalId:command.ownerPrincipalId},transaction);
  if (descriptor?.ownerAccess?.sourceAuthority) {
    if (action !== "create" && action !== "patch") throw new Error("ENTITY_SOURCE_OPERATION_UNSUPPORTED");
    let subject = command.ownerPrincipalId ?? command.context.principalId;
    if (action === "patch") {
      if (!command.recordId) throw new Error("ENTITY_SOURCE_RECORD_REQUIRED");
      const current = await options.repository.get(descriptor, command.context.tenantId, command.recordId, [descriptor.ownerAccess.ownerField], transaction);
      if (!current) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      const owner = current[descriptor.ownerAccess.ownerField];
      if (typeof owner !== "string" || !owner) throw new Error("ENTITY_SOURCE_OWNER_UNAVAILABLE");
      subject = owner;
      await prepareRecordOwnerAccess(options.ownerAccess, { context: command.context, descriptor, operation: action, ownerPrincipalId: subject }, transaction);
    }
    await assertLocalRecordSource(options.sourceAuthorities?.get(descriptor.ownerAccess.sourceAuthority), { context: command.context, ownerPrincipalId: subject }, transaction);
  }
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
    if(descriptor?.ownerAccess && begun.result.kind === "Committed"){
      const owner=begun.result.record?.[descriptor.ownerAccess.ownerField];
      if(typeof owner!=="string")throw Error("RECORD_REPLAY_OWNER_REQUIRED");
      await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:action,ownerPrincipalId:owner},transaction);
    }
    return begun.result.kind === "Committed" ? { ...begun.result, replayed: true } : begun.result;
  }
  if (options.history && !descriptor) throw Error("RECORD_HISTORY_DESCRIPTOR_REQUIRED");
  const history = options.history && descriptor ? await options.history.prepare({command, action, descriptor}, transaction) : undefined;
  const result = await work();
  if (result.kind === "Committed") await history?.(result);
  await options.commandExecutions.complete(begun.executionId, result, command.context.principalId, transaction);
  return result;
}

export async function appendRecordSideEffects<Transaction>(
  options: RecordExecutionOptions<Transaction>,
  command: { context: VerifiedRequestContext; entityCode: string; idempotencyKey?: string },
  transaction: Transaction,
  action: "create" | "patch" | "delete" | "transition" | "aggregate" | "domain",
  recordId: string,
  record?: Readonly<Record<string, unknown>>,
): Promise<void> {
  await options.outbox.append({ tenantId: command.context.tenantId, topic: "records", eventType: eventType(action), ...(command.idempotencyKey ? { eventKey: command.idempotencyKey } : {}), entityType: command.entityCode, entityId: recordId, actorId: command.context.principalId, correlationId: command.context.correlationId, payload: { action, entityCode: command.entityCode, recordId, ...(record ? { record } : {}) } }, transaction);
  await options.audit.record({ eventCode: eventType(action), action, outcome: "success", actor: { kind: "user", principalId: command.context.principalId }, tenantId: command.context.tenantId, entityType: command.entityCode, entityId: recordId, requestId: command.context.requestId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}) }, transaction);
}

function eventType(action: "create" | "patch" | "delete" | "transition" | "aggregate" | "domain"): string {
  const pastTense = { create: "created", patch: "patched", delete: "deleted", transition: "transitioned", aggregate: "aggregate_mutated", domain: "domain_mutated" } as const;
  return `records.record.${pastTense[action]}`;
}
