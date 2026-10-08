import { sql, type Kysely } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  EntityAuthoringResourceSource,
  PublicationCanonicalizer,
} from "@athyper/server-contract-publication";
import {
  createAuthoringResourceReview,
  KyselyPublicationAuthorityRepository,
} from "@athyper/server-service-publication";
import {
  createKyselyPermissionResolver,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import {
  assertPlatformAuthority,
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";
type Database = Kysely<Record<string, never>>;
/** Authenticated producer/review composition; installed source readers and
 * semantic validators are host capabilities, never HTTP-provided callbacks. */
export function createControlResourceReview(options: {
  database: Database;
  authority: PlatformAuthority;
  canonical: PublicationCanonicalizer;
  audit: AuditRecorder<Database>;
  readSnapshot(id: string): Promise<EntityAuthoringResourceSource>;
  qualify(tx: Database, source: EntityAuthoringResourceSource): Promise<void>;
}) {
  const authority = validatePlatformAuthority(options.authority);
  return createAuthoringResourceReview<VerifiedRequestContext>({
    canonical: options.canonical,
    async run(context, work) {
      assertPlatformAuthority(context, authority);
      return options.database
        .transaction()
        .setIsolationLevel("serializable")
        .execute(async (tx) => {
          await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${authority.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
            tx,
          );
          const principal =
            await sql`SELECT id FROM master.principal WHERE id=${context.principalId}::uuid AND tenant_id=${authority.tenantId}::uuid AND principal_type='user' AND status='active' AND auth_epoch=${context.authEpoch}`.execute(
              tx,
            );
          if (principal.rows.length !== 1)
            throw Error("RESOURCE_REVIEW_ACTOR_INACTIVE");
          const permissions = await createKyselyPermissionResolver({
            run: (_identity, fn) => fn(tx),
          }).resolve(context);
          const refreshed = {
            ...context,
            permissions,
            profileHash: permissions.profileHash,
          };
          return work({
            repository: new KyselyPublicationAuthorityRepository(
              tx,
              options.canonical,
              true,
            ),
            source: options.readSnapshot,
            async inspect(id) {
              const result = await sql<{
                row: {
                  created_by: string;
                  approved_by: string | null;
                  release_hash: string;
                  status: string;
                } | null;
              }>`SELECT publication.read_authoring_resource(${id}::uuid) AS row`.execute(
                tx,
              );
              const row = result.rows[0]?.row;
              return row
                ? {
                    authorId: row.created_by,
                    reviewerId: row.approved_by,
                    sourceHash: row.release_hash,
                    status: row.status,
                  }
                : null;
            },
            async authorize(action, releaseId, authorId) {
              const separated =
                action !== "approve" || authorId !== context.principalId;
              const decision = await createPermissionAuthorizer({
                policyGate: {
                  evaluate: async () => ({
                    allowed: separated,
                    sodSatisfied: action === "approve" && separated,
                  }),
                },
              }).authorize({
                context: refreshed,
                permissionCode:
                  action === "propose"
                    ? "studio.metadata.contract.edit"
                    : "studio.metadata.contract.review",
                resource: { tenantId: authority.tenantId, releaseId },
              });
              if (!decision.allowed) throw Error("RESOURCE_REVIEW_FORBIDDEN");
              return {
                actorId: context.principalId,
                tenantId: authority.tenantId,
              };
            },
            qualify: (source) => options.qualify(tx, source),
            async audit(action, releaseId, sourceHash) {
              const event = await options.audit.record(
                {
                  eventCode: "metadata.entity.product.review",
                  action: "resource_" + action,
                  outcome: "success",
                  severity: "critical",
                  tenantId: authority.tenantId,
                  actor: { kind: "user", principalId: context.principalId },
                  entityType: "publication.release",
                  entityId: releaseId,
                  requestId: context.requestId,
                  metadata: {
                    sourceHash,
                    resourceAction: action,
                    authEpoch: context.authEpoch,
                  },
                },
                tx,
              );
              if (
                !event.id ||
                event.actor.principalId !== context.principalId ||
                event.tenantId !== authority.tenantId
              )
                throw Error("RESOURCE_REVIEW_AUDIT_REQUIRED");
            },
          });
        });
    },
  });
}
