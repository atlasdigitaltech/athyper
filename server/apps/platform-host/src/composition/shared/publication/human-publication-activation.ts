import { sql, type Kysely, type Transaction } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { PublicationArtifactLoader, ActiveReleaseProjection } from "@athyper/server-contract-publication";
import { activateProductGroup, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository,
  type PublicationOrchestrator } from "@athyper/server-service-publication";
import type { ProductActivationGroup } from "@athyper/server-service-publication";
import { compileGraph, compileSystemEntityTarget, sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { assertPublicationCompilerIdentity, publicationCompilerIdentity } from "./compiler-build.js";
import { findDeploymentRecovery, assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
import { deploymentRecoveryCommand } from "./deployment-recovery-policy.js";
import { qualifyCoordinatedProductRelationships } from "./relationship-qualification.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
type Guard = NonNullable<ConstructorParameters<typeof PublicationOrchestrator>[3]>;
function denied(code: string): never { throw Object.assign(Error(code), { code, retryable: false }); }
function pending(): never { throw Object.assign(Error("PUBLICATION_GROUP_NOT_READY"), { code: "PUBLICATION_GROUP_NOT_READY", retryable: true }); }

/** Called inside the existing stamped authority/target transactions. Legacy
 * releases return null; coordinated releases can never fall through to single
 * activation. Every member uses the existing loader, guards, repository and ack. */
export async function deployHumanPublicationGroup(options: {
  deploymentId: string; authority: Database; local: Database; loader: PublicationArtifactLoader;
  workload?: PublicationWorkloadConfiguration;
  activationGuard?: (...args: [...Parameters<Guard>, Database]) => Promise<void>;
}): Promise<ActiveReleaseProjection | null> {
  const source = (await sql<{ release_id: string; policy_id: string; command_id: string }>`SELECT r.id AS release_id,
    r.metadata->>'executionPolicyId' policy_id,d.command_id FROM publication.deployment d
    JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id
    WHERE d.id=${options.deploymentId}::uuid AND r.metadata ? 'humanExecutionPolicy'`.execute(options.authority)).rows[0];
  if (!source) return null;
  const config = options.workload;
  if (!config || config.environment !== "local" || config.instance !== "dev" || !options.activationGuard)
    denied("HUMAN_PUBLICATION_ACTIVATION_HOST_REQUIRED");
  const authority = new KyselyPublicationAuthorityRepository(options.authority);
  const requested = await authority.getDeployment(options.deploymentId);
  if (!requested) denied("DEPLOYMENT_NOT_AVAILABLE");
  if (requested.targetEnvironment !== "local" || requested.targetInstance !== "dev") denied("HUMAN_PUBLICATION_TARGET_DENIED");
  await assertPublicationWorkloadActor(options.local, config, "publisher");
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`deployment-recovery:${config.tenantId}:${source.policy_id}`},0))`.execute(options.authority);
  async function execution() {
    const principals = (await sql`SELECT id FROM master.principal WHERE tenant_id=${config!.tenantId}::uuid
      AND id=${config!.publisher.principalId}::uuid AND id=master.current_principal_id_soft()
      AND code=${config!.publisher.code} AND principal_type='service_account' AND provisioning_source='internal'
      AND status='active' AND auth_epoch=${config!.publisher.authEpoch}`.execute(options.authority)).rows;
    if (principals.length !== 1) denied("HUMAN_PUBLICATION_WORKLOAD_REVOKED");
    const value = (await sql<{ value: { policy: unknown; coordinationHash: string;
      sources: { changeSetId: string; graph: MetaEntityGraph }[] } }>`SELECT publication.fn_human_execution_context(${source!.release_id}::uuid) value`.execute(options.authority)).rows[0]?.value;
    if (!value) denied("HUMAN_PUBLICATION_EXECUTION_POLICY_REQUIRED");
    const policy = parseHumanReviewedExecutionPolicy(value.policy);
    if (policy.compiler.buildHash !== publicationCompilerIdentity().buildHash) {
      // Explicit independently reviewed authority for this implementation and
      // these exact already-signed bytes; never rewrite the original policy pin.
      const recovery = await findDeploymentRecovery(options.authority, config!, source!.policy_id);
      if (sha256(recovery.original) !== sha256(policy)) denied("HUMAN_PUBLICATION_RECOVERY_SOURCE_CHANGED");
      const pin = recovery.policy.deliveries.find(d => d.releaseId === requested!.sourceReleaseId && d.plane === requested!.targetPlane);
      if (!pin || pin.artifactHash !== requested!.artifactHash
        || deploymentRecoveryCommand(recovery.pin.hash, pin.deploymentId) !== source!.command_id)
        denied("HUMAN_PUBLICATION_RECOVERY_ATTEMPT_CHANGED");
    } else assertPublicationCompilerIdentity(policy.compiler);
    if (policy.authorityTenantId !== config!.tenantId || policy.publisherPrincipalId !== config!.publisher.principalId
      || sha256(policy.plan) !== value.coordinationHash || !Array.isArray(value.sources)
      || value.sources.length !== policy.plan.members.length || new Set(value.sources.map(s => s.changeSetId)).size !== value.sources.length)
      denied("HUMAN_PUBLICATION_EXECUTION_CONTEXT_CHANGED");
    return { ...value, policy };
  }
  const context = await execution();
  const targetMembers = context.policy.plan.members.filter(m => m.targets.some(t => t.plane === requested.targetPlane));
  const members: ProductActivationGroup["members"][number][] = [], graphs: MetaEntityGraph[] = [];
  for (const member of targetMembers) {
    const graph = context.sources.find(s => s.changeSetId === member.changeSetId)?.graph;
    if (!graph || compileGraph(graph).contractHash !== member.contractHash || compileGraph(graph).descriptorHash !== member.descriptorHash)
      denied("HUMAN_PUBLICATION_SOURCE_PIN_CHANGED");
    const target = compileSystemEntityTarget(graph, requested.targetPlane), pin = member.targets.find(t => t.plane === requested.targetPlane)!;
    if (target.artifact.contractHash !== pin.contractHash || target.artifact.descriptorHash !== pin.descriptorHash)
      denied("HUMAN_PUBLICATION_TARGET_PIN_CHANGED");
    graphs.push(target.graph);
    const deliveries = (await sql<{ id: string }>`SELECT d.id FROM publication.deployment d
      JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release pr ON pr.id=a.publication_release_id
      JOIN publication.entity_release_link link ON link.publication_release_id=pr.id
      JOIN metadata.entity_release er ON er.id=link.entity_release_id
      WHERE er.change_set_id=${member.changeSetId}::uuid AND er.entity_id=${member.entityId}::uuid AND er.tenant_id IS NULL
        AND pr.tenant_id=${config.tenantId}::uuid AND pr.metadata->>'coordinationHash'=${context.coordinationHash}
        AND pr.metadata->'humanExecutionPolicy'=${JSON.stringify(context.policy)}::jsonb
        AND a.status='signed' AND d.target_plane=${requested.targetPlane} AND d.target_environment=${requested.targetEnvironment}
        AND d.target_instance=${requested.targetInstance} AND d.status IN ('dispatched','received','staged','verified','activated')
      ORDER BY d.attempt_no DESC,d.created_at DESC LIMIT 1`.execute(options.authority)).rows;
    if (!deliveries.length) pending();
    const deployment = await authority.getDeployment(deliveries[0]!.id);
    if (!deployment) pending();
    const previous = context.policy.predecessors.find(p => p.changeSetId === member.changeSetId)?.targets.find(t => t.plane === requested.targetPlane);
    members.push({ entityCode: graph.entity.entityCode, deployment, expectedActiveHash: previous?.artifactHash ?? null });
  }
  if (!members.some(m => m.deployment.deploymentId === requested.deploymentId)) denied("HUMAN_PUBLICATION_DEPLOYMENT_SUPERSEDED");
  const repository = new KyselyLocalProjectionRepository(options.local);
  await activateProductGroup({ coordinationHash: context.coordinationHash, plane: requested.targetPlane,
    environment: requested.targetEnvironment, instance: requested.targetInstance, members }, {
    loader: options.loader,
    authorize: async () => {
      const current = await execution();
      if (sha256(current.policy) !== sha256(context.policy)) denied("HUMAN_PUBLICATION_POLICY_CHANGED");
      // Check each sibling release as well: withdrawal of a single member must
      // stop the group even when the initiating release remains approved.
      for (const member of members) {
        const result = (await sql<{ value: unknown }>`SELECT publication.fn_human_execution_context(${member.deployment.sourceReleaseId}::uuid) value`.execute(options.authority)).rows[0]?.value;
        if (!result) denied("HUMAN_PUBLICATION_MEMBER_AUTHORITY_REVOKED");
        if (context.policy.compiler.buildHash !== publicationCompilerIdentity().buildHash) {
          const recovery = await findDeploymentRecovery(options.authority, config, source.policy_id);
          const pin = recovery.policy.deliveries.find(d => d.releaseId === member.deployment.sourceReleaseId && d.plane === requested.targetPlane);
          const command = (await sql<{ command_id: string }>`SELECT command_id FROM publication.deployment
            WHERE id=${member.deployment.deploymentId}::uuid`.execute(options.authority)).rows[0]?.command_id;
          if (!pin || pin.artifactHash !== member.deployment.artifactHash
            || command !== deploymentRecoveryCommand(recovery.pin.hash, pin.deploymentId)) denied("HUMAN_PUBLICATION_RECOVERY_ATTEMPT_CHANGED");
        }
      }
    },
    transaction: work => work({ repository, lock: async keys => {
      for (const key of keys) await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(options.local);
    } }),
    qualify: async (_group, artifacts) => {
      for (let i=0; i<artifacts.length; i++) {
        const member = targetMembers[i]!, evidence = artifacts[i]!.document.manifest.evidence;
        const pin = member.targets.find(t => t.plane === requested.targetPlane)!;
        if (evidence?.sourceContractHash !== member.contractHash || evidence?.sourceDescriptorHash !== pin.descriptorHash
          || evidence?.sourceEntityId !== member.entityId) denied("HUMAN_PUBLICATION_SIGNED_SOURCE_CHANGED");
        await options.activationGuard!(members[i]!.deployment, artifacts[i]!, options.authority);
      }
      await qualifyCoordinatedProductRelationships(graphs, options.local as Transaction<Record<string, never>>);
    },
    // Native repository activation emits the ordinary transactional activation
    // events. No separate in-memory cache override replaces that mechanism.
    invalidate: async () => {},
  });
  for (const member of members) {
    const active = await repository.findActive(member.deployment.publicationKey);
    if (!active || active.artifactHash !== member.deployment.artifactHash) denied("LOCAL_ACTIVATION_HEAD_MISMATCH");
    const progress = ["dispatched", "received", "staged", "verified", "activated"] as const;
    const index = progress.indexOf(member.deployment.deploymentStatus as typeof progress[number]);
    for (const status of progress.slice(index + 1)) await authority.transitionDeployment({ deploymentId: member.deployment.deploymentId, status,
      evidence: { coordinationHash: context.coordinationHash, localAppliedReleaseId: active.id } });
    await authority.acknowledge({ deploymentId: member.deployment.deploymentId, targetInstance: member.deployment.targetInstance,
      activeReleaseHash: active.artifactHash, localAppliedReleaseId: active.id, evidence: { coordinationHash: context.coordinationHash } });
  }
  return (await repository.findActive(requested.publicationKey))!;
}
