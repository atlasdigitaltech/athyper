/**
 * Tenant Resolver Service
 *
 * B2: Tenant Resolution
 * Validates tenant existence and loads tenant configuration
 *
 * Tables:
 * - core.tenant
 * - core.tenant_profile
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Tenant status (matches DB constraint)
 */
export type TenantStatus = "active" | "suspended" | "archived";

/**
 * Subscription tier (matches DB constraint)
 */
export type SubscriptionTier = "base" | "professional" | "enterprise";

/**
 * Tenant information
 */
export type TenantInfo = {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  region: string | null;
  subscription: SubscriptionTier;
  profile?: TenantProfileInfo;
};

/**
 * Tenant profile information
 */
export type TenantProfileInfo = {
  currency: string | null;
  locale: string | null;
  timezone: string | null;
  fiscalYearStartMonth: number | null;
  securityDefaults: Record<string, unknown> | null;
};

/**
 * Tenant Resolver Service
 */
export class TenantResolverService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Resolve tenant by ID
   * @throws Error if tenant not found or inactive
   */
  async resolveTenant(tenantId: string): Promise<TenantInfo> {
    const tenant = await this.db
      .selectFrom("core.tenant")
      .select(["id", "code", "name", "status", "region", "subscription"])
      .where("id", "=", tenantId)
      .executeTakeFirst();

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (tenant.status !== "active") {
      throw new Error(`Tenant is ${tenant.status}: ${tenantId}`);
    }

    const profile = await this.getTenantProfile(tenantId);

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      region: tenant.region,
      subscription: tenant.subscription as SubscriptionTier,
      profile,
    };
  }

  /**
   * Resolve tenant by code
   */
  async resolveTenantByCode(code: string): Promise<TenantInfo> {
    const tenant = await this.db
      .selectFrom("core.tenant")
      .select(["id", "code", "name", "status", "region", "subscription"])
      .where("code", "=", code)
      .executeTakeFirst();

    if (!tenant) {
      throw new Error(`Tenant not found by code: ${code}`);
    }

    if (tenant.status !== "active") {
      throw new Error(`Tenant is ${tenant.status}: ${code}`);
    }

    const profile = await this.getTenantProfile(tenant.id);

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      region: tenant.region,
      subscription: tenant.subscription as SubscriptionTier,
      profile,
    };
  }

  /**
   * Check if tenant exists and is active
   */
  async tenantExists(tenantId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom("core.tenant")
      .select("id")
      .where("id", "=", tenantId)
      .where("status", "=", "active")
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Get tenant profile
   */
  async getTenantProfile(tenantId: string): Promise<TenantProfileInfo | undefined> {
    const profile = await this.db
      .selectFrom("core.tenant_profile")
      .select([
        "currency",
        "locale",
        "timezone",
        "fiscal_year_start_month",
        "metadata",
      ])
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!profile) return undefined;

    return {
      currency: profile.currency,
      locale: profile.locale,
      timezone: profile.timezone,
      fiscalYearStartMonth: profile.fiscal_year_start_month,
      securityDefaults: (profile.metadata as Record<string, unknown> | null)?.securityDefaults as Record<string, unknown> | null ?? null,
    };
  }

  /**
   * Update tenant profile
   */
  async updateTenantProfile(
    tenantId: string,
    updates: Partial<TenantProfileInfo>,
    updatedBy: string
  ): Promise<void> {
    const existing = await this.getTenantProfile(tenantId);

    if (existing) {
      await this.db
        .updateTable("core.tenant_profile")
        .set({
          currency: updates.currency ?? undefined,
          locale: updates.locale ?? undefined,
          timezone: updates.timezone ?? undefined,
          fiscal_year_start_month: updates.fiscalYearStartMonth ?? undefined,
          metadata: updates.securityDefaults
            ? JSON.stringify({ securityDefaults: updates.securityDefaults })
            : undefined,
          updated_at: new Date(),
          updated_by: updatedBy,
        })
        .where("tenant_id", "=", tenantId)
        .execute();
    } else {
      await this.db
        .insertInto("core.tenant_profile")
        .values({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          currency: updates.currency ?? null,
          locale: updates.locale ?? null,
          timezone: updates.timezone ?? null,
          fiscal_year_start_month: updates.fiscalYearStartMonth ?? null,
          metadata: updates.securityDefaults
            ? JSON.stringify({ securityDefaults: updates.securityDefaults })
            : null,
          created_by: updatedBy,
        })
        .execute();
    }

    console.log(
      JSON.stringify({
        msg: "tenant_profile_updated",
        tenantId,
        updatedBy,
      })
    );
  }

  /**
   * List all tenants
   */
  async listTenants(filters?: {
    status?: TenantStatus;
    subscription?: SubscriptionTier;
    limit?: number;
    offset?: number;
  }): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      status: string;
      subscription: string;
    }>
  > {
    let query = this.db
      .selectFrom("core.tenant")
      .select(["id", "code", "name", "status", "subscription"]);

    if (filters?.status) {
      query = query.where("status", "=", filters.status);
    }

    if (filters?.subscription) {
      query = query.where("subscription", "=", filters.subscription);
    }

    return query
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0)
      .orderBy("name", "asc")
      .execute();
  }
}
