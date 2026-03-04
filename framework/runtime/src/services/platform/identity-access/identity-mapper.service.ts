/**
 * Identity Mapper Service
 *
 * B1: Canonical Identity Model
 * Maps external IdP identities (Keycloak) to athyper principals
 *
 * Schema changes:
 * - core.idp_identity columns: idp_name (not realm/provider), idp_subject (not subject), no username column
 * - core.principal columns: principal_type, principal_code, display_name, email, is_active (not status)
 * - core.principal_profile columns: first_name, last_name, locale, timezone (not language/avatar_url)
 *
 * Mapping Rules:
 * - Keycloak user.sub → core.idp_identity.idp_subject
 * - athyper actor → core.principal.id
 * - principal_type='user' for humans
 * - principal_type='service' for workers/integrations
 * - principal_type='external' for external actors
 *
 * Tables:
 * - core.principal
 * - core.idp_identity
 * - core.principal_profile (optional)
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Principal type (matches DB constraint)
 */
export type PrincipalType = "user" | "service" | "external";

/**
 * IdP identity information from token
 */
export type IdpIdentityInfo = {
  /** IdP name (e.g., "keycloak") - maps to idp_name column */
  idpName: string;

  /** Subject from IdP (sub claim) - immutable identifier, maps to idp_subject column */
  idpSubject: string;

  /** Display name from IdP */
  displayName?: string;

  /** Email from IdP (for principal) */
  email?: string;

  /** Principal code (e.g. username) */
  principalCode?: string;
};

/**
 * Principal creation result
 */
export type PrincipalResult = {
  /** Principal ID */
  principalId: string;

  /** Whether this was a new principal */
  isNew: boolean;

  /** IdP identity ID */
  idpIdentityId: string;
};

/**
 * Identity Mapper Service
 *
 * Handles mapping between external IdP identities and internal principals
 */
export class IdentityMapperService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Map IdP identity to principal (upsert)
   *
   * This is the primary entry point for authentication.
   * Called after token validation to ensure principal exists.
   *
   * @param tenantId - Tenant ID from token
   * @param idpInfo - Identity information from IdP token
   * @param principalType - Type of principal (default: user)
   * @param createdBy - Actor creating the record
   */
  async mapIdentityToPrincipal(
    tenantId: string,
    idpInfo: IdpIdentityInfo,
    principalType: PrincipalType = "user",
    createdBy: string = "system"
  ): Promise<PrincipalResult> {
    console.log(
      JSON.stringify({
        msg: "identity_mapping_start",
        tenantId,
        idpName: idpInfo.idpName,
        idpSubject: idpInfo.idpSubject,
        principalType,
      })
    );

    // Check if idp_identity already exists
    const existingIdentity = await this.getIdpIdentity(
      tenantId,
      idpInfo.idpName,
      idpInfo.idpSubject
    );

    if (existingIdentity) {
      // Identity exists, return existing principal
      console.log(
        JSON.stringify({
          msg: "identity_mapping_existing",
          principalId: existingIdentity.principal_id,
          idpIdentityId: existingIdentity.id,
        })
      );

      return {
        principalId: existingIdentity.principal_id,
        isNew: false,
        idpIdentityId: existingIdentity.id,
      };
    }

    // New identity - create principal and link
    return this.createPrincipalWithIdentity(
      tenantId,
      idpInfo,
      principalType,
      createdBy
    );
  }

  /**
   * Get IdP identity by unique key
   */
  private async getIdpIdentity(
    tenantId: string,
    idpName: string,
    idpSubject: string
  ): Promise<{ id: string; principal_id: string } | undefined> {
    const result = await this.db
      .selectFrom("core.idp_identity")
      .select(["id", "principal_id"])
      .where("tenant_id", "=", tenantId)
      .where("idp_name", "=", idpName)
      .where("idp_subject", "=", idpSubject)
      .executeTakeFirst();

    return result
      ? { id: result.id, principal_id: result.principal_id }
      : undefined;
  }

  /**
   * Create new principal with linked IdP identity
   */
  private async createPrincipalWithIdentity(
    tenantId: string,
    idpInfo: IdpIdentityInfo,
    principalType: PrincipalType,
    createdBy: string
  ): Promise<PrincipalResult> {
    return this.db.transaction().execute(async (trx) => {
      // 1. Create principal
      const principalId = crypto.randomUUID();
      const principalCode = idpInfo.principalCode ?? idpInfo.idpSubject;

      await trx
        .insertInto("core.principal")
        .values({
          id: principalId,
          tenant_id: tenantId,
          principal_type: principalType,
          principal_code: principalCode,
          display_name: idpInfo.displayName ?? principalCode,
          email: idpInfo.email ?? null,
          is_active: true,
          created_by: createdBy,
        })
        .execute();

      console.log(
        JSON.stringify({
          msg: "principal_created",
          principalId,
          tenantId,
          principalType,
        })
      );

      // 2. Create IdP identity link
      const idpIdentityId = crypto.randomUUID();

      await trx
        .insertInto("core.idp_identity")
        .values({
          id: idpIdentityId,
          tenant_id: tenantId,
          principal_id: principalId,
          idp_name: idpInfo.idpName,
          idp_subject: idpInfo.idpSubject,
          created_by: createdBy,
        })
        .execute();

      console.log(
        JSON.stringify({
          msg: "idp_identity_created",
          idpIdentityId,
          principalId,
          idpName: idpInfo.idpName,
          idpSubject: idpInfo.idpSubject,
        })
      );

      // 3. Create principal profile (optional metadata)
      if (idpInfo.email || idpInfo.displayName) {
        await trx
          .insertInto("core.principal_profile")
          .values({
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            principal_id: principalId,
            locale: "en-US",
            created_by: createdBy,
          })
          .execute();

        console.log(
          JSON.stringify({
            msg: "principal_profile_created",
            principalId,
          })
        );
      }

      return {
        principalId,
        isNew: true,
        idpIdentityId,
      };
    });
  }

  /**
   * Get principal by ID
   */
  async getPrincipal(
    principalId: string
  ): Promise<
    | {
        id: string;
        tenant_id: string;
        principal_type: string;
        principal_code: string;
        display_name: string | null;
        email: string | null;
        is_active: boolean;
      }
    | undefined
  > {
    const result = await this.db
      .selectFrom("core.principal")
      .select([
        "id",
        "tenant_id",
        "principal_type",
        "principal_code",
        "display_name",
        "email",
        "is_active",
      ])
      .where("id", "=", principalId)
      .executeTakeFirst();

    return result;
  }

  /**
   * Get principal with profile
   */
  async getPrincipalWithProfile(principalId: string): Promise<
    | {
        principal: {
          id: string;
          tenant_id: string;
          principal_type: string;
          principal_code: string;
          display_name: string | null;
          email: string | null;
          is_active: boolean;
        };
        profile?: {
          id: string;
          locale: string | null;
          timezone: string | null;
          first_name: string | null;
          last_name: string | null;
        };
        identities: Array<{
          id: string;
          idp_name: string;
          idp_subject: string;
        }>;
      }
    | undefined
  > {
    // Get principal
    const principal = await this.getPrincipal(principalId);
    if (!principal) return undefined;

    // Get profile
    const profile = await this.db
      .selectFrom("core.principal_profile")
      .select(["id", "locale", "timezone", "first_name", "last_name"])
      .where("principal_id", "=", principalId)
      .executeTakeFirst();

    // Get linked identities
    const identities = await this.db
      .selectFrom("core.idp_identity")
      .select(["id", "idp_name", "idp_subject"])
      .where("principal_id", "=", principalId)
      .execute();

    return {
      principal,
      profile: profile ?? undefined,
      identities,
    };
  }

  /**
   * Link additional IdP identity to existing principal
   */
  async linkIdentityToPrincipal(
    principalId: string,
    tenantId: string,
    idpInfo: IdpIdentityInfo,
    createdBy: string = "system"
  ): Promise<string> {
    // Check if already linked
    const existing = await this.getIdpIdentity(
      tenantId,
      idpInfo.idpName,
      idpInfo.idpSubject
    );

    if (existing) {
      if (existing.principal_id !== principalId) {
        throw new Error(
          `Identity already linked to different principal: ${existing.principal_id}`
        );
      }
      return existing.id;
    }

    // Create new link
    const idpIdentityId = crypto.randomUUID();

    await this.db
      .insertInto("core.idp_identity")
      .values({
        id: idpIdentityId,
        tenant_id: tenantId,
        principal_id: principalId,
        idp_name: idpInfo.idpName,
        idp_subject: idpInfo.idpSubject,
        created_by: createdBy,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "identity_linked",
        principalId,
        idpIdentityId,
        idpName: idpInfo.idpName,
      })
    );

    return idpIdentityId;
  }

  /**
   * Update principal active status
   */
  async updatePrincipalActive(
    principalId: string,
    isActive: boolean
  ): Promise<void> {
    await this.db
      .updateTable("core.principal")
      .set({ is_active: isActive })
      .where("id", "=", principalId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "principal_status_updated",
        principalId,
        isActive,
      })
    );
  }

  /**
   * Deactivate principal
   */
  async deactivatePrincipal(principalId: string): Promise<void> {
    await this.updatePrincipalActive(principalId, false);
  }

  /**
   * Search principals by tenant
   */
  async searchPrincipals(
    tenantId: string,
    filters?: {
      principalType?: PrincipalType;
      isActive?: boolean;
      searchTerm?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<
    Array<{
      id: string;
      principal_type: string;
      principal_code: string;
      display_name: string | null;
      email: string | null;
      is_active: boolean;
    }>
  > {
    let query = this.db
      .selectFrom("core.principal")
      .select(["id", "principal_type", "principal_code", "display_name", "email", "is_active"])
      .where("tenant_id", "=", tenantId);

    if (filters?.principalType) {
      query = query.where("principal_type", "=", filters.principalType);
    }

    if (filters?.isActive !== undefined) {
      query = query.where("is_active", "=", filters.isActive);
    }

    if (filters?.searchTerm) {
      query = query.where((eb) =>
        eb.or([
          eb("display_name", "ilike", `%${filters.searchTerm}%`),
          eb("email", "ilike", `%${filters.searchTerm}%`),
        ])
      );
    }

    const results = await query
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)
      .orderBy("display_name", "asc")
      .execute();

    return results;
  }
}
