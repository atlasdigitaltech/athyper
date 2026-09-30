import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { RecordServiceError } from "./errors.js";
export interface RecordMutationPolicy<Transaction> {
  validate(
    input: {
      context: VerifiedRequestContext;
      descriptor: EntityRuntimeDescriptor;
      action: "create" | "patch";
      values: Readonly<Record<string, unknown>>;
    },
    transaction: Transaction,
  ): Promise<void>;
  committed(
    input: {
      context: VerifiedRequestContext;
      descriptor: EntityRuntimeDescriptor;
      record: Readonly<Record<string, unknown>>;
    },
    transaction: Transaction,
  ): Promise<void>;
}
export function resolveRecordMutationPolicy<Transaction>(
  descriptor: EntityRuntimeDescriptor,
  policies?: ReadonlyMap<string, RecordMutationPolicy<Transaction>>,
) {
  if (!descriptor.mutationPolicy) return undefined;
  const policy = policies?.get(descriptor.mutationPolicy.handlerKey);
  if (!policy)
    throw new RecordServiceError(
      503,
      "ENTITY_MUTATION_POLICY_UNAVAILABLE",
      "This record's validation service is unavailable.",
    );
  return policy;
}
