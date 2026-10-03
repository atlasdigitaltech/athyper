import { sql, type Kysely, type Transaction } from "kysely";
import { calculateDefinitionHash, createKyselyPolicyRepository, createJsonRuleEvaluator } from "@athyper/server-platform-policy";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { MACHINE_PUBLICATION_PERMISSION, type MachinePublicationPolicyPin } from "./machine-policy.js";
import { assertDeploymentRecoverySource } from "./deployment-recovery-source.js";
import { parseDeploymentRecoveryPolicy, requireRecovery, type DeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
export async function assertPublicationWorkloadActor(database: Database, config: PublicationWorkloadConfiguration, role: "author" | "publisher") {
  const actor = config[role];
  const rows = (await sql`SELECT id FROM master.principal WHERE tenant_id=${config.tenantId}::uuid
    AND id=${actor.principalId}::uuid AND code=${actor.code} AND auth_epoch=${actor.authEpoch}
    AND principal_type='service_account' AND provisioning_source='internal' AND status='active'`.execute(database)).rows;
  requireRecovery(rows.length === 1, "WORKLOAD_REVOKED");
}
/** Runs in the caller's stamped authority transaction, including activation. */
export async function authorizeDeploymentRecovery(database: Database, config: PublicationWorkloadConfiguration,
  policy: DeploymentRecoveryPolicy, pin: MachinePublicationPolicyPin) {
  requireRecovery(database.isTransaction && policy.authorityTenantId === config.tenantId
    && config.environment === policy.environment && config.instance === policy.instance && config.domainSuffix === "dev.athyper.test"
    && config.author.principalId === policy.authorPrincipalId && config.publisher.principalId === policy.publisherPrincipalId,
  "EXECUTION_SCOPE_DENIED");
  await assertPublicationWorkloadActor(database, config, "publisher");
  // The bounded SQL source also revalidates both original human reviewers.
  const original = await assertDeploymentRecoverySource(database, policy, config.tenantId);
  const definition = await createKyselyPolicyRepository().findExact!({ planeKey: "studio", tenantId: config.tenantId,
    entityType: "metadata.publication", effectiveOn: new Date().toISOString().slice(0, 10), revision: pin }, database as Transaction<Record<string, never>>);
  requireRecovery(definition && definition.rules.length === 1 && calculateDefinitionHash(definition) === pin.hash, "ENROLLMENT_UNAVAILABLE");
  const rule = definition.rules[0]!, enrollment = rule.actionConfig;
  requireRecovery(rule.action === "allow" && enrollment.schema === "athyper.machine-publication-enrollment/1"
    && enrollment.environment === "dev" && enrollment.tenantId === config.tenantId && enrollment.permissionCode === MACHINE_PUBLICATION_PERMISSION
    && sha256(enrollment.policy) === sha256(policy) && createJsonRuleEvaluator().evaluate(rule.condition,
      { environment: "dev", tenantId: config.tenantId, policyHash: sha256(policy) }) === true, "ENROLLMENT_CHANGED");
  const active = (await sql<{ active: boolean }>`SELECT control.publication_policy_enrollment_is_active(
    ${pin.id}::uuid,${pin.hash},${policy.authorPrincipalId}::uuid,${policy.publisherPrincipalId}::uuid) active`.execute(database)).rows[0]?.active;
  requireRecovery(active === true, "ENROLLMENT_REVOKED");
  return original;
}
export async function findDeploymentRecovery(database: Database, config: PublicationWorkloadConfiguration, originalId: string) {
  const rows = (await sql<{ id: string; version: number; hash: string; policy: unknown }>`SELECT d.id,d.version_no version,d.definition_hash hash,
    r.action_config->'policy' policy FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
    WHERE d.tenant_id=${config.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
      AND r.action_config#>>'{policy,schema}'='athyper.dev-coordinated-deployment-recovery/1'
      AND r.action_config#>>'{policy,originalPolicy,id}'=${originalId}`.execute(database)).rows;
  requireRecovery(rows.length === 1, "EXACT_AUTHORITY_REQUIRED");
  const row = rows[0]!, policy = parseDeploymentRecoveryPolicy(row.policy), pin = { id: row.id, version: Number(row.version), hash: row.hash };
  const original = await authorizeDeploymentRecovery(database, config, policy, pin);
  return { policy, pin, original };
}
