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
            await sql<InstalledReferenceResourcePin>`SELECT * FROM entity_command_private.find_identity_review(${command.changeSetId}::uuid,${command.entityId}::uuid,${command.expectedSourceHash})`.execute(
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
