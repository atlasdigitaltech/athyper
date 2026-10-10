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
  HistoricalOwnershipInput,
  HistoricalOwnershipPolicy,
} from "./historical-ownership-initialization.js";
import type { HistoricalIdentityInstallationPolicy } from "./historical-identity-installation.js";

import type {
  NativeConversionApplicationPolicy,
  NativeConversionApplicationInput,
  applyNativeGraphConversion,
} from "./native-conversion-application.js";
import {
  withCanonicalNativeSchemaQualification,
  qualifyCanonicalNativeSchema,
  type InstalledNativeSchemaEvidence,
} from "./native-schema-qualification.js";

import type {
  NativeBootstrapInput,
  NativeBootstrapPolicy,
  NativeRootRegistration,
} from "./native-bootstrap-application.js";
export type ProductNativeBootstrapCommand = Omit<
  NativeBootstrapInput,
  "actorId" | "tenantId"
>;

type Database = Kysely<Record<string, never>>;
type Tx = Transaction<Record<string, never>>;
export type ProductReferenceCommand = Omit<
  HistoricalOwnershipInput,
  "actorId" | "tenantId"
>;
export interface ProductReferenceEnrollmentOptions {
  database: Database;
  authority: ReturnType<
    typeof createProductCommandAuthority<VerifiedRequestContext>
  >;
  nativeBootstrap?: {
    resolve(
      tx: Tx,
      context: VerifiedRequestContext,
      command: NativeBootstrapInput,
    ): Promise<{
      policy: NativeBootstrapPolicy;
      schema: InstalledNativeSchemaEvidence;
    }>;
    /** Reads the root declaration from the same pinned proposal. This performs
     * no database write and accepts no root attributes from the request. */
    resolveRootRegistration(
      context: VerifiedRequestContext,
      command: NativeBootstrapInput,
    ): Promise<NativeRootRegistration>;
  };
  /** Optional installed composition, never request-supplied. Schema qualification
   * is mandatory here, including replay; authoring admission alone is insufficient. */
  nativeConversion?: {
    resolve(
      tx: Tx,
      context: VerifiedRequestContext,
      command: NativeConversionApplicationInput,
    ): Promise<{
      policy: NativeConversionApplicationPolicy;
      schema: InstalledNativeSchemaEvidence;
    }>;
    audit(
      tx: Tx,
      context: VerifiedRequestContext,
      command: NativeConversionApplicationInput,
      result: Awaited<ReturnType<typeof applyNativeGraphConversion>>,
    ): Promise<void>;
  };
  /** Resolves and pins current installed descriptor, audit and review resources
   * inside each admitted transaction. No static fixture policy or request DTO. */
  resolvePolicies(
    tx: Tx,
    context: VerifiedRequestContext,
    command: HistoricalOwnershipInput,
  ): Promise<{
    ownership: HistoricalOwnershipPolicy;
    identities: HistoricalIdentityInstallationPolicy;
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
    kind: "ownership" | "identities" | "native-format-conversion",
    context: VerifiedRequestContext,
    input: ProductReferenceCommand,
  ) {
    if (
      kind === "native-format-conversion" &&
      (!options.nativeConversion?.resolve || !options.nativeConversion.audit)
    )
      throw new AuthoringPolicyError(
        "NATIVE_CONVERSION_HOST_NOT_CONFIGURED",
        "Installed conversion resources and transactional audit are required.",
      );
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
    const command: HistoricalOwnershipInput = {
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
        if (admitted.kind === "native-format-conversion") {
          const binding = options.nativeConversion!;
          const resolved = await binding.resolve(
            tx,
            structuredClone(capturedContext),
            structuredClone(admitted.input),
          );
          if (!resolved?.policy || !resolved.schema)
            throw new AuthoringPolicyError(
              "NATIVE_CONVERSION_HOST_NOT_CONFIGURED",
              "Installed conversion and schema evidence are required.",
            );
          const policy = withCanonicalNativeSchemaQualification(
            resolved.policy,
            resolved.schema,
          );
          const repository = new KyselyMetaEntityAuthoringRepository(
            tx,
            undefined,
            undefined,
            undefined,
            policy.host,
            policy,
          );
          const result = await repository.executeNativeConversion(
            admitted.input,
          );
          // Audit participates in the same admission transaction, including replay.
          // Failure rolls back the conversion rather than obscuring a committed write.
          await binding.audit(
            tx,
            structuredClone(capturedContext),
            structuredClone(admitted.input),
            structuredClone(result),
          );
          return result;
        }
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
          ? repository.executeHistoricalOwnershipInitialization(admitted.input)
          : repository.executeHistoricalIdentityInstallation(admitted.input);
      },
    });
  }
  async function bootstrapNative(
    context: VerifiedRequestContext,
    input: ProductNativeBootstrapCommand,
  ) {
    if (!options.nativeBootstrap?.resolve)
      throw new AuthoringPolicyError(
        "NATIVE_BOOTSTRAP_HOST_NOT_CONFIGURED",
        "Installed bootstrap resources are required.",
      );
    if (
      !input ||
      Object.keys(input).sort().join() !==
        "changeSetId,entityId,idempotencyKey,proposalHash"
    )
      throw new AuthoringPolicyError(
        "PRODUCT_REFERENCE_INPUT_INVALID",
        "Only canonical bootstrap coordinates are accepted.",
      );
    const capturedContext = structuredClone(context);
    const command: NativeBootstrapInput = {
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
        creationEntityId: command.entityId,
      },
      command: { kind: "native-bootstrap", input: command },
      async execute(database, admitted) {
        const tx = database as Tx;
        const row =
          await sql`SELECT entity_command_private.admitted_creation(${admitted.input.changeSetId}::uuid,${admitted.input.entityId}::uuid) AS allowed`.execute(
            tx,
          );
        if (
          row.rows.length !== 1 ||
          (row.rows[0] as { allowed?: boolean }).allowed !== true
        )
          throw new AuthoringPolicyError(
            "PRODUCT_REFERENCE_ADMISSION_REQUIRED",
            "An exact product creation admission is required.",
          );
        const resolved = await options.nativeBootstrap!.resolve(
          tx,
          structuredClone(capturedContext),
          structuredClone(admitted.input),
        );
        if (!resolved?.policy || !resolved.schema)
          throw new AuthoringPolicyError(
            "NATIVE_BOOTSTRAP_HOST_NOT_CONFIGURED",
            "Installed bootstrap and schema evidence are required.",
          );
        const installedSchema = structuredClone(resolved.schema);
        const policy: NativeBootstrapPolicy = {
          ...resolved.policy,
          async qualify(transaction, coordinate) {
            await qualifyCanonicalNativeSchema(transaction, installedSchema);
            await resolved.policy.qualify(transaction, coordinate);
          },
        };
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          policy.host,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          policy,
        );
        return repository.executeNativeBootstrap(admitted.input);
      },
    });
  }
  async function registerNativeRoot(
    context: VerifiedRequestContext,
    input: ProductNativeBootstrapCommand,
  ) {
    if (!options.nativeBootstrap?.resolveRootRegistration)
      throw new AuthoringPolicyError(
        "NATIVE_ROOT_REGISTRATION_HOST_NOT_CONFIGURED",
        "Installed immutable root registration resources are required.",
      );
    if (
      !input ||
      Object.keys(input).sort().join() !==
        "changeSetId,entityId,idempotencyKey,proposalHash"
    )
      throw new AuthoringPolicyError(
        "PRODUCT_REFERENCE_INPUT_INVALID",
        "Only canonical root-registration coordinates are accepted.",
      );
    const capturedContext = structuredClone(context);
    const command: NativeBootstrapInput = {
      ...structuredClone(input),
      actorId: capturedContext.principalId,
      tenantId: null,
    };
    const registration = await options.nativeBootstrap.resolveRootRegistration(
      capturedContext,
      structuredClone(command),
    );
    if (
      !registration ||
      registration.entityCode.length === 0 ||
      registration.ownershipModel !== "system"
    )
      throw new AuthoringPolicyError(
        "NATIVE_ROOT_REGISTRATION_INVALID",
        "The installed proposal does not declare an eligible fresh system root.",
      );
    return withProductCommandAuthority({
      authority: options.authority,
      database: options.database,
      context: capturedContext,
      scope: {
        authorityTenantId: capturedContext.tenantId,
        actorId: capturedContext.principalId,
        changeSetId: command.changeSetId,
        rootRegistration: { entityId: command.entityId, ...registration },
      },
      command: { kind: "native-root-registration", input: command },
      async execute(_database, admitted) {
        // The security-definer admission routine inserts or verifies the exact
        // root attributes stored in its issuer ticket. The app role receives no
        // root-table privilege and therefore cannot broaden this phase.
        return { entityId: admitted.input.entityId, replay: true };
      },
    });
  }
  return {
    registerNativeRoot,
    bootstrapNative,
    convertNative: (
      context: VerifiedRequestContext,
      input: ProductReferenceCommand,
    ) => execute("native-format-conversion", context, input),
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
