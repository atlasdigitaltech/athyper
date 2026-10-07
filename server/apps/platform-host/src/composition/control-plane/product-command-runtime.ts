import { parseReferenceResourceConfiguration } from "./reference-resource-configuration.js";
import { sql, type Kysely } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { NormalizedAuthoringPolicy } from "@athyper/server-contract-meta-entity-authoring";
import {
  createProductCommandAuthority,
  createProductLabelHost,
  createProductReferenceResourcePolicies,
  type ProductReferenceEnrollmentOptions,
  type createProductLabelEnrollment,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createControlProductCommandGovernance } from "./product-command-governance.js";
import type { PlatformAuthority } from "../shared/identity/platform-authority.js";
type Database = Kysely<Record<string, never>>;
/** Installs no grants. Startup verifies the separate issuer and command login
 * roles before binding the canonical executor to the control API. */
export async function createControlProductCommandRuntime(options: {
  governanceDatabase: Database;
  issuerDatabase: Database;
  commandDatabase: Database;
  applicationLogin: string;
  authority: PlatformAuthority;
  labels: NormalizedAuthoringPolicy;
  audit: AuditRecorder<Database>;
  referenceResources?: Parameters<
    typeof createProductReferenceResourcePolicies
  >[0];
}): Promise<
  Parameters<typeof createProductLabelEnrollment>[0] & {
    referenceEnrollment?: ProductReferenceEnrollmentOptions;
  }
> {
  async function role(db: Database) {
    const result = await sql<{
      login: string;
      database: string;
      safe: boolean;
      issuer: boolean;
      application: boolean;
      owner: boolean;
      isolated: boolean;
    }>`
      SELECT session_user::text AS login,current_database()::text AS database,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AS safe,
        pg_has_role(session_user,'athyper_product_command_issuer','MEMBER') AS issuer,
        pg_has_role(session_user,'athyper_product_command_app','MEMBER') AS application,
        pg_has_role(session_user,'athyper_product_command_owner','MEMBER') AS owner,
        NOT EXISTS (SELECT 1 FROM pg_roles other WHERE other.rolname<>session_user
          AND other.rolname NOT IN ('athyper_product_command_issuer','athyper_product_command_app')
          AND pg_has_role(session_user,other.oid,'MEMBER')) AS isolated
      FROM pg_roles r WHERE r.rolname=session_user AND current_user=session_user`.execute(
      db,
    );
    if (
      result.rows.length !== 1 ||
      !result.rows[0]!.safe ||
      result.rows[0]!.owner ||
      result.rows[0]!.isolated !== true ||
      result.rows[0]!.database !== "athyper_studio"
    )
      throw Error("PRODUCT_COMMAND_LOGIN_UNSAFE");
    return result.rows[0]!;
  }
  const issuer = await role(options.issuerDatabase),
    application = await role(options.commandDatabase);
  if (
    !issuer.issuer ||
    issuer.application ||
    !application.application ||
    application.issuer ||
    application.login !== options.applicationLogin ||
    issuer.login === application.login
  )
    throw Error("PRODUCT_COMMAND_LOGIN_SEPARATION_REQUIRED");
  // This is the existing transactional audit sink's exact database contract.
  // Installation must grant schema usage and this function only, not audit-table DML.
  const auditAccess = await sql<{ allowed: boolean }>`SELECT
    has_schema_privilege(current_user,'audit','USAGE') AND
    has_function_privilege(current_user,
      'audit.append_event(text,audit.operation_d,text,uuid,audit.outcome_d,audit.event_severity_d,text,uuid,uuid,text,jsonb,jsonb,text[],jsonb,uuid,text,timestamp with time zone)',
      'EXECUTE') AS allowed`.execute(options.commandDatabase);
  if (auditAccess.rows.length !== 1 || auditAccess.rows[0]?.allowed !== true)
    throw Error("PRODUCT_COMMAND_AUDIT_PRIVILEGE_REQUIRED");
  const labels = Object.freeze(structuredClone(options.labels));
  if (
    !Number.isSafeInteger(labels.maxBatchBytes) ||
    labels.maxBatchBytes < 1 ||
    !Number.isSafeInteger(labels.maxCommands) ||
    labels.maxCommands < 1 ||
    !Array.isArray(labels.supportedLocales) ||
    !labels.supportedLocales.length ||
    labels.supportedLocales.some(
      (value) => typeof value !== "string" || !value.trim(),
    ) ||
    new Set(labels.supportedLocales).size !== labels.supportedLocales.length
  )
    throw Error("PRODUCT_COMMAND_LABEL_POLICY_INVALID");
  const runtime: Parameters<typeof createProductLabelEnrollment>[0] & {
    referenceEnrollment?: ProductReferenceEnrollmentOptions;
  } = {
    database: options.commandDatabase,
    authority: createProductCommandAuthority({
      issuer: options.issuerDatabase,
      applicationLogin: options.applicationLogin,
      governance: createControlProductCommandGovernance({
        database: options.governanceDatabase,
        authority: options.authority,
      }),
    }),
    labels,
    host: createProductLabelHost(),
    async audit(tx, context, input, result) {
      const event = await options.audit.record(
        {
          eventCode: "metadata.entity.product.enrollment",
          action: "enroll_labels",
          outcome: "success",
          severity: "critical",
          tenantId: context.tenantId,
          actor: { kind: "user", principalId: context.principalId },
          entityType: "metadata.entity_change_set",
          entityId: input.changeSetId,
          requestId: context.requestId,
          metadata: {
            sourceHash: result.sourceHash,
            proposalHash: result.proposalHash,
            revision: result.revision,
            idempotencyKey: input.proposal.idempotencyKey,
          },
        },
        tx,
      );
      if (
        !event.id ||
        event.tenantId !== context.tenantId ||
        event.actor.principalId !== context.principalId
      )
        throw Error("PRODUCT_COMMAND_AUDIT_REQUIRED");
    },
  };
  if (options.referenceResources) {
    if (
      options.referenceResources.authorityTenantId !==
      options.authority.tenantId
    )
      throw Error("PRODUCT_REFERENCE_AUTHORITY_MISMATCH");
    const resourceConfig = parseReferenceResourceConfiguration({
      descriptorPin: options.referenceResources.descriptorPin,
      descriptorHash: options.referenceResources.descriptorHash,
      maximumBytes: options.referenceResources.maximumBytes,
      maximumReleases: options.referenceResources.maximumReleases,
      supportedLocales: options.referenceResources.supportedLocales,
    });
    const reads = await sql<{ allowed: boolean }>`SELECT
      has_function_privilege(current_user,'entity_command_private.read_reference_resource(uuid,text,text,text,text,integer)','EXECUTE') AND
      has_function_privilege(current_user,'entity_command_private.find_identity_review(uuid,uuid,text)','EXECUTE') AS allowed`.execute(
      options.commandDatabase,
    );
    if (reads.rows.length !== 1 || reads.rows[0]?.allowed !== true)
      throw Error("PRODUCT_REFERENCE_RESOURCE_READ_PRIVILEGE_REQUIRED");
    runtime.referenceEnrollment = {
      database: runtime.database,
      authority: runtime.authority,
      resolvePolicies: createProductReferenceResourcePolicies({
        ...options.referenceResources,
        ...resourceConfig,
      }),
    };
  }
  return runtime;
}
