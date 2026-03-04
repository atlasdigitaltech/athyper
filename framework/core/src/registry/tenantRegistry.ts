/**
 * Tenant registry for multi-tenancy
 * Maps tenant keys to tenant configurations
 */

export type TenantInfo = {
  tenantKey: string;
  tenantId: string;
  realmKey: string;

  // Tenant-specific defaults
  defaults?: {
    country?: string;
    timezone?: string;
    currency?: string;
    [key: string]: unknown;
  };

  // Feature flags
  features?: Record<string, boolean>;

  // Custom metadata
  metadata?: Record<string, unknown>;
};

export interface TenantRegistry {
  get(tenantKey: string): Promise<TenantInfo | undefined>;
  getByRealmAndId(realmKey: string, tenantId: string): Promise<TenantInfo | undefined>;
  list(realmKey?: string): Promise<TenantInfo[]>;
}

/**
 * In-memory implementation (reads from RuntimeConfig)
 */
export class InMemoryTenantRegistry implements TenantRegistry {
  private tenants = new Map<string, TenantInfo>();

  constructor(tenants: TenantInfo[]) {
    for (const tenant of tenants) {
      this.tenants.set(tenant.tenantKey, tenant);
    }
  }

  async get(tenantKey: string): Promise<TenantInfo | undefined> {
    return this.tenants.get(tenantKey);
  }

  async getByRealmAndId(realmKey: string, tenantId: string): Promise<TenantInfo | undefined> {
    return Array.from(this.tenants.values()).find(
      (t) => t.realmKey === realmKey && t.tenantId === tenantId
    );
  }

  async list(realmKey?: string): Promise<TenantInfo[]> {
    const all = Array.from(this.tenants.values());
    return realmKey ? all.filter((t) => t.realmKey === realmKey) : all;
  }
}
