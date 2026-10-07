import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import {
  withProductCommandAuthority,
  type createProductCommandAuthority,
} from "./product-command-authority.js";
import type {
  LegacyOwnershipInput,
  LegacyOwnershipPolicy,
} from "./legacy-ownership-initialization.js";
import type { LegacyIdentityInstallationPolicy } from "./legacy-identity-installation.js";

type Database = Kysely<Record<string, never>>;
type Tx = Transaction<Record<string, never>>;
export type ProductReferenceCommand = Omit<
  LegacyOwnershipInput,
  "actorId" | "tenantId"
>;
export interface ProductReferenceEnrollmentOptions {
  database: Database;
  authority: ReturnType<
    typeof createProductCommandAuthority<VerifiedRequestContext>
  >;
  /** Resolves and pins current installed descriptor, audit and review resources
   * inside each admitted transaction. No static fixture policy or request DTO. */
  resolvePolicies(
    tx: Tx,
    context: VerifiedRequestContext,
    command: LegacyOwnershipInput,
  ): Promise<{
    ownership: LegacyOwnershipPolicy;
    identities: LegacyIdentityInstallationPolicy;
  }>;
}
/** Uses the same issuer/application separation and serializable command
 * transaction as label enrollment. It never opens an administrator connection. */
export function createProductReferenceEnrollment(
  options: ProductReferenceEnrollmentOptions,
) {
  if (!options.resolvePolicies || !options.authority || !options.database)
    throw Error("PRODUCT_REFERENCE_RUNTIME_REQUIRED");
  async function execute(
    kind: "ownership" | "identities",
    context: VerifiedRequestContext,
    input: ProductReferenceCommand,
  ) {
    const capturedContext = structuredClone(context);
    // Reject authority injection even for callers bypassing the HTTP parser.
    if (
      Object.keys(input).sort().join() !==
      "changeSetId,entityId,expectedRevision,expectedSourceHash,idempotencyKey"
    )
      throw new AuthoringPolicyError(
        "PRODUCT_REFERENCE_INPUT_INVALID",
        "Only canonical command coordinates are accepted.",
      );
    const command: LegacyOwnershipInput = {
      ...structuredClone(input),
      actorId: capturedContext.principalId,
      tenantId: null,
    };
    return withProductCommandAuthority({
      authority: options.authority,
      database: options.database,
      context: capturedContext,
      scope: {
        authorityTenantId: capturedContext.tenantId,
        actorId: capturedContext.principalId,
        changeSetId: command.changeSetId,
      },
      command: { kind, input: command },
      async execute(database, admitted) {
        const tx = database as Tx;
        const row =
          await sql`SELECT c.id FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
     WHERE c.id=${admitted.input.changeSetId}::uuid AND c.entity_id=${admitted.input.entityId}::uuid
     AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'
     AND entity_command_private.admitted(c.id) AND current_setting('app.current_principal_id',true)=${admitted.input.actorId}`.execute(
            tx,
          );
        if (row.rows.length !== 1)
          throw new AuthoringPolicyError(
            "PRODUCT_REFERENCE_ADMISSION_REQUIRED",
            "An admitted exact product command is required.",
          );
        const policies = await options.resolvePolicies(
          tx,
          structuredClone(capturedContext),
          structuredClone(admitted.input),
        );
        if (
          !policies?.ownership ||
          !policies.identities ||
          policies.ownership.authoringSchemaHash !==
            policies.identities.authoringSchemaHash
        )
          throw new AuthoringPolicyError(
            "PRODUCT_REFERENCE_RESOURCE_MISMATCH",
            "Installed ownership and identity resources must share the qualified descriptor.",
          );
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          policies.ownership,
          policies.identities,
        );
        return admitted.kind === "ownership"
          ? repository.executeLegacyOwnershipInitialization(admitted.input)
          : repository.executeLegacyIdentityInstallation(admitted.input);
      },
    });
  }
  return {
    initializeOwnership: (
      context: VerifiedRequestContext,
      input: ProductReferenceCommand,
    ) => execute("ownership", context, input),
    installIdentities: (
      context: VerifiedRequestContext,
      input: ProductReferenceCommand,
    ) => execute("identities", context, input),
  };
}
