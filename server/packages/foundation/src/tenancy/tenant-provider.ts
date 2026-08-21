import type { TenantId } from "./tenant-id.js";

export interface TenantProvider {
  getTenantId(): TenantId | null | undefined;
}
