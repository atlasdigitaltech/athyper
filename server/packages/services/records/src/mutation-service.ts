import { authorizeEntityOperation } from "@athyper/server-contract-auth";
import { meaningfulFormInput } from "@athyper/contract-platform-entity-runtime";
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
  if (descriptor.formPresentation?.meaningfulFields && !meaningfulFormInput(command.input, descriptor.formPresentation.meaningfulFields)) return { kind: "ValidationFailed", code: "ENTITY_EMPTY_SETUP", message: "Enter a value before saving." };
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "create", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "create"));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, descriptor.operations["create"]?.permissionCode, "create")) return {kind:"Forbidden" as const};
    if (Object.keys(await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "create")).length) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, effectiveCommand, transaction, "create", async () => {
      const ownerValues = await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:"create",ownerPrincipalId:effectiveCommand.ownerPrincipalId},transaction);
      const policy=resolveRecordMutationPolicy(descriptor,options.mutationPolicies);
      const values={...command.input,...parentValues,...ownerValues};
      await validateReferences(options, command.context, descriptor, values, command.input);
      await policy?.validate({context:command.context,descriptor,action:"create",values},transaction);
      const record = await options.repository.create(descriptor, command.context.tenantId, values, transaction);
      if((descriptor.recordPredicates??[]).some(p=>p.operator==="eq"?record[p.field]!==p.value:record[p.field]===p.value))throw new RecordServiceError(400,"RECORD_SCOPE_INVALID","Record is outside the published scope.");
      await policy?.committed({context:command.context,descriptor,record},transaction);
      const recordId = String(record[descriptor.storage.idField] ?? "");
      if (!recordId) throw new Error("Record repository did not return its descriptor id field");
      await appendRecordSideEffects(options, command, transaction, "create", recordId, record);
      return { kind: "Committed", action: "create", entityCode: command.entityCode, recordId, record, version: versionOf(descriptor, record), replayed: false };
    }, descriptor);
  }).catch((error: unknown) => {
    if (error && typeof error === "object" && Reflect.get(error, "code") === "23505" && Reflect.get(error, "schema") === descriptor.storage.schema && Reflect.get(error, "table") === descriptor.storage.object) throw new RecordServiceError(409, "RECORD_ALREADY_EXISTS", "A record already exists. Reload the section to review it.");
    throw error;
  });
}

async function patch<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: PatchRecordCommand): Promise<RecordMutationResult> {
  const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
  const descriptor = await safeDescriptor(options.metadata, command);
  if (!descriptor) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
  const permission = (descriptor.operations["patch"] ?? descriptor.operations["update"])?.permissionCode;
  if (!await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return { kind: "Forbidden", ...(permission ? { permissionCode: permission } : {}) };
  if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
  if (!Object.keys(command.input).length) return { kind: "FieldsNotWritable", fields: { _record: [{ code: "EMPTY_PATCH", message: "At least one field is required" }] } };
  const fields = mergeFieldViolations(validateRecordInput(descriptor, "patch", command.input), await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "patch"));
  if (Object.keys(fields).length) return { kind: "FieldsNotWritable", fields };
  const moving = Boolean(descriptor.hierarchy && Object.hasOwn(command.input, descriptor.hierarchy.parentField));
  // A declared hierarchy's parent changes only when it is movable, that is,
  // when the database guards cycles for it (Tree blueprint B4).
  if (moving && !descriptor.hierarchy!.movable) throw new RecordServiceError(409, "HIERARCHY_MOVE_UNAVAILABLE", "Records in this hierarchy cannot be moved.");
  return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
    if (usesEntityBackendAuthorization(options.authorizer,command.context,descriptor) && !await allowed(options.authorizer, command, permission, descriptor.operations["patch"] ? "patch" : "update")) return {kind:"Forbidden" as const};
    if (Object.keys(await validateFieldWriteAuthorization(options.authorizer, command.context, descriptor, command.input, "patch")).length) return { kind: "Forbidden" as const };
    return executeRecordCommand(options, command, transaction, "patch", async () => {
      const actorValues = await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:"patch"},transaction);
      if (moving) await guardHierarchyMove(options, command, descriptor, transaction);
      const policy=resolveRecordMutationPolicy(descriptor,options.mutationPolicies);
      if(policy || descriptor.ownerAccess || descriptor.fields.some(field => field.keyReference)){
        const current=await options.repository.get(descriptor,command.context.tenantId,command.recordId,descriptor.fields.map(f=>f.key),transaction);
        if(!current)return {kind:"NotFound",entityCode:command.entityCode,recordId:command.recordId};
        if (descriptor.ownerAccess) {
          const owner = current[descriptor.ownerAccess.ownerField];
          if (typeof owner !== "string" || !owner) throw new RecordServiceError(403,"ENTITY_OWNER_ACCESS_DENIED","Record ownership is unavailable.");
          await prepareRecordOwnerAccess(options.ownerAccess,{context:command.context,descriptor,operation:"patch",ownerPrincipalId:owner},transaction);
        }
        const values={...current,...command.input,...actorValues};
        await validateReferences(options, command.context, descriptor, values, command.input);
        await policy?.validate({context:command.context,descriptor,action:"patch",values},transaction);
      }
      let result: Awaited<ReturnType<typeof options.repository.patch>>;
      try {
        result = await options.repository.patch(descriptor, command.context.tenantId, command.recordId, {...command.input,...actorValues}, command.expectedVersion, transaction);
      } catch (error) {
        // Only the parent write's own refusals are hierarchy refusals.
        if (moving) mapHierarchyRefusal(error);
        throw error;
      }
      if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict };
      if (!result.record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      await policy?.committed({context:command.context,descriptor,record:result.record},transaction);
      await appendRecordSideEffects(options, command, transaction, "patch", command.recordId, result.record);
      return { kind: "Committed", action: "patch", entityCode: command.entityCode, recordId: command.recordId, record: result.record, version: versionOf(descriptor, result.record), replayed: false };
    }, descriptor);
  }).catch(async (error: unknown) => {
    // A deferred parent foreign key is checked at commit: map it only when the
    // refusal is this table's parent key, never another column's error.
    if (moving && (await deferredParentRefusal(error, descriptor, options.repository))) throw new RecordServiceError(409, "HIERARCHY_PARENT_OUTSIDE_SCOPE", "Choose a parent in this tree.");
    throw error;
  });
}

/** Framework checks for a move (Tree blueprint section 5.6): the new parent is
 * in the record's scope, may have children by its node kind, and leaves the
 * moved subtree within the maximum depth. Cycles stay with the database. */
async function guardHierarchyMove<Transaction>(options: RecordMutationServiceOptions<Transaction>, command: PatchRecordCommand, descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor, transaction: Transaction): Promise<void> {
  const hierarchy = descriptor.hierarchy!;
  if (!options.repository.measureHierarchy) throw new RecordServiceError(409, "HIERARCHY_MOVE_UNAVAILABLE", "Records in this hierarchy cannot be moved.");
  const target = command.input[hierarchy.parentField];
  if (target !== null && (typeof target !== "string" || !target)) throw new RecordServiceError(409, "HIERARCHY_PARENT_OUTSIDE_SCOPE", "Choose a parent in this tree.");
  const keys = [hierarchy.parentField, ...(hierarchy.scopeField ? [hierarchy.scopeField] : []), ...(hierarchy.nodeKind ? [hierarchy.nodeKind.field] : [])];
  const current = await options.repository.get(descriptor, command.context.tenantId, command.recordId, keys, transaction);
  if (!current) return; // the patch reports NotFound
  if (target) {
    const parent = await options.repository.get(descriptor, command.context.tenantId, target, keys, transaction);
    const scope = hierarchy.scopeField;
    const nextScope = scope && Object.hasOwn(command.input, scope) ? command.input[scope] : scope ? current[scope] : undefined;
    if (!parent || (scope && parent[scope] !== nextScope)) throw new RecordServiceError(409, "HIERARCHY_PARENT_OUTSIDE_SCOPE", "Choose a parent in this tree.");
    const kind = hierarchy.nodeKind;
    if (kind) {
      const value = parent[kind.field];
      const branch = kind.kind === "boolean" ? value === kind.branchWhen : typeof value === "string" && kind.branchValues.includes(value);
      if (!branch) throw new RecordServiceError(409, "HIERARCHY_LEAF_PARENT", "This record cannot have records under it.");
    }
  }
  // A cycle must pass through the record's own ancestor chain: refuse the
  // record itself or any of its descendants as the new parent. The database
  // remains the backstop for what the framework cannot see.
  if (target === command.recordId) throw new RecordServiceError(409, "HIERARCHY_CYCLE", "A record cannot be moved under itself or a record below it.");
  const measured = await options.repository.measureHierarchy({ descriptor, tenantId: command.context.tenantId, parentField: hierarchy.parentField, parentId: target ?? null, recordId: command.recordId, bound: hierarchy.maxDepth + 1 }, transaction);
  if (measured.parentChainIncludesRecord) throw new RecordServiceError(409, "HIERARCHY_CYCLE", "A record cannot be moved under itself or a record below it.");
  if (measured.parentDepth + measured.subtreeHeight > hierarchy.maxDepth) throw new RecordServiceError(409, "HIERARCHY_DEPTH_EXCEEDED", `This move would go deeper than ${hierarchy.maxDepth} levels.`);
}

/** Whether a commit-time foreign-key refusal concerns this table's parent key.
 * PostgreSQL names the table and constraint; it names the key columns
 * ("Key (…, parent_id)=…") only to roles with full column privileges, so a
 * redacted detail is resolved through the constraint's catalog entry. */
export async function deferredParentRefusal(error: unknown, descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor, repository: Pick<import("@athyper/server-contract-records").RecordRepository<unknown>, "selfReferenceKeyColumns">): Promise<boolean> {
  if (!error || typeof error !== "object" || Reflect.get(error, "code") !== "23503") return false;
  if (Reflect.get(error, "table") !== descriptor.storage.object) return false;
  const schema = Reflect.get(error, "schema");
  if (schema !== undefined && schema !== descriptor.storage.schema) return false;
  const parentPath = descriptor.fields.find((field) => field.key === descriptor.hierarchy?.parentField)?.storagePath;
  if (!parentPath) return false;
  const detail = String(Reflect.get(error, "detail") ?? "");
  const named = /^Key \(([^)]*)\)/.exec(detail)?.[1]?.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
  if (named) return named.includes(parentPath);
  const constraint = Reflect.get(error, "constraint");
  if (typeof constraint !== "string" || !constraint || !repository.selfReferenceKeyColumns) return false;
  const columns = await repository.selfReferenceKeyColumns(descriptor, constraint).catch(() => undefined);
  return Boolean(columns?.includes(parentPath));
}

/** The database is the final authority (section 7.5): refusals of the parent
 * write map to two codes, without the database's own message text. */
function mapHierarchyRefusal(error: unknown): void {
  const code = error && typeof error === "object" ? Reflect.get(error, "code") : undefined;
  if (code === "23503") throw new RecordServiceError(409, "HIERARCHY_PARENT_OUTSIDE_SCOPE", "Choose a parent in this tree.");
  if (code === "23514") throw new RecordServiceError(409, "HIERARCHY_REJECTED", "This move breaks the hierarchy's rules.");
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
  return (await authorizeEntityOperation(authorizer, {
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
  })).allowed;
}
function versionOf(descriptor: { storage: { versionField?: string } }, record: Readonly<Record<string, unknown>>): number | undefined { const value = descriptor.storage.versionField ? record[descriptor.storage.versionField] : undefined; const numeric = typeof value === "number" || typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : NaN; return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined; }

/** Validate submitted references through the same authorized resolver as choices.
 * A database FK alone proves existence, not permission to select the target. */
async function validateReferences<Transaction>(options: RecordMutationServiceOptions<Transaction>, context: CreateRecordCommand["context"], descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor, values: Readonly<Record<string,unknown>>, input: Readonly<Record<string,unknown>>) {
  for (const field of descriptor.fields) {
    const reference=field.keyReference;
    if (!reference || !reference.fields.some(mapping => Object.hasOwn(input,mapping.source))) continue;
    const value=values[field.key];
    if (value === null || value === undefined) continue;
    if (!options.referenceChoices) throw new RecordServiceError(503,"ENTITY_REFERENCE_VALIDATION_UNAVAILABLE","Reference validation is unavailable.");
    if (typeof value !== "string" || !value) throw new RecordServiceError(400,"ENTITY_REFERENCE_INVALID","Choose an available reference.");
    const dependencies: Record<string,string>={};
    for (const mapping of reference.fields.filter(mapping => mapping.source !== field.key)) {
      const dependency=values[mapping.source];
      if (typeof dependency !== "string" || !dependency) throw new RecordServiceError(400,"ENTITY_REFERENCE_INVALID","Choose the reference context first.");
      dependencies[mapping.source]=dependency;
    }
    const page=await options.referenceChoices(context,descriptor.entityCode,{field:field.key,value,...(Object.keys(dependencies).length ? {dependencies} : {})});
    if (page.options.length !== 1 || page.options[0]?.value !== value) throw new RecordServiceError(400,"ENTITY_REFERENCE_INVALID","Choose an available reference.");
  }
}
