/**
 * Combined tenant + IdP registry
 * Resolves tenant -> realm -> IdP configuration
 */

import type { IdentityProviderRegistry } from "../identityProviderRegistry.js";
import type { TenantRegistry } from "../tenantRegistry.js";

export class TenantIdpRegistry {
  constructor(
    private tenantRegistry: TenantRegistry,
    private idpRegistry: IdentityProviderRegistry
  ) {}

  /**
   * Get IdP config for a given tenant
   */
  async getIdpForTenant(tenantKey: string) {
    const tenant = await this.tenantRegistry.get(tenantKey);
    if (!tenant) return undefined;

    const idp = await this.idpRegistry.get(tenant.realmKey);
    return idp;
  }
}
