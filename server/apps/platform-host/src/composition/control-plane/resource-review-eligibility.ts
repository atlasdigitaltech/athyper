import { resourceReadTransaction } from "./resource-read-transaction.js";
import { sql, type Kysely } from "kysely";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import {
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";
/** Background eligibility recheck only. Resolving current principals does not
 * authenticate a request or record approval; the immutable release supplies that
 * provenance. No session or assurance is manufactured here. */
export function createCurrentResourceReviewEligibility(options: {
  database: Kysely<Record<string, never>>;
  authority: PlatformAuthority;
}) {
  const authority = validatePlatformAuthority(options.authority);
  return async (input: {
    releaseId: string;
    authorId: string;
    reviewerId: string;
  }) => {
    if (
      !input.authorId ||
      !input.reviewerId ||
      input.authorId === input.reviewerId
    )
      throw Error("RESOURCE_REVIEW_ELIGIBILITY_DENIED");
    await resourceReadTransaction(options.database, async (tx) => {
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${authority.tenantId},true)`.execute(
        tx,
      );
      const provenance = (
        await sql<{
          author_id: string;
          reviewer_id: string;
        }>`SELECT * FROM publication.read_authoring_resource_review(${input.releaseId}::uuid)`.execute(
          tx,
        )
      ).rows;
      if (
        provenance.length !== 1 ||
        provenance[0]!.author_id !== input.authorId ||
        provenance[0]!.reviewer_id !== input.reviewerId
      )
        throw Error("RESOURCE_REVIEW_PROVENANCE_REQUIRED");
      for (const [principalId, permission] of [
        [input.authorId, "studio.metadata.contract.edit"],
        [input.reviewerId, "studio.metadata.contract.review"],
      ] as const) {
        await sql`SELECT set_config('app.current_principal_id',${principalId},true)`.execute(
          tx,
        );
        const rows = (
          await sql<{
            auth_epoch: number;
          }>`SELECT p.auth_epoch FROM master.principal p WHERE p.id=${principalId}::uuid AND p.tenant_id=${authority.tenantId}::uuid AND p.status='active' AND p.principal_type='user' AND EXISTS(SELECT 1 FROM master.principal_identity_binding b WHERE b.principal_id=p.id AND b.tenant_id=p.tenant_id AND b.provider_code='keycloak' AND b.realm_key=${authority.realmKey} AND b.issuer=${authority.issuer} AND b.audience=${authority.audience} AND b.status='active' AND b.service_client_id IS NULL)`.execute(
            tx,
          )
        ).rows;
        if (rows.length !== 1 || !Number.isSafeInteger(rows[0]!.auth_epoch))
          throw Error("RESOURCE_REVIEW_ELIGIBILITY_DENIED");
        const evidence = await createKyselyPermissionResolver({
          run: (_identity, work) => work(tx),
        }).resolve({
          planeKey: "studio",
          realmKey: authority.realmKey,
          tenantId: authority.tenantId,
          principalId,
          authEpoch: rows[0]!.auth_epoch,
        });
        if (
          evidence.tenantId !== authority.tenantId ||
          evidence.principalId !== principalId ||
          evidence.planeKey !== "studio" ||
          !evidence.entries.some(
            (e) => e.code === permission && e.status === "allow",
          ) ||
          evidence.denied.includes(permission) ||
          evidence.planLocked.includes(permission) ||
          evidence.planeExcluded.includes(permission) ||
          evidence.evidence?.some(
            (e) => e.permissionCode === permission && e.effect === "deny",
          ) ||
          !evidence.authorizationScopes.some(
            (s) =>
              s.permissionCode === permission &&
              s.tenantWide &&
              s.visibility === "all",
          )
        )
          throw Error("RESOURCE_REVIEW_ELIGIBILITY_DENIED");
      }
    });
  };
}
