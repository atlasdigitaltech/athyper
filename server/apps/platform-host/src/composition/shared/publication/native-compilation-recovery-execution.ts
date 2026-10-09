import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import {
  createKyselyPermissionResolver,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import {
  COMPILE_PUBLICATION_ARTIFACT_JOB,
  PUBLICATION_AUTHORITY_QUEUE,
} from "@athyper/server-service-publication";
import { authorizeNativeCompilationRecovery } from "./native-compilation-recovery-authority.js";
import { assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
import {
  requireNativeRecovery as check,
  type NativeCompilationRecoveryPolicy,
} from "./native-compilation-recovery-policy.js";
import {
  MACHINE_PUBLICATION_PERMISSION,
  type MachinePublicationPolicyPin,
} from "./machine-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import type { DevelopmentPublicationWorkloadDependencies } from "../../../development/publication-workload.js";

/** Queue existing releases only. Compilation rechecks native resource semantics,
 * source hashes, group coverage and current recovery authority for every target. */
export async function executeNativeCompilationRecovery(
  config: PublicationWorkloadConfiguration,
  policy: NativeCompilationRecoveryPolicy,
  pin: MachinePublicationPolicyPin,
  dependencies: DevelopmentPublicationWorkloadDependencies,
) {
  const context = tryGetRequestContext(),
    requestId = context?.requestId ?? randomUUID();
  check(
    context?.planeKey === "studio" &&
      context.tenantId === config.tenantId &&
      context.principalId === config.publisher.principalId,
    "AUTHENTICATED_WORKLOAD_REQUIRED",
  );
  const jobs = dependencies.jobs;
  check(jobs, "QUEUE_UNAVAILABLE");
  await dependencies.database.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true),set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(
      tx,
    );
    await assertPublicationWorkloadActor(tx, config, "author");
    // After partial success, replay may enqueue the remaining member: the worker
    // uses immutable artifact deduplication; enrollment itself required zero artifacts.
    const original = await authorizeNativeCompilationRecovery(
      tx,
      config,
      policy,
      pin,
    );
    const identity = {
      planeKey: "studio" as const,
      realmKey: config.realmKey,
      tenantId: config.tenantId,
      principalId: config.publisher.principalId,
      authEpoch: config.publisher.authEpoch,
    };
    const permissions = await createKyselyPermissionResolver({
      run: (_identity, work) => work(tx),
    }).resolve(identity);
    const authorizer = createPermissionAuthorizer({
      policyGate: {
        async evaluate(input) {
          const allowed =
            input.permissionCode === MACHINE_PUBLICATION_PERMISSION &&
            input.context.principalId === config.publisher.principalId &&
            input.context.tenantId === config.tenantId &&
            input.context.planeKey === "studio" &&
            original.plan.members.some(
              (m) =>
                m.entityId === input.resource?.entityId &&
                m.changeSetId === input.resource?.changeSetId,
            );
          return {
            allowed,
            sodSatisfied: allowed,
            reason: "native_compilation_recovery_scope",
          };
        },
      },
    });
    for (const member of original.plan.members) {
      const decision = await authorizer.authorize({
        context: {
          ...identity,
          permissions,
          profileHash: permissions.profileHash,
          requestId,
        },
        permissionCode: MACHINE_PUBLICATION_PERMISSION,
        resource: {
          tenantId: config.tenantId,
          recordId: member.changeSetId,
          changeSetId: member.changeSetId,
          entityId: member.entityId,
        },
      });
      check(decision.allowed, "IAM_DENIED");
    }
    const receipt = await dependencies.audit.record(
      {
        eventCode: "metadata.reference.publication.review_authorized",
        action: "reference_metadata_publication",
        outcome: "success",
        severity: "critical",
        tenantId: config.tenantId,
        actor: { kind: "service", principalId: config.publisher.principalId },
        entityType: "control.policy_definition",
        entityId: pin.id,
        requestId,
        correlationId: requestId,
        metadata: {
          schema: "athyper.native-compilation-recovery-execution/1",
          policy: pin,
          releases: policy.releases,
          compilerHash: policy.compiler.buildHash,
          sourceUnchanged: true,
        },
      },
      tx,
    );
    check(receipt.id, "AUDIT_REQUIRED");
  });
  const queued = [];
  for (const release of policy.releases) {
    const jobId = await jobs.enqueue(
      PUBLICATION_AUTHORITY_QUEUE,
      COMPILE_PUBLICATION_ARTIFACT_JOB,
      { releaseId: release.releaseId },
      {
        enqueueKey: `publication:native-compilation-recovery:${pin.id}:${pin.hash}:${release.releaseId}`,
        maxAttempts: 3,
        payloadSchema: { name: COMPILE_PUBLICATION_ARTIFACT_JOB, version: 1 },
        execution: {
          planeKey: "studio",
          scope: "tenant",
          tenantId: config.tenantId,
          principalId: config.publisher.principalId,
          correlationId: requestId,
        },
      },
    );
    queued.push({ releaseId: release.releaseId, jobId });
  }
  return { status: "recovery_queued" as const, policy: pin, releases: queued };
}
