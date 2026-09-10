import { usesEntityBackendAuthorization } from "./entity-backend-authorizer.js";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { Authorizer } from "@athyper/server-contract-auth";
import type {
  CreateRecordCommand,
  DeleteRecordCommand,
  AggregateRecordCommand,
  PatchRecordCommand,
  RecordMutationResult,
  RecordMutationService,
} from "@athyper/server-contract-records";
import { mergeFieldViolations, validateFieldWriteAuthorization, validateRecordInput } from "./field-validation.js";
import { createRecordLifecycleService } from "./lifecycle-service.js";
import { descriptorFor } from "./query-service.js";
import { appendRecordSideEffects, executeRecordCommand, idempotencyFailure, type RecordExecutionOptions } from "./record-execution.js";

export type RecordMutationServiceOptions<Transaction> = RecordExecutionOptions<Transaction>;

export function createRecordMutationService<Transaction>(options: RecordMutationServiceOptions<Transaction>): RecordMutationService {
  const lifecycle = createRecordLifecycleService(options);
  return {
    create: (command) => create(options, command),
    patch: (command) => patch(options, command),
    delete: (command) => remove(options, command),
    transition: (command) => lifecycle.transition(command),
    mutateAggregate: (command) => mutateAggregate(options, command),
  };
}

async function mutateAggregate<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: AggregateRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor || !options.aggregateExecutor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  const permission = descriptor.operations["aggregate"]?.permissionCode;
  if (!await allowed(options.authorizer, command, permission, "aggregate")) return { kind: "Forbidden", ...(permission ? { permissionCode: permission } : {}) };
  if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
  const definitions = new Map((descriptor.aggregate?.collections ?? []).map((collection) => [collection.code, collection]));
  for (const [code, changes] of Object.entries(command.changes.collections)) {
    const definition = definitions.get(code);
    if (!definition) return { kind: "IncompatibleAction", action: "aggregate", reason: `Aggregate collection is not descriptor-owned: ${code}` };
    const used = ([changes.create?.length && "create", changes.update?.length && "update", changes.delete?.length && "delete", changes.replace?.length && "replace"] as const).filter(Boolean) as ("create" | "update" | "delete" | "replace")[];
    if (used.some((operation) => !definition.allowedOperations.includes(operation))) return { kind: "IncompatibleAction", action: "aggregate", reason: `Aggregate operation is not published for ${code}` };
  }
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, (transaction) => executeRecordCommand(options, command, transaction, "aggregate", async () => {
    const record = await options.aggregateExecutor!.execute(descriptor, command, transaction);
    if (!record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
    await appendRecordSideEffects(options, command, transaction, "aggregate", command.recordId);
    const version = descriptor.storage.versionField ? record[descriptor.storage.versionField] : undefined;
    return { kind: "Committed", action: "aggregate", entityCode: command.entityCode, recordId: command.recordId, record, ...(typeof version === "number" ? { version } : {}), replayed: false };
  }));
}

async function create<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: CreateRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  if (!await allowed(options.authorizer, command, descriptor.operations["create"]?.permissionCode, "create")) return { kind: "Forbidden", ...(descriptor.operations["create"]?.permissionCode ? { permissionCode: descriptor.operations["create"].permissionCode } : {}) };
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "create", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, descriptor.operations["create"]?.permissionCode, "create")) return {kind:"Forbidden" as const};
    return executeRecordCommand(options, command, transaction, "create", async () => {
      const record = await options.repository.create(descriptor, command.context.tenantId, command.input, transaction);
      const recordId = String(record[descriptor.storage.idField] ?? "");
      if (!recordId) throw new Error("Record repository did not return its descriptor id field");
      await appendRecordSideEffects(options, command, transaction, "create", recordId, record);
      return { kind: "Committed", action: "create", entityCode: command.entityCode, recordId, record, version: versionOf(descriptor, record), replayed: false };
    });
  });
}

async function patch<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: PatchRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  const permission = descriptor.operations["patch"]?.permissionCode ?? descriptor.operations["update"]?.permissionCode;
  if (!await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return { kind: "Forbidden", ...(permission ? { permissionCode: permission } : {}) };
  if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "patch", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return {kind:"Forbidden" as const};
    return executeRecordCommand(options, command, transaction, "patch", async () => {
      const result = await options.repository.patch(descriptor, command.context.tenantId, command.recordId, command.input, command.expectedVersion, transaction);
      if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict };
      if (!result.record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      await appendRecordSideEffects(options, command, transaction, "patch", command.recordId, result.record);
      return { kind: "Committed", action: "patch", entityCode: command.entityCode, recordId: command.recordId, record: result.record, version: versionOf(descriptor, result.record), replayed: false };
    });
  });
}

async function remove<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: DeleteRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  const permission = descriptor.operations["delete"]?.permissionCode;
  if (!await allowed(options.authorizer, command, permission, "delete")) return { kind: "Forbidden", ...(permission ? { permissionCode: permission } : {}) };
  if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    return executeRecordCommand(options, command, transaction, "delete", async () => {
      const result = await options.repository.delete(descriptor, command.context.tenantId, command.recordId, command.expectedVersion, transaction);
      if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict };
      if (!result.deleted) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      await appendRecordSideEffects(options, command, transaction, "delete", command.recordId);
      return { kind: "Committed", action: "delete", entityCode: command.entityCode, recordId: command.recordId, replayed: false };
    });
  });
}

async function safeDescriptor(metadata: MetadataReader, command: { context: CreateRecordCommand["context"]; entityCode: string }) { try { return await descriptorFor(metadata, command.context, command.entityCode); } catch { return null; } }
async function allowed(
  authorizer: Authorizer,
  command: { context: CreateRecordCommand["context"]; entityCode: string; recordId?: string; input?: Readonly<Record<string,unknown>> },
  permissionCode: string | undefined,
  operationKey: string,
): Promise<boolean> {
  return Boolean(permissionCode && (await authorizer.authorize({
    context: command.context,
    permissionCode,
    resource: {
      tenantId: command.context.tenantId,
      entityCode: command.entityCode,
      operationKey,
      resourceCode: command.entityCode,
      ...(command.input ? { authorizationWriteFields: Object.keys(command.input) } : {}),
      ...(command.recordId ? { recordId: command.recordId } : {}),
    },
  })).allowed);
}
function versionOf(descriptor: { storage: { versionField?: string } }, record: Readonly<Record<string, unknown>>): number | undefined { const value = descriptor.storage.versionField ? record[descriptor.storage.versionField] : undefined; return typeof value === "number" ? value : undefined; }
