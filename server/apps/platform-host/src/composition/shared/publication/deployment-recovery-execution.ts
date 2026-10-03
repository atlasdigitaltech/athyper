import {publicationCompilerIdentity} from "./compiler-build.js";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import { createKyselyPermissionResolver, createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { KyselyPublicationAuthorityRepository } from "@athyper/server-service-publication";
import { enqueueApply } from "@athyper/server-service-publication";
import type { DevelopmentPublicationWorkloadDependencies } from "../../../development/publication-workload.js";
import { authorizeDeploymentRecovery, assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
import { deploymentRecoveryCommand, requireRecovery, type DeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";
import { MACHINE_PUBLICATION_PERMISSION, type MachinePublicationPolicyPin } from "./machine-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

/** Authenticated workload transport only. New attempts reuse the signed artifact;
 * original policy, signatures, source releases and review receipts are immutable. */
export async function executeDeploymentRecovery(config: PublicationWorkloadConfiguration, policy: DeploymentRecoveryPolicy,
  pin: MachinePublicationPolicyPin, dependencies: DevelopmentPublicationWorkloadDependencies) {
  const context = tryGetRequestContext(), requestId = context?.requestId ?? randomUUID();
  requireRecovery(context?.tenantId === config.tenantId && context.principalId === config.publisher.principalId && context.planeKey === "studio",
    "AUTHENTICATED_WORKLOAD_REQUIRED");
  requireRecovery(dependencies.jobs, "QUEUE_UNAVAILABLE");
  // Both mounted actors are checked under their own tenant-scoped identity.
  for (const role of ["author", "publisher"] as const) await dependencies.database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config[role].principalId},true)`.execute(tx);
    await assertPublicationWorkloadActor(tx, config, role);
  });
  const targets = await dependencies.database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true),
      set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
    const original = await authorizeDeploymentRecovery(tx, config, policy, pin);
    const identity = { planeKey: "studio" as const, realmKey: config.realmKey, tenantId: config.tenantId,
      principalId: config.publisher.principalId, authEpoch: config.publisher.authEpoch };
    const permissions = await createKyselyPermissionResolver({ run: (_identity, work) => work(tx) }).resolve(identity);
    const authorizer = createPermissionAuthorizer({ policyGate: { async evaluate(input) {
      const allowed = input.permissionCode === MACHINE_PUBLICATION_PERMISSION && input.context.principalId === config.publisher.principalId
        && input.context.tenantId === config.tenantId && input.context.planeKey === "studio"
        && original.plan.members.some(m => m.entityId === input.resource?.entityId && m.changeSetId === input.resource?.changeSetId);
      return { allowed, sodSatisfied: allowed, reason: "deployment_recovery_scope" };
    } } });
    for (const member of original.plan.members) {
      const decision = await authorizer.authorize({ context: { ...identity, permissions, profileHash: permissions.profileHash, requestId },
        permissionCode: MACHINE_PUBLICATION_PERMISSION,
        resource: { tenantId: config.tenantId, recordId: member.changeSetId, changeSetId: member.changeSetId, entityId: member.entityId } });
      requireRecovery(decision.allowed, "IAM_DENIED");
    }
    // Refuse to queue a publisher that does not exist or has been revoked on a target.
    for (const plane of new Set(policy.deliveries.map(d => d.plane))) {
      const database = dependencies.targets.databases[plane];
      requireRecovery(database, "TARGET_UNAVAILABLE");
      if (plane === "studio") await assertPublicationWorkloadActor(tx, config, "publisher");
      else await database.transaction().execute(async local => {
        await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(local);
        await assertPublicationWorkloadActor(local, config, "publisher");
      });
    }
    const repository = new KyselyPublicationAuthorityRepository(tx), result = [];
    for (const delivery of policy.deliveries) {
      // Recheck original reviews, source graphs and policy revocation for every source.
      const source = (await sql<{ value: unknown }>`SELECT publication.fn_human_execution_context(${delivery.releaseId}::uuid) value`.execute(tx)).rows[0]?.value;
      requireRecovery(source, "SOURCE_REVOKED");
      const commandId = deploymentRecoveryCommand(pin.hash, delivery.deploymentId);
      const conflicts = (await sql`SELECT id FROM publication.deployment WHERE artifact_id=${delivery.artifactId}::uuid
        AND id<>${delivery.deploymentId}::uuid AND command_id<>${commandId}::uuid`.execute(tx)).rows;
      requireRecovery(!conflicts.length, "ATTEMPT_CONFLICT");
      let next = await repository.createDeployment({ commandId, artifactId: delivery.artifactId, targetPlane: delivery.plane,
        targetEnvironment: policy.environment, targetInstance: policy.instance, attempt: delivery.attempt + 1,
        correlationId: requestId, actorId: config.publisher.principalId });
      const evidence = { recoveryPolicyId: pin.id, recoveryPolicyHash: pin.hash, previousDeploymentId: delivery.deploymentId,
        artifactHash: delivery.artifactHash, compilerHash: policy.compiler.buildHash };
      const previous = await repository.getDeployment(delivery.deploymentId);
      requireRecovery(previous && previous.artifactHash === delivery.artifactHash, "DELIVERY_CHANGED");
      if (previous.deploymentStatus !== "failed") await repository.transitionDeployment({ deploymentId: delivery.deploymentId,
        status: "failed", evidence: { ...evidence, code: "PUBLICATION_TARGET_REPLACED", category: "permanent", step: "dispatch", retryable: false } });
      if (next.deploymentStatus === "pending") await repository.transitionDeployment({ deploymentId: next.deploymentId, status: "dispatched", evidence });
      if (next.deploymentStatus === "failed") {
        // The SQL lifecycle permits only an exact reviewed, pre-receipt 42501
        // retry, retains failed events and rechecks the immutable command pin.
        await repository.transitionDeployment({ deploymentId: next.deploymentId, status: "dispatched", evidence: {
          ...evidence, schema: "athyper.coordinated-deployment-retry/1",
          reason: "Resume the unchanged approved recovery command after worker permission repair.",
          executionCompilerHash: publicationCompilerIdentity().buildHash,
        } });
        const resumed = await repository.getDeployment(next.deploymentId);
        requireRecovery(resumed, "ATTEMPT_UNAVAILABLE"); next = resumed;
      }
      requireRecovery(["pending", "dispatched", "received", "staged", "verified", "activated"].includes(next.deploymentStatus), "ATTEMPT_FAILED");
      result.push({ deploymentId: next.deploymentId, targetPlane: delivery.plane });
    }
    const receipt = await dependencies.audit.record({ eventCode: "metadata.entity.product.publication", action: "human_reviewed_publication",
      outcome: "success", severity: "critical", tenantId: config.tenantId, actor: { kind: "service", principalId: config.publisher.principalId },
      requestId, correlationId: requestId, entityType: "control.policy_definition", entityId: pin.id,
      metadata: { schema: policy.schema, stage: "deployment_recovery_dispatched", recoveryPolicy: pin, originalPolicy: policy.originalPolicy,
        deliveries: policy.deliveries, attempts: result, sourceAndSignaturesUnchanged: true } }, tx);
    requireRecovery(receipt.id && receipt.actor.principalId === config.publisher.principalId, "AUDIT_REQUIRED");
    return result;
  });
  // Commit the audited attempts before enqueue. Stable shared enqueue keys make
  // a queue outage recoverable without another deployment or artifact signature.
  const jobs = [];
  for (const target of targets) jobs.push(await enqueueApply(dependencies.jobs, target, { planeKey: target.targetPlane,
    tenantId: config.tenantId, principalId: config.publisher.principalId, scope: "tenant", correlationId: requestId }, publicationCompilerIdentity().buildHash));
  return { status: "deployment_recovery_queued", policy: pin, targets, jobs };
}
