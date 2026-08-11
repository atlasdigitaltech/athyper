import type { TenantId } from "./tenant-id.js";

export interface TenantScope {
  readonly tenantId: TenantId;
}
