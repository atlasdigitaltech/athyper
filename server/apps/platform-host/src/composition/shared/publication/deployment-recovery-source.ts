import { sql, type Kysely } from "kysely";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { assertDeploymentRecoveryCompiler } from "./deployment-recovery-compiler.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { assertDeploymentRecoveryWindow, requireRecovery, type DeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";

export interface DeploymentRecoverySource {
  policy: unknown; version: number;
  deliveries: (DeploymentRecoveryPolicy["deliveries"][number] & {
    status: string; environment: string; instance: string; artifactStatus: string;
    entityId: string; changeSetId: string; sourceStatus: string; acknowledged: boolean;
  })[];
}
export function validateDeploymentRecoverySource(policy: DeploymentRecoveryPolicy, source: DeploymentRecoverySource) {
  const original = parseHumanReviewedExecutionPolicy(source.policy);
  requireRecovery(source.version === policy.originalPolicy.version && original.authorityTenantId === policy.authorityTenantId
    && original.environment === policy.environment && original.instance === policy.instance
    && original.authorPrincipalId === policy.authorPrincipalId && original.publisherPrincipalId === policy.publisherPrincipalId
    && original.compiler.buildHash === policy.originalPolicy.compilerHash && sha256(original.plan) === policy.originalPolicy.coordinationHash,
  "ORIGINAL_CHANGED");
  requireRecovery(source.deliveries.length === policy.deliveries.length
    && source.deliveries.length === original.plan.members.reduce((n, m) => n + m.targets.length, 0), "GROUP_CHANGED");
  const coverage = new Set<string>();
  for (const pin of policy.deliveries) {
    const matches = source.deliveries.filter(d => d.deploymentId === pin.deploymentId);
    requireRecovery(matches.length === 1, "DELIVERY_CHANGED");
    const d = matches[0]!;
    for (const key of ["artifactId", "artifactHash", "releaseId", "plane", "attempt"] as const)
      requireRecovery(d[key] === pin[key], "DELIVERY_CHANGED");
    requireRecovery(d.environment === policy.environment && (d.instance === "*" || d.instance === original.instance) && d.artifactStatus === "signed" && d.sourceStatus === "published"
      && ["dispatched", "failed"].includes(d.status) && !d.acknowledged, "DELIVERY_NOT_RECOVERABLE");
    const member = original.plan.members.find(m => m.changeSetId === d.changeSetId && m.entityId === d.entityId);
    const key = `${d.changeSetId}:${d.plane}`;
    requireRecovery(member?.targets.some(t => t.plane === d.plane) && !coverage.has(key), "TARGET_CHANGED");
    coverage.add(key);
  }
  return original;
}
export async function assertDeploymentRecoverySource(database: Kysely<Record<string, never>>, policy: DeploymentRecoveryPolicy, tenantId: string) {
  requireRecovery(database.isTransaction && policy.authorityTenantId === tenantId, "AUTHORITY_MISMATCH");
  assertDeploymentRecoveryWindow(policy);
  await assertDeploymentRecoveryCompiler(database, policy, tenantId);
  // Same authority lock is held during creation and activation of new attempts.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`deployment-recovery:${tenantId}:${policy.originalPolicy.id}`},0))`.execute(database);
  const value = (await sql<{ value: DeploymentRecoverySource }>`SELECT publication.fn_coordinated_deployment_recovery_source(
    ${policy.originalPolicy.id}::uuid,${policy.originalPolicy.hash}) value`.execute(database)).rows[0]?.value;
  requireRecovery(value, "SOURCE_UNAVAILABLE");
  return validateDeploymentRecoverySource(policy, value);
}
