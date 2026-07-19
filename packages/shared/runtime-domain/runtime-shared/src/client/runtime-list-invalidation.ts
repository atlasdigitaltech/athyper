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

export type RuntimeListCacheClearReason =
  | "tenant_change"
  | "active_organization_change"
  | "permission_stamp_change"
  | "session_expired"
  | "descriptor_hash_change"
  | "logout";

export type RuntimeListInvalidationDetail =
  | {
      scope: "entity";
      entityCode: string;
      reason: RuntimeListMutationReason;
      occurredAt: number;
    }
  | {
      scope: "all";
      reason: RuntimeListCacheClearReason;
      occurredAt: number;
    };

/** Common browser-side API used by every successful record mutation path. */
export function invalidateRuntimeListEntity(
  entityCode: string,
  reason: RuntimeListMutationReason,
): boolean {
  const normalizedEntityCode = entityCode.trim().toLowerCase().replace(/-/g, "_");
  if (!normalizedEntityCode || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent<RuntimeListInvalidationDetail>(RUNTIME_LIST_INVALIDATION_EVENT, {
    detail: {
      scope: "entity",
      entityCode: normalizedEntityCode,
      reason,
      occurredAt: Date.now(),
    },
  }));
  return true;
}

/** Clears every browser list entry after a security or session boundary changes. */
export function clearRuntimeListCache(reason: RuntimeListCacheClearReason): boolean {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent<RuntimeListInvalidationDetail>(RUNTIME_LIST_INVALIDATION_EVENT, {
    detail: { scope: "all", reason, occurredAt: Date.now() },
  }));
  return true;
}

/** Maps metadata-driven operation codes to a stable cache invalidation reason. */
export function runtimeListMutationReasonForOperation(actionCode: string): RuntimeListMutationReason {
  const normalized = actionCode.trim().toLowerCase().replace(/[.\s-]+/g, "_");
  if (normalized.includes("reverse") || normalized.includes("reversal")) return "reversal";
  if (normalized.includes("post")) return "posting";
  if (normalized.includes("import")) return "import";
  if (normalized.startsWith("bulk_") || normalized.includes("bulk")) return "bulk_operation";
  if (normalized.includes("delete") || normalized.includes("discard")) return "delete";
  return "status_transition";
}
