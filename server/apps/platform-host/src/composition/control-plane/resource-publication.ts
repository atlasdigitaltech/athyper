import type { ComponentQualifier } from "../shared/publication/component-qualification.js";
import { resourceReadTransaction } from "./resource-read-transaction.js";
import { sql, type Kysely } from "kysely";
import type { PublicationCanonicalizer } from "@athyper/server-contract-publication";
import { createApprovedAuthoringResourcePublication } from "@athyper/server-service-publication";
import { validatePlatformAuthority } from "../shared/identity/platform-authority.js";
import { createCurrentResourceReviewEligibility } from "./resource-review-eligibility.js";
import { createResourceSourceQualification } from "./resource-source-qualification.js";

/** Optional worker binding. The ledger contains the reviewed immutable source;
 * mounted proposal files are not a second source for background publication. */
export function readResourcePublicationConfiguration(
  environment: NodeJS.ProcessEnv,
) {
  const descriptorHash = environment.PUBLICATION_AUTHORING_DESCRIPTOR_HASH;
  if (descriptorHash === undefined) return undefined;
  if (!/^[a-f0-9]{64}$/.test(descriptorHash))
    throw Error("RESOURCE_DESCRIPTOR_HASH_REQUIRED");
  const authority = validatePlatformAuthority({
    tenantId: environment.PLATFORM_AUTHORITY_TENANT_ID ?? "",
    realmKey: environment.PLATFORM_CONTROL_REALM ?? "",
    issuer: environment.PLATFORM_CONTROL_ISSUER_URL ?? "",
    audience: environment.PLATFORM_CONTROL_AUDIENCE ?? "",
  });
  return { descriptorHash, authority };
}

export function createResourcePublication(options: {
  database: Kysely<Record<string, never>>;
  configuration: NonNullable<
    ReturnType<typeof readResourcePublicationConfiguration>
  >;
  canonical: PublicationCanonicalizer;
  componentQualifier?: ComponentQualifier;
}) {
  const { database, configuration, canonical } = options;
  const eligible = createCurrentResourceReviewEligibility({
    database,
    authority: configuration.authority,
  });
  const qualify = createResourceSourceQualification(
    configuration.descriptorHash,
    canonical,
    options.componentQualifier,
  );
  return createApprovedAuthoringResourcePublication({
    database,
    authorityTenantId: configuration.authority.tenantId,
    maximumBytes: 4194304,
    canonical,
    async readSnapshot(releaseId) {
      return resourceReadTransaction(database, async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${configuration.authority.tenantId},true)`.execute(
          tx,
        );
        const rows = (
          await sql<{
            source: unknown;
          }>`SELECT metadata->'authoringResourceSource' AS source FROM publication.release WHERE id=${releaseId}::uuid AND tenant_id=${configuration.authority.tenantId}::uuid AND status IN ('approved','published')`.execute(
            tx,
          )
        ).rows;
        if (rows.length !== 1 || !rows[0]!.source)
          throw Error("AUTHORING_RESOURCE_APPROVED_SOURCE_REQUIRED");
        return rows[0]!.source;
      });
    },
    authorizeReview: eligible,
    async qualifyResource(source) {
      // Recheck committed review provenance before using its actor for scoped
      // read-only validation. This context cannot create an approval or write.
      await resourceReadTransaction(database, async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${configuration.authority.tenantId},true)`.execute(
          tx,
        );
        const rows = (
          await sql<{
            author_id: string;
            reviewer_id: string;
          }>`SELECT * FROM publication.read_authoring_resource_review(${source.releaseId}::uuid)`.execute(
            tx,
          )
        ).rows;
        if (rows.length !== 1)
          throw Error("RESOURCE_REVIEW_PROVENANCE_REQUIRED");
        await sql`SELECT set_config('app.current_principal_id',${rows[0]!.reviewer_id},true)`.execute(
          tx,
        );
        await qualify(tx, source);
      });
    },
  });
}
