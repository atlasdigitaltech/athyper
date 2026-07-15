import { createHash, randomUUID } from "node:crypto";

import { EntityCapabilityManifestSchema, type EntityCapabilityManifest } from "@athyper/api-contracts/metadata";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ExecutionDescriptorProvider, ExecutionDescriptorV1 } from "@athyper/svc-metadata";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import {
  coerceArrayFields,
  emitOutboxEvent,
  resolveConcurrencyPolicy,
  serializeJsonFields,
  verifyLock,
  buildDurableMutationEventKey,
  writeRequiredRouteAudit,
  executeDurableMutationTransaction,
} from "@athyper/svc-shared";

import type {
  AggregateMutationCommand,
  CreateEntityCommand,
  DeleteEntityCommand,
  EntityMutationService,
  MutationResult,
  PatchEntityCommand,
  TransitionEntityCommand,
} from "./entity-mutation.types.js";
import {
  hasFieldViolations,
  validateCompiledWriteFields,
  type MutationFieldDecision,
  type MutationFieldViolations,
} from "./field-validation.js";
import {
  getEntityMutationHandler,
  runEntityMutationHandlerBeforePersist,
  type EntityMutationHandler,
  type TransactionalMutationContext,
} from "./entity-mutation-handler.registry.js";
import {
  AggregateCollectionPlanError,
  compileAggregateCollectionExecutionPlan,
} from "./aggregate-collection-executor.js";

type AnyDb = Kysely<Record<string, any>>;

interface CompiledMutationTarget {
  descriptor: ExecutionDescriptorV1;
  generation: string;
  manifest: EntityCapabilityManifest;
  tableSchema: string;
  tableName: string;
  concurrencyPolicy: Record<string, unknown>;
  createMode: string;
  relationTargets: ReadonlyMap<string, { tableSchema: string; tableName: string; primaryKey: string; tenantColumn: string }>;
}

export interface RegisteredMutationHandlerContext<TCommand> {
  trx: AnyDb;
  command: TCommand;
  target: CompiledMutationTarget;
  currentRecord: Record<string, unknown>;
}

export interface RegisteredMutationHandlerResult {
  record: Record<string, unknown>;
  outboxEvents?: Array<{ topic: string; eventType: string; payload?: Record<string, unknown> }>;
}

export interface EntityMutationHandlerRegistry {
  transition?: ReadonlyMap<string, (context: RegisteredMutationHandlerContext<TransitionEntityCommand>) => Promise<RegisteredMutationHandlerResult>>;
  aggregate?: ReadonlyMap<string, (context: RegisteredMutationHandlerContext<AggregateMutationCommand>) => Promise<RegisteredMutationHandlerResult>>;
  aggregateBoundary?: ReadonlyMap<string, (command: AggregateMutationCommand) => Promise<MutationResult>>;
}

export const DOCUMENT_WORKSPACE_AGGREGATE_HANDLER = "DocumentWorkspaceAggregateHandler";

export interface EntityMutationServiceDeps {
  db: AnyDb;
  executionDescriptorProvider?: Pick<ExecutionDescriptorProvider, "get">;
  handlers?: EntityMutationHandlerRegistry;
  enrichAfterCommit?: (input: {
    entityCode: string;
    tenantId: string;
    record: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  recordValidationWarnings?: (input: {
    entityCode: string;
    action: "create" | "patch";
    origin: string;
    fields: MutationFieldViolations;
    metrics: MutationFieldDecision["metrics"];
  }) => void;
  logger?: {
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

type Action = "create" | "patch" | "delete" | "transition" | "aggregate";
type Claim =
  | { kind: "acquired"; id: string }
  | { kind: "replay"; response: Record<string, unknown> }
  | { kind: "mismatch" }
  | { kind: "in_progress" };

const IDEMPOTENCY_LEASE_MS = 30_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;

export class DefaultEntityMutationService implements EntityMutationService {
  constructor(private readonly deps: EntityMutationServiceDeps) {}

  async validateCreate(command: CreateEntityCommand): Promise<MutationResult | null> {
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, "create", command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    const idempotency = validateIdempotency(command.idempotencyKey, command.origin === "classic");
    if (idempotency) return idempotency;
    const handlerResolution = resolveMutationHandler(target.manifest);
    if (handlerResolution.error) return handlerResolution.error;
    const validation = validateCompiledWriteFields({
      input: command.input,
      fields: target.manifest.write.fields,
      action: "create",
      validationMode: command.validationMode,
    });
    if (hasFieldViolations(validation.violations)) return { kind: "FieldsNotWritable", fields: validation.violations };
    const missing = target.manifest.write.fields
      .filter((field) => field.required.create)
      .filter((field) => isMissing(validation.accepted[field.name]))
      .map((field) => field.name);
    return missing.length > 0 ? {
      kind: "ValidationFailed",
      code: "REQUIRED_FIELDS_MISSING",
      message: `Missing required fields: ${missing.join(", ")}.`,
      fields: missing,
    } : null;
  }

  async validatePatch(command: PatchEntityCommand): Promise<MutationResult | null> {
    const prepared = await this.preparePatch(command);
    return "error" in prepared ? prepared.error : null;
  }

  async validateDelete(command: DeleteEntityCommand): Promise<MutationResult | null> {
    if (command.expectedVersion === undefined) return { kind: "VersionRequired" };
    const idempotency = validateIdempotency(command.idempotencyKey, false);
    if (idempotency) return idempotency;
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, "delete", command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    return target.manifest.deletionMode === "prohibited" || target.manifest.deletionMode === "lifecycle_only"
      ? { kind: "IncompatibleAction", action: "delete", reason: `Deletion mode is ${target.manifest.deletionMode}.` }
      : null;
  }

  async create(command: CreateEntityCommand): Promise<MutationResult> {
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, "create", command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    const idempotency = validateIdempotency(command.idempotencyKey, command.origin === "classic");
    if (idempotency) return idempotency;

    const projection = target.manifest.write.fields;
    const handlerResolution = resolveMutationHandler(target.manifest);
    if (handlerResolution.error) return handlerResolution.error;
    const validation = validateCompiledWriteFields({
      input: command.input,
      fields: projection,
      action: "create",
      validationMode: command.validationMode,
    });
    if (hasFieldViolations(validation.violations)) {
      return { kind: "FieldsNotWritable", fields: validation.violations };
    }
    this.reportLenientWarnings(command.entityCode, "create", command.origin, validation);
    const missing = projection
      .filter((field) => field.required.create)
      .filter((field) => isMissing(validation.accepted[field.name]))
      .map((field) => field.name);
    if (missing.length > 0) {
      return {
        kind: "ValidationFailed",
        code: "REQUIRED_FIELDS_MISSING",
        message: `Missing required fields: ${missing.join(", ")}.`,
        fields: missing,
      };
    }

    const requestHash = mutationHash("create", command.entityCode, command.recordId ?? "", undefined, command.input);
    const recordId = command.recordId ?? (command.idempotencyKey
      ? uuidFromHash(createHash("sha256").update([
          command.context.tenantId,
          command.context.principalId,
          command.entityCode,
          command.idempotencyKey,
        ].join(":")).digest("hex"))
      : randomUUID());
    const mapped = mapInput(validation.accepted, projection);
    normalizeMappedValues(mapped, projection);
    const primaryKey = target.descriptor.storage.primaryKey;
    const tenantColumn = target.descriptor.storage.tenantColumn;
    mapped[primaryKey] ??= recordId;
    mapped[tenantColumn] = command.context.tenantId;
    if (hasStorageColumn(target.descriptor, "created_by")) mapped["created_by"] = command.context.principalId;

    const result = await executeDurableMutationTransaction(this.deps.db, async (trx) => {
      const claim = command.idempotencyKey
        ? await claimIdempotency(trx, command, "entity.create", recordId, requestHash)
        : null;
      const replay = claimResult(claim, command.entityCode, recordId, "create");
      if (replay) return replay;

      const table = fullTable(target);
      const hookContext = mutationHookContext(trx, command, target, table, mapped, null);
      const hookFailure = await runBeforePersistHooks(handlerResolution.handler, hookContext);
      if (hookFailure) {
        if (claim?.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return hookFailure;
      }
      const row = handlerResolution.handler?.persistOverride
        ? await handlerResolution.handler.persistOverride(hookContext)
        : await (trx.insertInto(table) as any)
          .values(mapped)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) return { kind: "NotFound", entityCode: command.entityCode } as MutationResult;

      hookContext.persistedRow = row;
      await handlerResolution.handler?.afterPersist?.(hookContext);

      await writeDurableSideEffects(trx, target, command, "create", row, null);
      if (claim?.kind === "acquired") await completeIdempotency(trx, claim.id, command.context.principalId, row, 201);
      return committed("create", command.entityCode, String(row[primaryKey] ?? recordId), row, false, target);
    }, { tenantId: command.context.tenantId, principalId: command.context.principalId });
    return this.enrich(withValidationWarnings(result, validation), command.context.tenantId);
  }

  async patch(command: PatchEntityCommand): Promise<MutationResult> {
    const prepared = await this.preparePatch(command);
    if ("error" in prepared) return prepared.error;
    const { target, projection, handler, requestHash, mapped } = prepared;
    const primaryKey = target.descriptor.storage.primaryKey;
    const tenantColumn = target.descriptor.storage.tenantColumn;
    const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";

    const result = await executeDurableMutationTransaction(this.deps.db, async (trx) => {
      const claim = await claimIdempotency(trx, command, "entity.patch", command.recordId, requestHash);
      const replay = claimResult(claim, command.entityCode, command.recordId, "patch");
      if (replay) return replay;

      const table = fullTable(target);
      const current = await (trx.selectFrom(table) as any)
        .selectAll()
        .where(primaryKey, "=", command.recordId)
        .where(tenantColumn, "=", command.context.tenantId)
        .forUpdate()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!current) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId } as MutationResult;
      }
      const lockedPermission = this.gate(target, "patch", command.origin, command.context.permissions.allowed);
      if (lockedPermission) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockedPermission;
      }
      const currentVersion = Number(current[versionColumn] ?? 0);
      if (currentVersion !== command.expectedVersion) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return {
          kind: "VersionConflict",
          expectedVersion: command.expectedVersion!,
          currentVersion,
        } as MutationResult;
      }
      const lockResult = await this.recheckLock(trx, target, command);
      if (lockResult) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockResult;
      }

      const status = typeof current["status"] === "string" ? current["status"].toLowerCase() : "";
      const lifecycleState = resolveCompiledLifecycleState(target.manifest, current);
      if (lifecycleState && !lifecycleState.isEditable) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return {
          kind: "IncompatibleAction",
          action: "patch",
          reason: lifecycleState.isCommitted
            ? "Committed records require reversal or corrective lifecycle operations."
            : "The compiled lifecycle state is not editable.",
        } as MutationResult;
      }
      const validation = validateCompiledWriteFields({
        input: command.input,
        fields: projection,
        action: "update",
        validationMode: command.validationMode,
        currentStatus: status,
      });
      if (hasFieldViolations(validation.violations)) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return {
          kind: "FieldsNotWritable",
          fields: validation.violations,
          currentStatus: status || null,
        } as MutationResult;
      }
      this.reportLenientWarnings(command.entityCode, "patch", command.origin, validation);

      const hookContext = mutationHookContext(trx, command, target, table, mapped, current);
      const hookFailure = await runBeforePersistHooks(handler, hookContext);
      if (hookFailure) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return hookFailure;
      }
      const updated = handler?.persistOverride
        ? await handler.persistOverride(hookContext)
        : await (trx.updateTable(table) as any)
          .set(mapped)
          .where(primaryKey, "=", command.recordId)
          .where(tenantColumn, "=", command.context.tenantId)
          .where(versionColumn, "=", command.expectedVersion)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!updated) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return {
          kind: "VersionConflict",
          expectedVersion: command.expectedVersion!,
          currentVersion,
        } as MutationResult;
      }

      hookContext.persistedRow = updated;
      await handler?.afterPersist?.(hookContext);

      await writeDurableSideEffects(trx, target, command, "patch", updated, current);
      if (claim.kind === "acquired") await completeIdempotency(trx, claim.id, command.context.principalId, updated, 200);
      return withValidationWarnings(
        committed("patch", command.entityCode, command.recordId, updated, false, target),
        validation,
      );
    }, { tenantId: command.context.tenantId, principalId: command.context.principalId });
    return this.enrich(result, command.context.tenantId);
  }

  private async preparePatch(command: PatchEntityCommand): Promise<
    | { error: MutationResult }
    | {
        target: CompiledMutationTarget;
        projection: EntityCapabilityManifest["write"]["fields"];
        handler?: EntityMutationHandler;
        requestHash: string;
        mapped: Record<string, unknown>;
      }
  > {
    if (Object.keys(command.input).length === 0) {
      return { error: { kind: "ValidationFailed", code: "EMPTY_PATCH", message: "PATCH input must contain at least one field." } };
    }
    if (command.expectedVersion === undefined) return { error: { kind: "VersionRequired" } };
    const idempotency = validateIdempotency(command.idempotencyKey, false);
    if (idempotency) return { error: idempotency };
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { error: { kind: "CapabilityUnavailable", entityCode: command.entityCode } };
    const gate = this.gate(target, "patch", command.origin, command.context.permissions.allowed);
    if (gate) return { error: gate };
    const projection = target.manifest.write.fields;
    const handlerResolution = resolveMutationHandler(target.manifest);
    if (handlerResolution.error) return { error: handlerResolution.error };
    const validation = validateCompiledWriteFields({
      input: command.input,
      fields: projection,
      action: "update",
      validationMode: command.validationMode,
    });
    if (hasFieldViolations(validation.violations)) {
      return { error: { kind: "FieldsNotWritable", fields: validation.violations } };
    }
    const mapped = mapInput(validation.accepted, projection);
    normalizeMappedValues(mapped, projection);
    mapped["updated_by"] = command.context.principalId;
    mapped["updated_at"] = new Date().toISOString();
    return {
      target,
      projection,
      ...(handlerResolution.handler ? { handler: handlerResolution.handler } : {}),
      requestHash: mutationHash("patch", command.entityCode, command.recordId, command.expectedVersion, command.input),
      mapped,
    };
  }

  async delete(command: DeleteEntityCommand): Promise<MutationResult> {
    if (command.expectedVersion === undefined) return { kind: "VersionRequired" };
    const idempotency = validateIdempotency(command.idempotencyKey, false);
    if (idempotency) return idempotency;
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, "delete", command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    if (target.manifest.deletionMode === "prohibited" || target.manifest.deletionMode === "lifecycle_only") {
      return { kind: "IncompatibleAction", action: "delete", reason: `Deletion mode is ${target.manifest.deletionMode}.` };
    }
    const requestHash = mutationHash("delete", command.entityCode, command.recordId, command.expectedVersion, {});
    const primaryKey = target.descriptor.storage.primaryKey;
    const tenantColumn = target.descriptor.storage.tenantColumn;
    const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";
    return executeDurableMutationTransaction(this.deps.db, async (trx) => {
      const claim = await claimIdempotency(trx, command, "entity.delete", command.recordId, requestHash);
      const replay = claimResult(claim, command.entityCode, command.recordId, "delete");
      if (replay) return replay;
      const table = fullTable(target);
      const current = await (trx.selectFrom(table) as any).selectAll()
        .where(primaryKey, "=", command.recordId).where(tenantColumn, "=", command.context.tenantId)
        .forUpdate().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!current) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId };
      }
      const lockedPermission = this.gate(target, "delete", command.origin, command.context.permissions.allowed);
      if (lockedPermission) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockedPermission;
      }
      const currentVersion = Number(current[versionColumn] ?? 0);
      if (currentVersion !== command.expectedVersion) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion };
      }
      const lockResult = await this.recheckLock(trx, target, command);
      if (lockResult) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockResult;
      }
      const lifecycleState = resolveCompiledLifecycleState(target.manifest, current);
      if (lifecycleState?.isCommitted) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return {
          kind: "ValidationFailed",
          code: lifecycleState.isReversible ? "REVERSAL_REQUIRED" : "COMMITTED_RECORD_DELETE_PROHIBITED",
          message: lifecycleState.isReversible
            ? "Committed financial data must be reversed or corrected through lifecycle operations."
            : "Committed records cannot be deleted.",
        } as MutationResult;
      }
      if (lifecycleState && !lifecycleState.isDeletable) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "ValidationFailed", code: "LIFECYCLE_DELETE_PROHIBITED", message: "The current lifecycle state is not deletable." } as MutationResult;
      }
      const restriction = await checkDeletionRestrictions(trx, target, command, current);
      if (restriction) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return restriction;
      }
      await applyDeletionStrategy(trx, target, command, current);
      await writeDurableSideEffects(trx, target, command, "delete", current, current);
      const response = { id: command.recordId, deleted: true, deletionMode: target.manifest.deletionMode };
      if (claim.kind === "acquired") await completeIdempotency(trx, claim.id, command.context.principalId, response, 200);
      return committed("delete", command.entityCode, command.recordId, response, false, target);
    }, { tenantId: command.context.tenantId, principalId: command.context.principalId });
  }

  async transition(command: TransitionEntityCommand): Promise<MutationResult> {
    return this.invokeRegistered(command, "transition");
  }

  async mutateAggregate(command: AggregateMutationCommand): Promise<MutationResult> {
    if (command.expectedVersion === undefined) return { kind: "VersionRequired" };
    const idempotency = validateIdempotency(command.idempotencyKey, false);
    if (idempotency) return idempotency;
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, "aggregate", command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    try {
      compileAggregateCollectionExecutionPlan(target.manifest, command.changes);
    } catch (error) {
      if (error instanceof AggregateCollectionPlanError) {
        return {
          kind: "ValidationFailed",
          code: error.code,
          message: error.message,
          fields: [error.collection],
        };
      }
      throw error;
    }
    const handlerName = target.manifest.mutation.aggregate?.handler;
    const boundaryHandler = handlerName ? this.deps.handlers?.aggregateBoundary?.get(handlerName) : undefined;
    if (boundaryHandler) return boundaryHandler({
      ...command,
      requestHash: command.requestHash ?? mutationHash(
        "aggregate", command.entityCode, command.recordId, command.expectedVersion, command.changes,
      ),
    });
    return this.invokeRegistered(command, "aggregate");
  }

  private async invokeRegistered(
    command: TransitionEntityCommand | AggregateMutationCommand,
    action: "transition" | "aggregate",
  ): Promise<MutationResult> {
    if (command.expectedVersion === undefined) return { kind: "VersionRequired" };
    const idempotency = validateIdempotency(command.idempotencyKey, false);
    if (idempotency) return idempotency;
    const target = await this.resolveTarget(command.context, command.entityCode);
    if (!target) return { kind: "CapabilityUnavailable", entityCode: command.entityCode };
    const gate = this.gate(target, action, command.origin, command.context.permissions.allowed);
    if (gate) return gate;
    const handlerName = action === "transition"
      ? target.manifest.handlers.lifecycleHandler
      : target.manifest.mutation.aggregate?.handler ?? target.manifest.handlers.mutationHandler;
    const registry = action === "transition" ? this.deps.handlers?.transition : this.deps.handlers?.aggregate;
    const handler = handlerName ? registry?.get(handlerName) : undefined;
    if (!handler) {
      return action === "transition"
        ? { kind: "InvalidTransition", transitionCode: (command as TransitionEntityCommand).transitionCode, reason: "No registered lifecycle handler." }
        : { kind: "IncompatibleAction", action, reason: "No registered aggregate handler." };
    }
    const requestHash = mutationHash(action, command.entityCode, command.recordId, command.expectedVersion, command);
    const primaryKey = target.descriptor.storage.primaryKey;
    const tenantColumn = target.descriptor.storage.tenantColumn;
    const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";
    const result = await executeDurableMutationTransaction(this.deps.db, async (trx) => {
      const claim = await claimIdempotency(trx, command, `entity.${action}`, command.recordId, requestHash);
      const replay = claimResult(claim, command.entityCode, command.recordId, action);
      if (replay) return replay;
      const current = await (trx.selectFrom(fullTable(target)) as any).selectAll()
        .where(primaryKey, "=", command.recordId).where(tenantColumn, "=", command.context.tenantId)
        .forUpdate().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!current) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId } as MutationResult;
      }
      const lockedPermission = this.gate(target, action, command.origin, command.context.permissions.allowed);
      if (lockedPermission) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockedPermission;
      }
      const currentVersion = Number(current[versionColumn] ?? 0);
      if (currentVersion !== command.expectedVersion) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion } as MutationResult;
      }
      const lockResult = await this.recheckLock(trx, target, command);
      if (lockResult) {
        if (claim.kind === "acquired") await releaseIdempotency(trx, claim.id);
        return lockResult;
      }
      const handled = await (handler as any)({ trx, command, target, currentRecord: current });
      await writeDurableSideEffects(trx, target, command, action, handled.record, current);
      await writeRegisteredOutboxEvents(trx, command, target, handled.record, currentVersion, handled.outboxEvents);
      if (claim.kind === "acquired") await completeIdempotency(trx, claim.id, command.context.principalId, handled.record, 200);
      return committed(action, command.entityCode, command.recordId, handled.record, false, target);
    }, { tenantId: command.context.tenantId, principalId: command.context.principalId });
    return this.enrich(result, command.context.tenantId);
  }

  private gate(
    target: CompiledMutationTarget,
    action: Action,
    origin: string,
    allowed: ReadonlySet<string>,
  ): MutationResult | null {
    if (target.manifest.renderer === "ledger") {
      return {
        kind: "IncompatibleAction",
        action,
        reason: "Ledger entities are public read-only. Use an authorized ledger posting or reversal service.",
      };
    }
    if (target.manifest.renderer === "document"
      && (action === "create" || action === "patch" || action === "delete")) {
      return {
        kind: "IncompatibleAction",
        action,
        reason: "Documents must be mutated through aggregate workspace or lifecycle commands.",
      };
    }
    const binding = action === "patch" ? target.manifest.mutation.update
      : action === "aggregate" ? target.manifest.mutation.aggregate
      : action === "transition" ? undefined
      : target.manifest.mutation[action];
    if (action === "transition") {
      if (!target.manifest.lifecycle?.enabled) {
        return { kind: "IncompatibleAction", action, reason: "Entity has no compiled lifecycle." };
      }
    } else if (!binding?.enabled) {
      return { kind: "IncompatibleAction", action, reason: binding?.disabledReason ?? "Operation is disabled." };
    }
    if (binding && !surfaceCompatible(binding.kind, origin)) {
      return { kind: "IncompatibleAction", action, reason: `Binding '${binding.kind}' is incompatible with origin '${origin}'.` };
    }
    const permissionCode = binding?.permissionCode;
    if (permissionCode && !allowed.has(permissionCode)) return { kind: "Forbidden", permissionCode };
    return null;
  }

  private async recheckLock(
    trx: AnyDb,
    target: CompiledMutationTarget,
    command: PatchEntityCommand | DeleteEntityCommand | TransitionEntityCommand | AggregateMutationCommand,
  ): Promise<MutationResult | null> {
    const policy = resolveConcurrencyPolicy(target.concurrencyPolicy);
    if (policy.strategy !== "lease_plus_version" || policy.rollout === "observe") return null;
    if (!command.lockToken) return { kind: "LockRequired", reason: "required" };
    const result = await verifyLock(trx, {
      tenantId: command.context.tenantId,
      entityName: command.entityCode,
      recordId: command.recordId,
      lockedBy: command.context.principalId,
      lockToken: command.lockToken,
    });
    return result.valid ? null : { kind: "LockRequired", reason: result.reason ?? "not_found" };
  }

  private async resolveTarget(context: VerifiedRequestContext, entityCode: string): Promise<CompiledMutationTarget | null> {
    const provider = this.deps.executionDescriptorProvider;
    if (!provider) return null;
    const normalized = entityCode.replace(/-/g, "_");
    const memo = new Map();
    try {
      const resolved = await provider.get({
        plane: context.planeKey,
        tenantId: context.tenantId,
        entityCode: normalized,
      }, memo);
      const descriptor = resolved.descriptor;
      const relationTargets = new Map<string, { tableSchema: string; tableName: string; primaryKey: string; tenantColumn: string }>();
      await Promise.all([...descriptor.relations.values()].map(async (relation) => {
        if (relation.ownership === "read_only") return;
        const child = await provider.get({
          plane: context.planeKey,
          tenantId: context.tenantId,
          entityCode: relation.targetEntity,
        }, memo);
        relationTargets.set(relation.name, {
          tableSchema: child.descriptor.storage.schema,
          tableName: child.descriptor.storage.table,
          primaryKey: child.descriptor.storage.primaryKey,
          tenantColumn: child.descriptor.storage.tenantColumn,
        });
      }));
      return {
        descriptor,
        generation: resolved.generation,
        manifest: manifestFromExecutionDescriptor(descriptor),
        tableSchema: descriptor.storage.schema,
        tableName: descriptor.storage.table,
        concurrencyPolicy: concurrencyPolicyFromDescriptor(descriptor),
        createMode: descriptor.write.create.mode,
        relationTargets,
      };
    } catch (error) {
      this.deps.logger?.warn("entity_mutation_descriptor_unavailable", {
        entityCode: normalized,
        tenantId: context.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async enrich(result: MutationResult, tenantId: string): Promise<MutationResult> {
    if (result.kind !== "Committed" || !result.record || !this.deps.enrichAfterCommit || result.replayed) return result;
    try {
      const record = await this.deps.enrichAfterCommit({ entityCode: result.entityCode, tenantId, record: result.record });
      return { ...result, record };
    } catch (error) {
      this.deps.logger?.warn("entity_mutation_response_enrichment_failed", {
        entityCode: result.entityCode,
        recordId: result.recordId,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  private reportLenientWarnings(
    entityCode: string,
    action: "create" | "patch",
    origin: string,
    decision: MutationFieldDecision,
  ): void {
    if (!hasFieldViolations(decision.warnings)) return;
    const payload = { entityCode, action, origin, fields: decision.warnings, metrics: decision.metrics };
    this.deps.recordValidationWarnings?.(payload);
    this.deps.logger?.warn("entity_mutation_lenient_fields_rejected", payload);
  }
}

export function createEntityMutationService(deps: EntityMutationServiceDeps): EntityMutationService {
  return new DefaultEntityMutationService(deps);
}

export function manifestFromExecutionDescriptor(descriptor: ExecutionDescriptorV1): EntityCapabilityManifest {
  const dataPolicy = descriptor.policy.dataPolicy;
  const retentionDays = numberValue(dataPolicy["retentionDays"] ?? dataPolicy["retention_days"]);
  return EntityCapabilityManifestSchema.parse({
    entityCode: descriptor.identity.entityCode,
    renderer: rendererFromEntityClass(descriptor.identity.entityClass),
    mutation: descriptor.write.mutations,
    deletionMode: descriptor.write.deletionMode,
    deletionPolicy: {
      ...(retentionDays && retentionDays > 0 ? { retentionDays } : {}),
      legalHoldEligible: dataPolicy["legalHoldEligible"] === true || dataPolicy["legal_hold_eligible"] === true,
      referenceCheck: dataPolicy["referenceCheck"] !== false && dataPolicy["reference_check"] !== false,
    },
    ...(descriptor.lifecycle ? {
      lifecycle: {
        enabled: true,
        statusField: descriptor.lifecycle.statusField,
        editableStatuses: descriptor.lifecycle.editableStatuses,
        states: descriptor.lifecycle.states,
      },
    } : {}),
    collections: [...descriptor.relations.values()].flatMap((relation) => {
      if (relation.ownership === "read_only") return [];
      return [{
        name: relation.name,
        targetEntity: relation.targetEntity,
        ownership: relation.ownership,
        ...(relation.foreignKey ? { foreignKey: relation.foreignKey } : {}),
        ...(relation.handler ? { handler: relation.handler } : {}),
        mutationOwner: relation.mutationOwner,
        versionStrategy: relation.versionStrategy,
        allowedActions: relation.allowedActions,
      }];
    }),
    handlers: {
      ...(descriptor.handlers.mutationHandler ? { mutationHandler: descriptor.handlers.mutationHandler } : {}),
      ...(descriptor.handlers.writeFacade ? { writeFacade: descriptor.handlers.writeFacade } : {}),
      ...(descriptor.handlers.lifecycleHandler ? { lifecycleHandler: descriptor.handlers.lifecycleHandler } : {}),
      ...(descriptor.handlers.attachmentProvider ? { attachmentProvider: descriptor.handlers.attachmentProvider } : {}),
    },
    write: {
      entityVersionId: descriptor.identity.entityVersionId,
      fields: [...descriptor.fields.values()].map((field) => ({
        name: field.name,
        columnName: field.column,
        dataType: field.dataType,
        origin: null,
        writable: { create: field.createWritable, update: field.updateWritable },
        required: { create: field.createRequired, update: false },
        computed: field.computed,
        readOnly: field.readOnly,
        systemManaged: field.systemManaged,
        systemOrigin: false,
        writeOnce: field.writeOnce,
        statusLimited: field.editableInStatuses.length > 0,
        editableInStatuses: field.editableInStatuses,
      })),
    },
  });
}

function concurrencyPolicyFromDescriptor(descriptor: ExecutionDescriptorV1): Record<string, unknown> {
  return {
    strategy: descriptor.write.concurrency.strategy === "version" ? "version_only" : descriptor.write.concurrency.strategy,
    rollout: descriptor.write.concurrency.rollout,
    version_column: descriptor.storage.rowVersionColumn ?? descriptor.write.concurrency.rowVersionField ?? "row_version",
  };
}

function rendererFromEntityClass(entityClass: string): "simple" | "master" | "document" | "ledger" {
  const normalized = entityClass.toLowerCase();
  if (normalized === "document") return "document";
  if (normalized === "ledger") return "ledger";
  if (normalized === "master") return "master";
  return "simple";
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveMutationHandler(manifest: EntityCapabilityManifest): {
  handler?: EntityMutationHandler;
  error?: MutationResult;
} {
  const name = manifest.handlers.mutationHandler;
  if (!name) return {};
  const handler = getEntityMutationHandler(name);
  return handler
    ? { handler }
    : {
        error: {
          kind: "CapabilityUnavailable",
          entityCode: manifest.entityCode,
        },
      };
}

function mutationHookContext(
  trx: AnyDb,
  command: CreateEntityCommand | PatchEntityCommand,
  target: CompiledMutationTarget,
  table: `${string}.${string}`,
  values: Record<string, unknown>,
  currentRecord: Readonly<Record<string, unknown>> | null,
): TransactionalMutationContext {
  return {
    db: trx,
    trx,
    command,
    manifest: target.manifest,
    table,
    values,
    currentRecord,
    persistedRow: null,
  };
}

async function runBeforePersistHooks(
  handler: EntityMutationHandler | undefined,
  context: TransactionalMutationContext,
): Promise<MutationResult | null> {
  if (!handler) return null;
  const issues = await runEntityMutationHandlerBeforePersist(handler, context);
  if (issues.length > 0) {
    return {
      kind: "ValidationFailed",
      code: issues[0]?.code ?? "ENTITY_VALIDATION_FAILED",
      message: issues.map((issue) => issue.message).join(" "),
      fields: issues.flatMap((issue) => issue.field ? [issue.field] : []),
    };
  }
  return null;
}

function mapInput(
  input: Readonly<Record<string, unknown>>,
  fields: EntityCapabilityManifest["write"]["fields"],
): Record<string, unknown> {
  const byName = new Map(fields.map((field) => [field.name, field.columnName]));
  const mapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input)) {
    const column = byName.get(name);
    if (!column) continue;
    assignMappedValue(mapped, column, value);
  }
  return mapped;
}

function normalizeMappedValues(
  mapped: Record<string, unknown>,
  fields: EntityCapabilityManifest["write"]["fields"],
): void {
  const arrays = new Map<string, string>();
  const json = new Map<string, string>();
  for (const field of fields) {
    const column = field.columnName.split(".")[0];
    if (!column) continue;
    const dataType = field.dataType.toLowerCase();
    if (dataType.endsWith("_array") || dataType.endsWith("[]")) arrays.set(column, dataType);
    if (dataType === "json" || dataType === "jsonb") json.set(column, dataType);
  }
  coerceArrayFields(mapped, arrays);
  serializeJsonFields(mapped, json);
}

function assignMappedValue(target: Record<string, unknown>, column: string, value: unknown): void {
  const [root, ...path] = column.split(".");
  if (!root) return;
  if (path.length === 0 || root !== "metadata") {
    target[root] = value;
    return;
  }
  const object = asRecord(target[root]);
  let cursor = object;
  for (const key of path.slice(0, -1)) {
    cursor[key] = asRecord(cursor[key]);
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = path.at(-1);
  if (last) cursor[last] = value;
  target[root] = object;
}

function surfaceCompatible(binding: string, origin: string): boolean {
  if (binding === "generic") return origin !== "workspace";
  if (binding === "workspace") return origin === "workspace";
  if (binding === "handler" || binding === "write_facade" || binding === "lifecycle") return origin === "operation" || origin === "workspace";
  return false;
}

function validateIdempotency(key: string | undefined, optional: boolean): MutationResult | null {
  if (!key) return optional ? null : { kind: "IdempotencyConflict", reason: "required" };
  return key.length <= 256 ? null : { kind: "IdempotencyConflict", reason: "invalid" };
}

function claimResult(claim: Claim | null, entityCode: string, recordId: string, action: Action): MutationResult | null {
  if (!claim || claim.kind === "acquired") return null;
  if (claim.kind === "mismatch") return { kind: "IdempotencyConflict", reason: "reused" };
  if (claim.kind === "in_progress") return { kind: "IdempotencyConflict", reason: "in_progress" };
  return committed(action, entityCode, recordId, claim.response, true);
}

async function claimIdempotency(
  trx: AnyDb,
  command: CreateEntityCommand | PatchEntityCommand | DeleteEntityCommand | TransitionEntityCommand | AggregateMutationCommand,
  operationKey: string,
  recordId: string,
  requestHash: string,
): Promise<Claim> {
  const key = command.idempotencyKey!;
  const now = new Date();
  const lease = new Date(now.getTime() + IDEMPOTENCY_LEASE_MS);
  const expires = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
  const inserted = await sql<{ id: string }>`
    insert into event.document_runtime_idempotency (
      tenant_id, principal_id, operation_key, idempotency_key, request_hash,
      entity_code, document_id, status, lease_expires_at, expires_at, created_by, updated_by
    ) values (
      ${command.context.tenantId}, ${command.context.principalId}, ${operationKey}, ${key}, ${requestHash},
      ${command.entityCode}, ${recordId}, 'in_progress', ${lease}, ${expires},
      ${command.context.principalId}, ${command.context.principalId}
    ) on conflict (tenant_id, principal_id, operation_key, idempotency_key) do nothing
    returning id
  `.execute(trx);
  if (inserted.rows[0]?.id) return { kind: "acquired", id: inserted.rows[0].id };
  const existing = await sql<{
    id: string; request_hash: string; status: string; lease_expires_at: Date;
    response_payload: Record<string, unknown> | string | null;
  }>`
    select id, request_hash, status, lease_expires_at, response_payload
      from event.document_runtime_idempotency
     where tenant_id = ${command.context.tenantId}
       and principal_id = ${command.context.principalId}
       and operation_key = ${operationKey}
       and idempotency_key = ${key}
     for update
  `.execute(trx);
  const row = existing.rows[0];
  if (!row) throw new Error("ENTITY_MUTATION_IDEMPOTENCY_CLAIM_MISSING");
  if (row.request_hash !== requestHash) return { kind: "mismatch" };
  if (row.status === "succeeded" && row.response_payload) {
    return { kind: "replay", response: typeof row.response_payload === "string" ? JSON.parse(row.response_payload) : row.response_payload };
  }
  if (row.status === "in_progress" && new Date(row.lease_expires_at).getTime() > now.getTime()) return { kind: "in_progress" };
  await sql`
    update event.document_runtime_idempotency
       set status='in_progress', lease_expires_at=${lease}, expires_at=${expires},
           response_status=null, response_payload=null, error_code=null, completed_at=null,
           updated_at=${now}, updated_by=${command.context.principalId}
     where id=${row.id}
  `.execute(trx);
  return { kind: "acquired", id: row.id };
}

async function completeIdempotency(
  trx: AnyDb,
  id: string,
  actorId: string,
  response: Record<string, unknown>,
  status: number,
): Promise<void> {
  await sql`
    update event.document_runtime_idempotency
       set status='succeeded', response_status=${status}, response_payload=${JSON.stringify(response)}::jsonb,
           completed_at=now(), updated_at=now(), updated_by=${actorId}
     where id=${id}
  `.execute(trx);
}

async function releaseIdempotency(trx: AnyDb, id: string): Promise<void> {
  await sql`delete from event.document_runtime_idempotency where id=${id}`.execute(trx);
}

function resolveCompiledLifecycleState(
  manifest: EntityCapabilityManifest,
  row: Record<string, unknown>,
): NonNullable<EntityCapabilityManifest["lifecycle"]>["states"][string] | undefined {
  const lifecycle = manifest.lifecycle;
  if (!lifecycle) return undefined;
  const field = manifest.write.fields.find((candidate) => candidate.name === lifecycle.statusField);
  const value = row[field?.columnName ?? lifecycle.statusField];
  return typeof value === "string" ? lifecycle.states[value.trim().toLowerCase()] : undefined;
}

async function checkDeletionRestrictions(
  trx: AnyDb,
  target: CompiledMutationTarget,
  command: DeleteEntityCommand,
  row: Record<string, unknown>,
): Promise<MutationResult | null> {
  const policy = target.manifest.deletionPolicy;
  if (policy.retentionDays) {
    const createdAt = row["created_at"] instanceof Date
      ? row["created_at"] as Date
      : typeof row["created_at"] === "string" ? new Date(row["created_at"] as string) : null;
    if (createdAt && Number.isFinite(createdAt.getTime())
      && createdAt.getTime() + policy.retentionDays * 86_400_000 > Date.now()) {
      return { kind: "ValidationFailed", code: "RETENTION_POLICY_ACTIVE", message: "The record is still inside its retention period." };
    }
  }
  if (policy.legalHoldEligible) {
    const held = await sql<{ held: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM governance.legal_hold
         WHERE tenant_id = ${command.context.tenantId}
           AND status = 'active'
           AND effective_from <= now()
           AND (effective_to IS NULL OR effective_to > now())
           AND (scope_entity_type IS NULL OR scope_entity_type = ${command.entityCode})
           AND (scope_entity_id_lo IS NULL OR scope_entity_id_lo <= ${command.recordId}::uuid)
           AND (scope_entity_id_hi IS NULL OR scope_entity_id_hi >= ${command.recordId}::uuid)
      ) AS held
    `.execute(trx);
    if (held.rows[0]?.held) {
      return { kind: "ValidationFailed", code: "LEGAL_HOLD_ACTIVE", message: "An active legal hold prevents deletion." };
    }
  }
  if (policy.referenceCheck) {
    for (const collection of target.manifest.collections) {
      if (collection.ownership !== "foreign_key" || !collection.foreignKey) continue;
      const child = target.relationTargets.get(collection.name);
      if (!child) continue;
      const childTable = `${child.tableSchema}.${child.tableName}` as `${string}.${string}`;
      const referenced = await (trx.selectFrom(childTable) as any)
        .select(child.primaryKey)
        .where(child.tenantColumn, "=", command.context.tenantId)
        .where(collection.foreignKey, "=", command.recordId)
        .executeTakeFirst();
      if (referenced) {
        return { kind: "ValidationFailed", code: "DELETE_REFERENCED", message: `Record is referenced by collection '${collection.name}'.` };
      }
    }
  }
  return null;
}

async function applyDeletionStrategy(
  trx: AnyDb,
  target: CompiledMutationTarget,
  command: DeleteEntityCommand,
  current: Record<string, unknown>,
): Promise<void> {
  const table = fullTable(target);
  const primaryKey = target.descriptor.storage.primaryKey;
  const tenantColumn = target.descriptor.storage.tenantColumn;
  const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";
  if (target.manifest.deletionMode === "hard_delete") {
    await (trx.deleteFrom(table) as any).where(primaryKey, "=", command.recordId)
      .where(tenantColumn, "=", command.context.tenantId).executeTakeFirst();
    return;
  }
  const columns = new Set(target.manifest.write.fields.map((field) => field.columnName));
  const values: Record<string, unknown> = {
    ...(columns.has("updated_at") ? { updated_at: new Date().toISOString() } : {}),
    ...(columns.has("updated_by") ? { updated_by: command.context.principalId } : {}),
  };
  if (target.manifest.deletionMode === "soft_delete") {
    if (columns.has("is_deleted")) values["is_deleted"] = true;
    if (columns.has("deleted_at")) values["deleted_at"] = new Date().toISOString();
    if (columns.has("deleted_by")) values["deleted_by"] = command.context.principalId;
    if (columns.has("is_active")) values["is_active"] = false;
  } else if (target.manifest.deletionMode === "archive") {
    if (columns.has("archived_at")) values["archived_at"] = new Date().toISOString();
    if (columns.has("status")) values["status"] = "archived";
    if (columns.has("is_active")) values["is_active"] = false;
  } else if (target.manifest.deletionMode === "retire") {
    if (columns.has("retired_at")) values["retired_at"] = new Date().toISOString();
    if (columns.has("status")) values["status"] = "retired";
    if (columns.has("is_active")) values["is_active"] = false;
  }
  if (Object.keys(values).length === 0) {
    throw new Error(`DELETION_STRATEGY_COLUMNS_MISSING:${target.manifest.deletionMode}`);
  }
  await (trx.updateTable(table) as any).set(values)
    .where(primaryKey, "=", command.recordId)
    .where(tenantColumn, "=", command.context.tenantId)
    .where(versionColumn, "=", current[versionColumn])
    .executeTakeFirst();
}

async function writeDurableSideEffects(
  trx: AnyDb,
  target: CompiledMutationTarget,
  command: CreateEntityCommand | PatchEntityCommand | DeleteEntityCommand | TransitionEntityCommand | AggregateMutationCommand,
  action: Action,
  row: Record<string, unknown>,
  oldRow: Record<string, unknown> | null,
): Promise<void> {
  const primaryKey = target.descriptor.storage.primaryKey;
  const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";
  const recordId = String(row[primaryKey] ?? command.recordId ?? "");
  await writeRequiredRouteAudit(trx, auditEntry(command, action, row, oldRow, target));
  const eventType = `${command.entityCode}.${action === "create" ? "created" : action === "delete" ? "deleted" : action === "transition" ? "transitioned" : action === "aggregate" ? "aggregate_updated" : "updated"}`;
  const version = row[versionColumn] ?? oldRow?.[versionColumn] ?? command.expectedVersion ?? 0;
  await emitOutboxEvent(trx, {
    tenantId: command.context.tenantId,
    topic: "entity_mutation",
    eventType,
    entityType: command.entityCode,
    entityId: recordId,
    eventKey: buildDurableMutationEventKey({
      tenantId: command.context.tenantId,
      entityType: command.entityCode,
      entityId: recordId,
      version: String(version),
      eventType,
    }),
    actorId: command.context.principalId,
    payload: {
      origin: command.origin,
      requestId: command.context.requestId,
      descriptorHash: target.descriptor.identity.compiledHash,
      descriptorGeneration: target.generation,
      durableCategories: ["search", "cache", "realtime", "notifications", "integrations"],
    },
  });
}

/**
 * Persist handler-specific effects through the same atomic outbox boundary as
 * the canonical mutation event.  Keeping this in one helper prevents a
 * registered handler from accidentally emitting post-commit/best-effort
 * notifications and gives every event a stable version-scoped key.
 */
async function writeRegisteredOutboxEvents(
  trx: AnyDb,
  command: TransitionEntityCommand | AggregateMutationCommand,
  target: CompiledMutationTarget,
  record: Record<string, unknown>,
  fallbackVersion: number,
  events: Array<{ topic: string; eventType: string; payload?: Record<string, unknown> }> | undefined,
): Promise<void> {
  if (!events?.length) return;
  const primaryKey = target.descriptor.storage.primaryKey;
  const entityId = String(record[primaryKey] ?? command.recordId);
  const versionColumn = target.descriptor.storage.rowVersionColumn ?? "row_version";
  const version = String(record[versionColumn] ?? fallbackVersion);
  for (const event of events) {
    await emitOutboxEvent(trx, {
      tenantId: command.context.tenantId,
      topic: event.topic,
      eventType: event.eventType,
      entityType: command.entityCode,
      entityId,
      eventKey: buildDurableMutationEventKey({
        tenantId: command.context.tenantId,
        entityType: command.entityCode,
        entityId,
        version,
        eventType: event.eventType,
      }),
      actorId: command.context.principalId,
      payload: {
        ...(event.payload ?? {}),
        descriptorHash: target.descriptor.identity.compiledHash,
        descriptorGeneration: target.generation,
        durable: true,
      },
    });
  }
}

function auditEntry(
  command: CreateEntityCommand | PatchEntityCommand | DeleteEntityCommand | TransitionEntityCommand | AggregateMutationCommand,
  action: Action,
  row: Record<string, unknown>,
  oldRow: Record<string, unknown> | null,
  target?: CompiledMutationTarget,
) {
  const primaryKey = target?.descriptor.storage.primaryKey ?? "id";
  return {
    tenantId: command.context.tenantId,
    entityType: command.entityCode,
    entityId: String(row[primaryKey] ?? command.recordId ?? ""),
    operation: action === "create" ? "insert" as const
      : action === "delete" ? "delete" as const
      : action === "transition" ? "status_change" as const
      : "update" as const,
    actorId: command.context.principalId,
    companyCodeId: command.context.companyCodeId ?? null,
    oldValues: oldRow,
    newValues: action === "delete" ? null : row,
    correlationId: command.context.correlationId ?? null,
    requestId: command.context.requestId,
  };
}

function committed(
  action: Action,
  entityCode: string,
  recordId: string,
  record: Record<string, unknown>,
  replayed: boolean,
  target?: CompiledMutationTarget,
): MutationResult {
  const versionColumn = target?.descriptor.storage.rowVersionColumn ?? "row_version";
  return {
    kind: "Committed",
    action,
    entityCode,
    recordId,
    record,
    version: typeof record[versionColumn] === "number" ? record[versionColumn] : undefined,
    replayed,
    durableSideEffects: true,
  };
}

function withValidationWarnings(result: MutationResult, decision: MutationFieldDecision): MutationResult {
  if (result.kind !== "Committed" || !hasFieldViolations(decision.warnings)) return result;
  return {
    ...result,
    warnings: { fields: decision.warnings },
    validationMetrics: decision.metrics,
  };
}

export function mutationHash(action: Action, entityCode: string, recordId: string, version: number | undefined, body: unknown): string {
  return createHash("sha256").update(canonicalMutationJson({ action, entityCode, recordId, version, body })).digest("hex");
}

function canonicalMutationJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalMutationJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalMutationJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function uuidFromHash(hash: string): string {
  const raw = hash.slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-5${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function fullTable(target: CompiledMutationTarget): `${string}.${string}` {
  return `${target.tableSchema}.${target.tableName}`;
}

function hasStorageColumn(descriptor: ExecutionDescriptorV1, column: string): boolean {
  return [...descriptor.fields.values()].some((field) => field.column.split(".")[0] === column);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* invalid metadata becomes an empty policy */ }
  }
  return {};
}
