import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import { compileSystemReferenceTarget } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { CompilationRecoveryPolicy } from "@athyper/server-contract-publication";
import { COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_AUTHORITY_QUEUE } from "@athyper/server-service-publication";
import { authorizeCompilationRecovery } from "./compilation-recovery-authority.js";
import { assertSuccessorTargetHeads } from "./successor-targets.js";
import { qualifyReferencePublicationTarget } from "./target-qualification.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import type { MachinePublicationPolicyPin } from "./machine-policy.js";
import type { DevelopmentPublicationWorkloadDependencies } from "../../../development/publication-workload.js";

export async function executeCompilationRecovery(config: PublicationWorkloadConfiguration, policy: CompilationRecoveryPolicy,
  pin: MachinePublicationPolicyPin, dependencies: DevelopmentPublicationWorkloadDependencies) {
  if (!dependencies.jobs) throw Error("COMPILATION_RECOVERY_QUEUE_UNAVAILABLE");
  const jobs = dependencies.jobs;
  const requestId = randomUUID();
  return runWithRequestContext({ requestId, correlationId: requestId, planeKey: "studio", tenantId: config.tenantId, principalId: config.publisher.principalId }, async () => {
  await dependencies.database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true),set_config('app.current_tenant_id',${config.tenantId},true),
      set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
    const lock = (await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`reference-publication:${policy.entityId}`},0)) locked`.execute(tx)).rows[0];
    if (!lock?.locked) throw Error("COMPILATION_RECOVERY_ALREADY_RUNNING");
    const authorized = await authorizeCompilationRecovery(dependencies.database, config, policy, pin, true);
    await assertSuccessorTargetHeads(policy.targets, dependencies.targets.databases);
    for (const target of policy.targets) await qualifyReferencePublicationTarget(compileSystemReferenceTarget(authorized.graph, target.plane), dependencies.targets);
    // Recheck after potentially slow conversion/scanning probes.
    await authorizeCompilationRecovery(dependencies.database, config, policy, pin, true);
    await assertSuccessorTargetHeads(policy.targets, dependencies.targets.databases);
    const recorded = await dependencies.audit.record({ eventCode: "metadata.reference.publication.review_authorized", action: "reference_metadata_publication",
      outcome: "success", severity: "critical", tenantId: config.tenantId, actor: { kind: "service", principalId: config.publisher.principalId },
      entityType: "metadata.entity_change_set", entityId: policy.changeSetId, requestId, correlationId: requestId,
      metadata: { schema: "athyper.compilation-recovery-execution/1", releaseId: policy.failedReleaseId, failedJobId: policy.failedJobId,
        recovery: authorized.evidence, sourceUnchanged: true, stage: "retry_authorized" },
    }, tx);
    if (!recorded.id) throw Error("COMPILATION_RECOVERY_AUDIT_REQUIRED");
  });
  // Commit authorization evidence before queueing. A queue failure is safely
  // retryable using the same key; audit failure cannot launch unaudited work.
  const jobId = await jobs.enqueue(PUBLICATION_AUTHORITY_QUEUE, COMPILE_PUBLICATION_ARTIFACT_JOB,
    { releaseId: policy.failedReleaseId }, {
      enqueueKey: `publication:compilation-recovery:${pin.id}:${pin.hash}`, maxAttempts: 3,
      payloadSchema: { name: COMPILE_PUBLICATION_ARTIFACT_JOB, version: 1 },
      execution: { planeKey: "studio", scope: "tenant", tenantId: config.tenantId, principalId: config.publisher.principalId, correlationId: requestId },
    });
  return { status: "recovery_queued" as const, releaseId: policy.failedReleaseId, jobId, policy: pin };
  });
}
