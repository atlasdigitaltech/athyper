import { sql, type Transaction } from "kysely";
import type { PublicationVerifier } from "@athyper/server-contract-publication";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import {
  createInstalledReferenceResourceReader,
  createInstalledIdentityReviewStore,
  resolveInstalledAuthoringDescriptor,
  type InstalledReferenceResourcePin,
} from "./installed-reference-resources.js";
import { createLegacyIdentityReviewResolver } from "./legacy-identity-review.js";
import type { ProductReferenceEnrollmentOptions } from "./product-reference-enrollment.js";
import type {
  LegacyOwnershipInput,
  LegacyOwnershipResult,
} from "./legacy-ownership-initialization.js";
import type { LegacyIdentityInstallationResult } from "./legacy-identity-installation.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
type Tx = Transaction<Record<string, never>>;
/** Trusted host composition. Resource pins are installed configuration; review
 * selection is exact source metadata, with no entity allowlist or key convention. */
export function createProductReferenceResourcePolicies(options: {
  authorityTenantId: string;
  descriptorPin: InstalledReferenceResourcePin;
  descriptorHash: string;
  maximumBytes: number;
  maximumReleases: number;
  supportedLocales: readonly string[];
  verifier: PublicationVerifier;
  authorizeReview: Parameters<
    typeof createInstalledReferenceResourceReader
  >[0]["authorizeReview"];
  audit(
    tx: Tx,
    context: VerifiedRequestContext,
    input: LegacyOwnershipInput,
    result: LegacyOwnershipResult | LegacyIdentityInstallationResult,
  ): Promise<void>;
}): ProductReferenceEnrollmentOptions["resolvePolicies"] {
  const config = structuredClone({
    descriptorPin: options.descriptorPin,
    descriptorHash: options.descriptorHash,
    maximumBytes: options.maximumBytes,
    maximumReleases: options.maximumReleases,
    supportedLocales: options.supportedLocales,
    authorityTenantId: options.authorityTenantId,
  });
  if (
    config.descriptorPin.kind !== "entity_authoring_descriptor" ||
    !options.audit ||
    !Number.isSafeInteger(config.maximumReleases) ||
    config.maximumReleases < 1 ||
    !config.supportedLocales.length
  )
    throw Error("PRODUCT_REFERENCE_RESOURCE_CONFIGURATION_INVALID");
  const read = createInstalledReferenceResourceReader({
    ...options,
    maximumBytes: config.maximumBytes,
  });
  return async (tx, context, input) => {
    const descriptor = await resolveInstalledAuthoringDescriptor(
      tx,
      config.descriptorPin,
      read,
      config.descriptorHash,
    );
    const admit = async (transaction: Tx, command: LegacyOwnershipInput) => {
      if (
        context.tenantId !== config.authorityTenantId ||
        context.principalId !== command.actorId ||
        command.changeSetId !== input.changeSetId ||
        command.entityId !== input.entityId
      )
        throw new AuthoringPolicyError(
          "PRODUCT_REFERENCE_SCOPE_CHANGED",
          "Exact admitted source scope required.",
        );
      await resolveInstalledAuthoringDescriptor(
        transaction,
        config.descriptorPin,
        read,
        config.descriptorHash,
      );
    };
    const audit = (
      transaction: Tx,
      command: LegacyOwnershipInput,
      result: LegacyOwnershipResult | LegacyIdentityInstallationResult,
    ) => options.audit(transaction, context, command, result);
    return {
      ownership: {
        schemaVersion: descriptor.schemaVersion,
        authoringSchemaHash: descriptor.authoringSchemaHash,
        admit,
        audit,
      },
      identities: {
        maximumBytes: config.maximumBytes,
        maximumReleases: config.maximumReleases,
        supportedLocales: config.supportedLocales,
        authoringSchemaHash: descriptor.authoringSchemaHash,
        admit,
        audit,
        async resolveReview(transaction, command, source) {
          const pins = (
            await sql<InstalledReferenceResourcePin>`SELECT r.release_key AS "publicationKey",r.id AS "releaseId",c.unsigned_hash AS "unsignedHash",a.content_hash AS "artifactHash",a.artifact_kind AS kind FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id AND a.plane_code='studio' JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.artifact_kind=a.artifact_kind AND c.plane_code='studio' JOIN runtime_meta.applied_release installed ON installed.source_release_id=r.id AND installed.artifact_hash=a.content_hash JOIN runtime_meta.release_activation_head h ON h.applied_release_id=installed.id WHERE r.tenant_id=${config.authorityTenantId}::uuid AND r.status='published' AND a.status='signed' AND a.artifact_kind='entity_identity_review' AND installed.status='active' AND c.unsigned_document#>>'{envelope,payload,entityId}'=${command.entityId} AND c.unsigned_document#>>'{envelope,payload,changeSetId}'=${command.changeSetId} AND c.unsigned_document#>>'{envelope,payload,sourceHash}'=${command.expectedSourceHash} LIMIT 2 FOR SHARE OF r,a,c,installed,h`.execute(
              transaction,
            )
          ).rows;
          if (pins.length !== 1)
            throw new AuthoringPolicyError(
              "LEGACY_IDENTITY_REVIEW_UNAVAILABLE",
              "One exact installed identity review is required.",
            );
          return createLegacyIdentityReviewResolver({
            store: createInstalledIdentityReviewStore({ read, pin: pins[0]! }),
            authoringSchemaHash: descriptor.authoringSchemaHash,
            maximumBytes: config.maximumBytes,
          })(transaction, command, source);
        },
      },
    };
  };
}
