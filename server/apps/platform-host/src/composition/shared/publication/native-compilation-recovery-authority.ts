import { sql, type Kysely, type Transaction } from "kysely";
import {
  calculateDefinitionHash,
  createKyselyPolicyRepository,
  createJsonRuleEvaluator,
} from "@athyper/server-platform-policy";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  MACHINE_PUBLICATION_PERMISSION,
  type MachinePublicationPolicyPin,
} from "./machine-policy.js";
import { assertNativeRecoverySource } from "./native-compilation-recovery-source.js";
import {
  parseNativeCompilationRecoveryPolicy,
  requireNativeRecovery as requireRecovery,
  type NativeCompilationRecoveryPolicy,
} from "./native-compilation-recovery-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
import { assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
/** Runs in the caller's stamped authority transaction, including activation. */
export async function authorizeNativeCompilationRecovery(
  database: Database,
  config: PublicationWorkloadConfiguration,
  policy: NativeCompilationRecoveryPolicy,
  pin: MachinePublicationPolicyPin,
  empty = false,
) {
  requireRecovery(
    database.isTransaction &&
      policy.authorityTenantId === config.tenantId &&
      config.environment === policy.environment &&
      config.instance === policy.instance &&
      config.domainSuffix === "dev.athyper.test" &&
      config.author.principalId === policy.authorPrincipalId &&
      config.publisher.principalId === policy.publisherPrincipalId,
    "EXECUTION_SCOPE_DENIED",
  );
  await assertPublicationWorkloadActor(database, config, "publisher");
  // The bounded SQL source also revalidates both original human reviewers.
  const original = await assertNativeRecoverySource(database, policy, empty);
  const definition = await createKyselyPolicyRepository().findExact!(
    {
      planeKey: "studio",
      tenantId: config.tenantId,
      entityType: "metadata.publication",
      effectiveOn: new Date().toISOString().slice(0, 10),
      revision: pin,
    },
    database as Transaction<Record<string, never>>,
  );
  requireRecovery(
    definition &&
      definition.rules.length === 1 &&
      calculateDefinitionHash(definition) === pin.hash,
    "ENROLLMENT_UNAVAILABLE",
  );
  const rule = definition.rules[0]!,
    enrollment = rule.actionConfig;
  requireRecovery(
    rule.action === "allow" &&
      enrollment.schema === "athyper.machine-publication-enrollment/1" &&
      enrollment.environment === "dev" &&
      enrollment.tenantId === config.tenantId &&
      enrollment.permissionCode === MACHINE_PUBLICATION_PERMISSION &&
      sha256(enrollment.policy) === sha256(policy) &&
      createJsonRuleEvaluator().evaluate(rule.condition, {
        environment: "dev",
        tenantId: config.tenantId,
        policyHash: sha256(policy),
      }) === true,
    "ENROLLMENT_CHANGED",
  );
  const active = (
    await sql<{
      active: boolean;
    }>`SELECT control.publication_policy_enrollment_is_active(
    ${pin.id}::uuid,${pin.hash},${policy.authorPrincipalId}::uuid,${policy.publisherPrincipalId}::uuid) active`.execute(
      database,
    )
  ).rows[0]?.active;
  requireRecovery(active === true, "ENROLLMENT_REVOKED");
  return original;
}
export async function findNativeCompilationRecovery(
  database: Database,
  config: PublicationWorkloadConfiguration,
  originalId: string,
) {
  const rows = (
    await sql<{
      id: string;
      version: number;
      hash: string;
      policy: unknown;
    }>`SELECT d.id,d.version_no version,d.definition_hash hash,
    r.action_config->'policy' policy FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
    WHERE d.tenant_id=${config.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
      AND r.action_config#>>'{policy,schema}'='athyper.dev-native-compilation-recovery/1'
      AND r.action_config#>>'{policy,originalPolicy,id}'=${originalId}`.execute(
      database,
    )
  ).rows;
  requireRecovery(rows.length <= 1, "EXACT_AUTHORITY_REQUIRED");
  if (rows.length === 0) return undefined;
  const row = rows[0]!,
    policy = parseNativeCompilationRecoveryPolicy(row.policy),
    pin = { id: row.id, version: Number(row.version), hash: row.hash };
  const original = await authorizeNativeCompilationRecovery(
    database,
    config,
    policy,
    pin,
  );
  return { policy, pin, original };
}
