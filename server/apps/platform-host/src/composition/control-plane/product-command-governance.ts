import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import type { ProductCommandGovernance } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createKyselyPermissionResolver,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import { createMetaEntityAuthoringAuthorizer } from "../shared/entity-governance/meta-entity-authoring-authorizer.js";
import {
  assertPlatformAuthority,
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";

const denied = () =>
  new AuthoringPolicyError(
    "PRODUCT_COMMAND_AUTHORITY_DENIED",
    "Current platform authoring authority is required.",
  );
/** The independent control API's existing authoring gate, not the composer UI or
 * a publication-review receipt. Reload IAM evidence for every issuance/replay.
 * This resolver confers no database issuer membership or publication approval. */
export function createControlProductCommandGovernance(options: {
  database: Kysely<Record<string, never>>;
  authority: PlatformAuthority;
}): ProductCommandGovernance<VerifiedRequestContext> {
  const authority = validatePlatformAuthority(options.authority);
  const authorizer = createMetaEntityAuthoringAuthorizer(
    createPermissionAuthorizer(),
    async () => null,
  );
  return {
    async authorize(context, scope, requestHash) {
      context = structuredClone(context);
      try {
        assertPlatformAuthority(context, authority);
      } catch {
        throw denied();
      }
      if (
        scope.actorId !== context.principalId ||
        scope.authorityTenantId !== context.tenantId ||
        !/^[a-f0-9]{64}$/.test(requestHash) ||
        (scope.creationEntityId !== undefined &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            scope.creationEntityId,
          )) ||
        (scope.rootRegistration !== undefined &&
          (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            scope.rootRegistration.entityId,
          ) ||
            !/^[a-z][a-z0-9_.-]{1,62}$/.test(
              scope.rootRegistration.moduleCode,
            ) ||
            !/^[a-z][a-z0-9_]{1,62}$/.test(scope.rootRegistration.entityCode) ||
            ![
              "business",
              "configuration",
              "reference",
              "process",
              "projection",
              "technical",
            ].includes(scope.rootRegistration.entityClass) ||
            scope.rootRegistration.ownershipModel !== "system")) ||
        (scope.creationEntityId !== undefined &&
          scope.rootRegistration !== undefined)
      )
        throw denied();
      await options.database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
            tx,
          );
          const actors = await sql`SELECT p.id FROM master.principal p
          WHERE p.id=${context.principalId}::uuid AND p.tenant_id=${authority.tenantId}::uuid
          AND p.principal_type='user' AND p.status='active' AND p.auth_epoch=${context.authEpoch}
          AND EXISTS(SELECT 1 FROM master.principal_identity_binding b WHERE b.principal_id=p.id AND b.tenant_id=p.tenant_id
            AND b.provider_code='keycloak' AND b.realm_key=${authority.realmKey} AND b.issuer=${authority.issuer}
            AND b.audience=${authority.audience} AND b.status='active' AND b.service_client_id IS NULL)`.execute(
            tx,
          );
          if (actors.rows.length !== 1) throw denied();
          const roots =
            scope.rootRegistration !== undefined
              ? await sql<{
                  entity_id: string;
                }>`SELECT ${scope.rootRegistration.entityId}::uuid AS entity_id
                WHERE NOT EXISTS(
                  SELECT 1 FROM metadata.entity e
                  WHERE e.id=${scope.rootRegistration.entityId}::uuid
                    AND (e.tenant_id IS DISTINCT FROM NULL OR e.entity_code<>${scope.rootRegistration.entityCode}
                      OR e.entity_class<>${scope.rootRegistration.entityClass}
                      OR e.ownership_model<>${scope.rootRegistration.ownershipModel}
                      OR NOT EXISTS(SELECT 1 FROM control.module m WHERE m.id=e.module_id
                        AND m.code=${scope.rootRegistration.moduleCode} AND m.status='active'))
                )`.execute(tx)
              : scope.creationEntityId !== undefined
                ? await sql<{
                    entity_id: string;
                  }>`SELECT e.id AS entity_id FROM metadata.entity e
                WHERE e.id=${scope.creationEntityId}::uuid AND e.tenant_id IS NULL AND e.ownership_model='system'
                AND NOT EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.id=${scope.changeSetId}::uuid
                  AND (c.entity_id<>e.id OR c.tenant_id IS NOT NULL OR c.status NOT IN ('draft','rejected')))`.execute(
                    tx,
                  )
                : await sql<{
                    entity_id: string;
                  }>`SELECT c.entity_id FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
            WHERE c.id=${scope.changeSetId}::uuid AND c.tenant_id IS NULL AND e.tenant_id IS NULL
            AND e.ownership_model='system' AND c.status IN ('draft','rejected')`.execute(
                    tx,
                  );
          if (roots.rows.length !== 1) throw denied();
          const permissions = await createKyselyPermissionResolver({
            run: (_identity, work) => work(tx),
          }).resolve(context);
          const refreshed = {
            ...context,
            permissions,
            profileHash: permissions.profileHash,
          };
          // Reuse the existing internal authoring verb mapping; no entity-specific
          // grant, inferred permission code or independent permission catalogue.
          const decision = await authorizer.authorize({
            context: refreshed,
            permissionCode: "metadata.entity.author",
            resource: {
              tenantId: authority.tenantId,
              changeSetId: scope.changeSetId,
              entityId: roots.rows[0]!.entity_id,
              requestHash,
            },
          });
          if (!decision.allowed) throw denied();
        });
    },
  };
}
