import type { TenantId } from "./tenant-id.js";

/**
 * Port for resolving the active tenant ID from the current execution context.
 * Implementations live in runtime/http (header extraction) and
 * platform/iam (token-derived resolution) — never in foundation.
 */
export interface TenantProvider {
  getTenantId(): TenantId | null | undefined;
}
