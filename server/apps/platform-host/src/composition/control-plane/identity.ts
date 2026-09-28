import { sql, type Kysely } from "kysely";
import type { VerifiedIdentity } from "@athyper/server-contract-auth";
import { createKyselyPermissionResolver, type IdentityContextResolutionInput } from "@athyper/server-platform-iam";
import { validatePlatformAuthority, type PlatformAuthority } from "../shared/identity/platform-authority.js";

/** Control-plane admission is an explicit persisted issuer/subject binding, not
 * a customer organization projection and not a username/realm-role shortcut. */
export function createControlPlaneIdentityResolver(database: Kysely<Record<string, never>>, input: PlatformAuthority) {
  const authority = validatePlatformAuthority(input);
  return async (request: IdentityContextResolutionInput) => {
    if (request.planeKey !== "studio" || request.realmKey !== authority.realmKey
      || (request.requestedTenantId !== undefined && request.requestedTenantId !== authority.tenantId)
      || (request.tokenTenantId !== undefined && request.tokenTenantId !== authority.tenantId)
      || !request.subject.trim()) return undefined;
    return database.transaction().setIsolationLevel("repeatable read").execute(async tx => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT set_config('app.database_plane','studio',true),
        set_config('app.current_tenant_id',${authority.tenantId},true)`.execute(tx);
      // Self-read RLS cannot resolve an unknown principal. Use the existing
      // narrow subject-resolution function, then validate pins under self RLS.
      const resolved = (await sql<{ principalId: string }>`SELECT principal_id::text AS "principalId"
        FROM master.fn_resolve_principal_identity(${authority.tenantId}::uuid,
          'keycloak'::master.identity_provider_d,${authority.realmKey},${request.subject})
        WHERE principal_type='user'`.execute(tx)).rows;
      if (resolved.length !== 1) return undefined;
      await sql`SELECT set_config('app.current_principal_id',${resolved[0]!.principalId},true)`.execute(tx);
      const rows = (await sql<{ principalId: string; authEpoch: number }>`
        SELECT p.id::text AS "principalId",p.auth_epoch AS "authEpoch"
        FROM master.principal_identity_binding b
        JOIN master.principal p ON p.tenant_id=b.tenant_id AND p.id=b.principal_id
        JOIN master.tenant t ON t.id=p.tenant_id
        WHERE b.tenant_id=${authority.tenantId}::uuid AND b.provider_code='keycloak'
          AND b.realm_key=${authority.realmKey} AND b.subject_id=${request.subject}
          AND b.issuer=${authority.issuer} AND b.audience=${authority.audience}
          AND b.status='active' AND b.service_client_id IS NULL
          AND p.status='active' AND p.principal_type='user' AND t.status='active'
      `.execute(tx)).rows;
      if (rows.length !== 1 || rows[0]!.principalId !== resolved[0]!.principalId
        || (request.tokenPrincipalId !== undefined && request.tokenPrincipalId !== rows[0]!.principalId)) return undefined;
      const principal = rows[0]!;
      await sql`SELECT set_config('app.current_principal_id',${principal.principalId},true)`.execute(tx);
      const identity: VerifiedIdentity = { planeKey: "studio", realmKey: authority.realmKey, tenantId: authority.tenantId, ...principal };
      // Existing resolver enforces plane admission, effective grants and scope.
      const permissions = await createKyselyPermissionResolver({ run: (_identity, work) => work(tx) }).resolve(identity);
      return { tenantId: authority.tenantId, ...principal, permissions };
    });
  };
}
