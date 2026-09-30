import { RecordServiceError } from "./errors.js";
import { resolveRecordMutationPolicy } from "./record-mutation-policy.js";
import { prepareRecordOwnerAccess } from "./record-owner-access.js";
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
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer, command.context, descriptor) && !await allowed(options.authorizer, command, permission, "aggregate")) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, command, transaction, "aggregate", async () => {
    const current = await options.repository.get(descriptor,command.context.tenantId,command.recordId,[],transaction);
    if (!current) return {kind:"NotFound",entityCode:command.entityCode,recordId:command.recordId};
    const currentVersion = versionOf(descriptor,current);
    if (currentVersion !== undefined && currentVersion !== command.expectedVersion)
      return {kind:"VersionConflict",expectedVersion:command.expectedVersion!,currentVersion};
    const record = await options.aggregateExecutor!.execute(descriptor, command, transaction);
    if (!record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
    await appendRecordSideEffects(options, command, transaction, "aggregate", command.recordId);
    const version = versionOf(descriptor, record);
    return { kind: "Committed", action: "aggregate", entityCode: command.entityCode, recordId: command.recordId, record, ...(typeof version === "number" ? { version } : {}), replayed: false };
    }, descriptor);
  });
}

async function create<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: CreateRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  if (!await allowed(options.authorizer, command, descriptor.operations["create"]?.permissionCode, "create")) return { kind: "Forbidden", ...(descriptor.operations["create"]?.permissionCode ? { permissionCode: descriptor.operations["create"].permissionCode } : {}) };
  let parentValues: Record<string, unknown> = {};
  if (command.scopeCoordinate) {
    const resolution = await options.collectionScopes?.resolve({context:command.context,descriptor,operationCode:"read",coordinate:command.scopeCoordinate});
    if (!resolution || resolution.status !== "ready") return {kind:"Forbidden"};
    const parent = resolution.constraints.filter(constraint => constraint.kind === "entity.parent.v1");
    if (parent.length !== 1) return {kind:"Forbidden"};
    parentValues = Object.fromEntries(parent[0]!.predicates.map(predicate => [predicate.field,predicate.value]));
    if (Object.keys(parentValues).some(key => Object.hasOwn(command.input,key))) return {kind:"Forbidden"};
  }
  const ownerPrincipalId = descriptor.ownerAccess ? parentValues[descriptor.ownerAccess.ownerField] : undefined;
  if (ownerPrincipalId !== undefined && typeof ownerPrincipalId !== "string") return {kind:"Forbidden"};
  const effectiveCommand = ownerPrincipalId ? {...command,ownerPrincipalId:ownerPrincipalId as string} : command;
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "create", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "create"));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, descriptor.operations["create"]?.permissionCode, "create")) return {kind:"Forbidden" as const};
    if (Object.keys(await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "create")).length) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, effectiveCommand, transaction, "create", async () => {
      const ownerValues = await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:"create",ownerPrincipalId:effectiveCommand.ownerPrincipalId},transaction);
      const policy=resolveRecordMutationPolicy(descriptor,options.mutationPolicies);
      const values={...command.input,...parentValues,...ownerValues};
      await policy?.validate({context:command.context,descriptor,action:"create",values},transaction);
      const record = await options.repository.create(descriptor, command.context.tenantId, values, transaction);
      if((descriptor.recordPredicates??[]).some(p=>p.operator==="eq"?record[p.field]!==p.value:record[p.field]===p.value))throw new RecordServiceError(400,"RECORD_SCOPE_INVALID","Record is outside the published scope.");
      await policy?.committed({context:command.context,descriptor,record},transaction);
      const recordId = String(record[descriptor.storage.idField] ?? "");
      if (!recordId) throw new Error("Record repository did not return its descriptor id field");
      await appendRecordSideEffects(options, command, transaction, "create", recordId, record);
      return { kind: "Committed", action: "create", entityCode: command.entityCode, recordId, record, version: versionOf(descriptor, record), replayed: false };
    }, descriptor);
  });
}

async function patch<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: PatchRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  const permission = descriptor.operations["patch"]?.permissionCode ?? descriptor.operations["update"]?.permissionCode;
  if (!await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return { kind: "Forbidden", ...(permission ? { permissionCode: permission } : {}) };
  if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
  if (!Object.keys(command.input).length) return { kind: "FieldsNotWritable", fields: { _record: [{ code: "EMPTY_PATCH", message: "At least one field is required" }] } };
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "patch", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "patch"));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return {kind:"Forbidden" as const};
    if (Object.keys(await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "patch")).length) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, command, transaction, "patch", async () => {
      const actorValues = await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:"patch"},transaction);
      const policy=resolveRecordMutationPolicy(descriptor,options.mutationPolicies);
      if(policy){
        const current=await options.repository.get(descriptor,command.context.tenantId,command.recordId,descriptor.fields.map(f=>f.key),transaction);
        if(!current)return {kind:"NotFound",entityCode:command.entityCode,recordId:command.recordId};
        await policy.validate({context:command.context,descriptor,action:"patch",values:{...current,...command.input,...actorValues}},transaction);
      }
      const result = await options.repository.patch(descriptor, command.context.tenantId, command.recordId, {...command.input,...actorValues}, command.expectedVersion, transaction);
      if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict };
      if (!result.record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      await policy?.committed({context:command.context,descriptor,record:result.record},transaction);
      await appendRecordSideEffects(options, command, transaction, "patch", command.recordId, result.record);
      return { kind: "Committed", action: "patch", entityCode: command.entityCode, recordId: command.recordId, record: result.record, version: versionOf(descriptor, result.record), replayed: false };
    }, descriptor);
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
    if (usesEntityBackendAuthorization(options.authorizer, command.context, descriptor) && !await allowed(options.authorizer, command, permission, "delete")) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, command, transaction, "delete", async () => {
      const result = await options.repository.delete(descriptor, command.context.tenantId, command.recordId, command.expectedVersion, transaction);
      if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict };
      if (!result.deleted) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      await appendRecordSideEffects(options, command, transaction, "delete", command.recordId);
      return { kind: "Committed", action: "delete", entityCode: command.entityCode, recordId: command.recordId, replayed: false };
    }, descriptor);
  });
}

async function safeDescriptor(metadata: MetadataReader, command: { context: CreateRecordCommand["context"]; entityCode: string }) {
  try { return await descriptorFor(metadata, command.context, command.entityCode); }
  catch (error) {
    if (error instanceof RecordServiceError && error.code === "ENTITY_DESCRIPTOR_NOT_FOUND") return null;
    throw error;
  }
}
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
function versionOf(descriptor: { storage: { versionField?: string } }, record: Readonly<Record<string, unknown>>): number | undefined { const value = descriptor.storage.versionField ? record[descriptor.storage.versionField] : undefined; const numeric = typeof value === "number" || typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : NaN; return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined; }
