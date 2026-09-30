import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { sql } from "kysely";
import type { RecordTransaction } from "./kysely-record-repository.js";
import { RecordServiceError } from "./errors.js";

export interface RecordOwnerAccessAdapter<Transaction> {
  prepare(
    input: {
      context: VerifiedRequestContext;
      descriptor: EntityRuntimeDescriptor;
      operation: string;
      ownerPrincipalId?: string;
    },
    transaction: Transaction,
  ): Promise<Readonly<Record<string, unknown>>>;
}

/** Only installed server composition may set this transaction-local RLS context.
 * Ordinary operation/field checks remain required by query and mutation services. */
export function createRecordOwnerAccessAdapter(
  authorizer: Authorizer,
): RecordOwnerAccessAdapter<RecordTransaction> {
  return {
    async prepare(
      { context, descriptor, operation, ownerPrincipalId },
      transaction,
    ) {
      const policy = descriptor.ownerAccess;
      if (!policy) return {};
      const decision = await authorizer.authorize({
        context,
        permissionCode: policy.administerPermission,
        resource: {
          tenantId: context.tenantId,
          entityCode: descriptor.entityCode,
          operationKey: operation,
          ownerAccessCheck: true,
          authorizationDescriptorHash: descriptor.compiledHash,
        },
      });
      if (
        ownerPrincipalId &&
        ownerPrincipalId !== context.principalId &&
        !decision.allowed
      )
        throw new RecordServiceError(
          403,
          "ENTITY_OWNER_ACCESS_DENIED",
          "You cannot edit another user's record.",
        );
      // Reset on every boundary, including after a previous admin operation in the transaction.
      await sql`SELECT set_config('app.entity_owner_access',${JSON.stringify({
        schema: descriptor.storage.schema,
        object: descriptor.storage.object,
        tenantId: context.tenantId,
        actorId: context.principalId,
        operation,
        admin: decision.allowed,
      })},true)`.execute(transaction);
      return operation === "create"
        ? {
            [policy.ownerField]: ownerPrincipalId ?? context.principalId,
            [policy.createdByField]: context.principalId,
          }
        : operation === "patch"
          ? { [policy.updatedByField]: context.principalId }
          : !decision.allowed && ["read", "list"].includes(operation)
            ? { [policy.ownerField]: context.principalId }
            : {};
    },
  };
}

export async function prepareRecordOwnerAccess<Transaction>(
  adapter: RecordOwnerAccessAdapter<Transaction> | undefined,
  input: Parameters<RecordOwnerAccessAdapter<Transaction>["prepare"]>[0],
  transaction: Transaction,
) {
  if (!input.descriptor.ownerAccess) {
    if (input.ownerPrincipalId)
      throw new RecordServiceError(
        400,
        "ENTITY_OWNER_CONTEXT_UNSUPPORTED",
        "This entity does not accept an owner context.",
      );
    return {};
  }
  if (!adapter)
    throw new RecordServiceError(
      503,
      "ENTITY_OWNER_ADAPTER_UNAVAILABLE",
      "Record ownership enforcement is unavailable.",
    );
  return adapter.prepare(input, transaction);
}

/** Mandatory self predicate also protects against unrelated permissive RLS
 * policies held by the runtime role. Never merge this into caller filters. */
export function scopeRecordOwnerRead(
  descriptor: EntityRuntimeDescriptor,
  ownerValues: Readonly<Record<string, unknown>>,
): EntityRuntimeDescriptor {
  const field = descriptor.ownerAccess?.ownerField;
  if (!field || ownerValues[field] === undefined) return descriptor;
  const value = ownerValues[field];
  if (typeof value !== "string" || !value)
    throw new RecordServiceError(500, "ENTITY_OWNER_SCOPE_INVALID", "The owner scope is invalid");
  return {
    ...descriptor,
    recordPredicates: [
      ...(descriptor.recordPredicates ?? []),
      { field, operator: "eq", value },
    ],
  };
}
