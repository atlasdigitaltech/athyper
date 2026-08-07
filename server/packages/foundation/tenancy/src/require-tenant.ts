import { isTenantId, type TenantId } from "./tenant-id.js";

/**
 * Assert a tenant ID is present and valid, throwing a descriptive error otherwise.
 * Use at service boundaries where a missing tenant ID is a programmer error.
 */
export function requireTenantId(
  value: string | null | undefined,
  context?: string,
): TenantId {
  if (!value || !isTenantId(value)) {
    const where = context ? ` in ${context}` : "";
    throw new Error(`requireTenantId: missing or invalid tenant id${where}`);
  }
  return value;
}
