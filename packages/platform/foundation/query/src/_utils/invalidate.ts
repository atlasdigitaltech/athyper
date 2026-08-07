/**
 * Browser-side runtime list invalidation.
 * Fires a CustomEvent so the runtime-list package can clear its internal cache
 * after any record mutation (create / edit / delete / status transition).
 *
 * Inlined here to avoid a dependency on @athyper/runtime-shared.
 * Keep in sync with packages/shared/runtime-domain/runtime-shared/src/client/runtime-list-invalidation.ts.
 */

export const RUNTIME_LIST_INVALIDATION_EVENT = "athyper:runtime-list-cache-invalidate";

export type RuntimeListMutationReason =
  | "create"
  | "edit"
  | "delete"
  | "status_transition"
  | "posting"
  | "reversal"
  | "import"
  | "bulk_operation";

export function invalidateRuntimeListEntity(
  entityCode: string,
  reason: RuntimeListMutationReason,
): boolean {
  const code = entityCode.trim().toLowerCase().replace(/-/g, "_");
  if (!code || typeof window === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent(RUNTIME_LIST_INVALIDATION_EVENT, {
      detail: { scope: "entity", entityCode: code, reason, occurredAt: Date.now() },
    }),
  );
  return true;
}
