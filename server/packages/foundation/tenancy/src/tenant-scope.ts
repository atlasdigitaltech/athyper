import type { TenantId } from "./tenant-id.js";

/** Marker interface for objects that carry a resolved tenant identity. */
export interface TenantScope {
  readonly tenantId: TenantId;
}
