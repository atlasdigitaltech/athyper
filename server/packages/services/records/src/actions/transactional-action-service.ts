import type {
  RegisteredActionCommand,
  RecordMutationResult,
} from "@athyper/server-contract-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
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
      if (
        !(
          await options.authorizer.authorize({
            context: command.context,
            permissionCode: registration.permissionCode,
            resource: {
              entityCode: command.entityCode,
              recordId: command.recordId,
              actionCode: command.actionCode,
            },
          })
        ).allowed
      )
        return {
          kind: "Forbidden",
          permissionCode: registration.permissionCode,
        };
      if (
        descriptor.storage.versionField &&
        command.expectedVersion === undefined
      )
        return { kind: "VersionRequired" };
      try {
        return await options.transactions.run(
          command.context.planeKey,
          command.context,
          (tx) =>
            executeRecordCommand(
              options,
              command,
              tx,
              "domain",
              async () => {
                const current = await options.repository.get(
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
            ),
        );
      } catch (error) {
        if (error instanceof DeclinedMutation) return error.result;
        throw error;
      }
    },
  };
}
