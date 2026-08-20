import { sql, type Kysely, type Transaction } from "kysely";
import type { VerifiedIdentity } from "@athyper/server-contract-auth";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { IdentityContextResolutionInput, ResolvedIdentityContext } from "./iam-service.js";
import { createKyselyPermissionResolver } from "./kysely-permission-resolver.js";

type Db = Record<string, never>;
type AuthorizationTransaction = Kysely<Db> | Transaction<Db>;

export interface ExactPlaneIdentityTransactions {
  run<Result>(plane: PlaneKey, work: (transaction: AuthorizationTransaction) => Promise<Result>): Promise<Result>;
}

/** Resolves projection, external subject, admission, epoch, and permissions in one consistent plane snapshot. */
export function createKyselyIdentityContextResolver(transactions: ExactPlaneIdentityTransactions) {
  return async (input: IdentityContextResolutionInput): Promise<ResolvedIdentityContext | undefined> => {
    const tenantId = input.requestedTenantId ?? input.tokenTenantId;
    if (!tenantId || !uuid(tenantId) || input.organizationIds.length === 0) return undefined;

    return transactions.run(input.planeKey, async (transaction) => {
      await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(transaction);
      const projection = (await sql<{ tenantId: string }>`
        SELECT DISTINCT projection.tenant_id::text AS "tenantId"
          FROM authz.fn_resolve_active_application_projections(
            ${input.realmKey},
            ${input.organizationIds}::text[],
            'keycloak'
          ) AS projection
         WHERE projection.tenant_id=${tenantId}::uuid
         LIMIT 1
      `.execute(transaction)).rows[0];
      if (!projection) return undefined;

      await sql`SELECT set_config('app.current_tenant_id', ${projection.tenantId}, true)`.execute(transaction);
      const principal = (await sql<{ principalId: string; authEpoch: number }>`
        SELECT resolved.principal_id::text AS "principalId", resolved.auth_epoch AS "authEpoch"
          FROM master.fn_resolve_principal_identity(
            ${projection.tenantId}::uuid,
            'keycloak'::master.identity_provider_d,
            ${input.realmKey},
            ${input.subject}
          ) AS resolved
         LIMIT 1
      `.execute(transaction)).rows[0];
      if (!principal) return undefined;

      await sql`SELECT set_config('app.current_principal_id', ${principal.principalId}, true)`.execute(transaction);
      const identity: VerifiedIdentity = Object.freeze({
        planeKey: input.planeKey,
        realmKey: input.realmKey,
        tenantId: projection.tenantId,
        principalId: principal.principalId,
        authEpoch: principal.authEpoch,
      });
      const resolver = createKyselyPermissionResolver({
        run: (_identity, work) => work(transaction),
      });
      const permissions = await resolver.resolve(identity);
      return Object.freeze({
        tenantId: identity.tenantId,
        principalId: identity.principalId,
        authEpoch: identity.authEpoch,
        permissions,
      });
    });
  };
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
