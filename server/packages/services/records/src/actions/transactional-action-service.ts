import type {
  RegisteredActionCommand,
  RecordMutationResult,
} from "@athyper/server-contract-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import {
  appendRecordSideEffects,
  executeRecordCommand,
  idempotencyFailure,
  type RecordExecutionOptions,
} from "../record-execution.js";
import { descriptorFor } from "../query-service.js";

/** Handlers must use the supplied transaction for every domain write. External
 * effects belong in the transactional outbox. Returning a committed result after
 * independently committing a database transaction is not a supported adapter. */
export interface TransactionalRecordActionHandler<T> {
  /** Optional bounded target reader for scoped domain actions whose target is
   * not admitted by generic owner administration. It grants no field read or
   * generic write authority and requires a current authorization preflight. */
  readTarget?(
    command: RegisteredActionCommand,
    descriptor: EntityRuntimeDescriptor,
    transaction: T,
  ): Promise<{ readonly recordId: string; readonly version?: number } | null>;
  /** Derive business scope from stored records in the current transaction.
   * This is not a grant: the published action permission is checked separately.
   * Callers cannot supply this resource through the HTTP command. */
  resolveAuthorizationResource?(
    command: RegisteredActionCommand,
    descriptor: EntityRuntimeDescriptor,
    transaction: T,
  ): Promise<{ readonly kind: "Resolved"; readonly resource: NonNullable<AuthorizationRequest["resource"]> } | RecordMutationResult>;
  /** Revalidate domain scope in the current transaction before any receipt
   * replay. A receipt never substitutes for current domain authorization. */
  authorize?(
    command: RegisteredActionCommand,
    descriptor: EntityRuntimeDescriptor,
    transaction: T,
  ): Promise<RecordMutationResult | undefined>;
  execute(
    command: RegisteredActionCommand,
    descriptor: EntityRuntimeDescriptor,
    transaction: T,
  ): Promise<RecordMutationResult>;
}
class DeclinedMutation extends Error {
  constructor(readonly result: RecordMutationResult) {
    super("RECORD_DOMAIN_MUTATION_DECLINED");
  }
}
export function createTransactionalRecordActionService<T>(
  options: RecordExecutionOptions<T> & {
    readonly handlers: ReadonlyMap<string, TransactionalRecordActionHandler<T>>;
  },
) {
  return {
    async execute(
      command: RegisteredActionCommand,
    ): Promise<RecordMutationResult> {
      const invalid = idempotencyFailure(command);
      if (invalid) return invalid;
      const descriptor = await descriptorFor(
        options.metadata,
        command.context,
        command.entityCode,
      );
      const registration = descriptor.actions?.find(
        (action) => action.code === command.actionCode,
      );
      if (!registration)
        return {
          kind: "CapabilityUnavailable",
          entityCode: command.entityCode,
        };
      const handler = options.handlers.get(registration.handlerKey);
      if (!handler)
        return {
          kind: "CapabilityUnavailable",
          entityCode: command.entityCode,
        };
      if (handler.readTarget && !handler.authorize) throw Error("RECORD_DOMAIN_TARGET_AUTHORIZATION_REQUIRED");
      if (
        descriptor.storage.versionField &&
        command.expectedVersion === undefined
      )
        return { kind: "VersionRequired" };
      try {
        return await options.transactions.run(
          command.context.planeKey,
          command.context,
          async (tx) => {
            const resolved = await handler.resolveAuthorizationResource?.(command, descriptor, tx);
            if (resolved && resolved.kind !== "Resolved") return resolved;
            if (!(await options.authorizer.authorize({
              context: command.context,
              permissionCode: registration.permissionCode,
              resource: {
                ...(resolved?.resource ?? {}),
                tenantId: command.context.tenantId,
                entityCode: command.entityCode,
                recordId: command.recordId,
                actionCode: command.actionCode,
                operationKey: command.actionCode,
                authorizationDescriptorHash: descriptor.compiledHash,
                ...(handler.resolveAuthorizationResource ? {registeredActionCheck:true,actionHandlerKey:registration.handlerKey} : {}),
              },
            })).allowed) return { kind: "Forbidden", permissionCode: registration.permissionCode };
            const denied = await handler.authorize?.(command, descriptor, tx);
            if (denied) return denied;
            return executeRecordCommand(
              options,
              command,
              tx,
              "domain",
              async () => {
                const admittedTarget = handler.readTarget ? await handler.readTarget(command, descriptor, tx) : undefined;
                if(admittedTarget && admittedTarget.recordId !== command.recordId) throw Error("RECORD_DOMAIN_TARGET_SCOPE_INVALID");
                const current = handler.readTarget ? (admittedTarget ? {
                  [descriptor.storage.idField]: admittedTarget.recordId,
                  ...(descriptor.storage.versionField ? {[descriptor.storage.versionField]:admittedTarget.version} : {}),
                } : null) : await options.repository.get(
                  descriptor,
                  command.context.tenantId,
                  command.recordId,
                  [],
                  tx,
                );
                if (!current)
                  return {
                    kind: "NotFound",
                    entityCode: command.entityCode,
                    recordId: command.recordId,
                  };
                if (descriptor.storage.versionField) {
                  const version = Number(
                    current[descriptor.storage.versionField],
                  );
                  if (!Number.isSafeInteger(version) || version < 1)
                    throw Error("RECORD_DOMAIN_VERSION_INVALID");
                  if (version !== command.expectedVersion)
                    return {
                      kind: "VersionConflict",
                      expectedVersion: command.expectedVersion!,
                      currentVersion: version,
                    };
                }
                const result = await handler.execute(command, descriptor, tx);
                if (result.kind !== "Committed")
                  throw new DeclinedMutation(result);
                if (result.kind === "Committed") {
                  if (
                    result.recordId !== command.recordId ||
                    result.entityCode !== command.entityCode ||
                    result.action !== "domain"
                  )
                    throw Error("RECORD_DOMAIN_RESULT_SCOPE_INVALID");
                  await appendRecordSideEffects(
                    options,
                    command,
                    tx,
                    "domain",
                    result.recordId,
                  );
                }
                return result;
              },
              descriptor,
            );
          },
        );
      } catch (error) {
        if (error instanceof DeclinedMutation) return error.result;
        throw error;
      }
    },
  };
}
