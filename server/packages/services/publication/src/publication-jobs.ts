import type {
  JobEnvelope,
  JobExecutionCoordinate,
  JobExecutionResult,
  JobHandler,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import type {
  PublicationAuthorityRepository,
  PublicationPlane,
} from "@athyper/server-contract-publication";
import type { MetricsRegistry } from "@athyper/server-foundation";

import {
  PublicationOrchestrator,
  classifyPublicationFailure,
} from "./publication-orchestrator.js";

export const PUBLICATION_AUTHORITY_QUEUE = "publication.authority";
export const PUBLICATION_APPLY_QUEUE = "publication.apply";
export const PUBLICATION_MAINTENANCE_QUEUE = "publication.maintenance";
export const COMPILE_PUBLICATION_ARTIFACT_JOB = "publication.compile-artifact";
export const SIGN_PUBLICATION_ARTIFACT_JOB = "publication.sign-artifact";
export const DISPATCH_PUBLICATION_JOB = "publication.dispatch";
export const APPLY_PUBLICATION_RELEASE_JOB = "publication.apply-release";
export const ROLLBACK_PUBLICATION_RELEASE_JOB = "publication.rollback-release";
export const ACKNOWLEDGE_PUBLICATION_JOB = "publication.acknowledge";
export const RECOVER_STALLED_PUBLICATIONS_JOB = "publication.recover-stalled";

export interface PublicationCoordinatePayload {
  readonly deploymentId: string;
  readonly targetPlane: PublicationPlane;
}
export interface PublicationRollbackPayload {
  readonly publicationKey: string;
  readonly targetAppliedReleaseId: string;
  readonly targetPlane: PublicationPlane;
  readonly reason: string;
  readonly actorId: string;
}

export interface PublicationAuthorityWork {
  compile(
    releaseId: string,
  ): Promise<{ readonly compilationIds: readonly string[] }>;
  sign(compilationId: string): Promise<{ readonly deploymentId: string }>;
  dispatch(deploymentId: string): Promise<PublicationCoordinatePayload>;
  acknowledge(deploymentId: string): Promise<void>;
  recoverStalled(): Promise<readonly PublicationCoordinatePayload[]>;
}

export function createPublicationApplyHandler(
  orchestrators: Readonly<
    Partial<Record<PublicationPlane, PublicationOrchestrator>>
  >,
  metrics?: MetricsRegistry,
): JobHandler<
  typeof APPLY_PUBLICATION_RELEASE_JOB,
  PublicationCoordinatePayload
> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const started = Date.now();
      const payload = coordinate(job.data);
      const orchestrator = orchestrators[payload.targetPlane];
      if (!orchestrator) throw permanent("PUBLICATION_TARGET_DISABLED");
      try {
        const active = await orchestrator.deploy(payload.deploymentId);
        metrics?.counter("publication_operations_total").increment({
          operation: "apply",
          plane: payload.targetPlane,
          outcome: "success",
        });
        metrics
          ?.histogram("publication_operation_duration_ms")
          .record(Date.now() - started, {
            operation: "apply",
            plane: payload.targetPlane,
          });
        return {
          status: "completed",
          output: {
            deploymentId: payload.deploymentId,
            localAppliedReleaseId: active.id,
          },
        };
      } catch (error) {
        const failure = classifyPublicationFailure(error, "load");
        metrics?.counter("publication_operations_total").increment({
          operation: "apply",
          plane: payload.targetPlane,
          outcome: failure.category,
        });
        const wrapped = new Error(failure.message) as Error & {
          code: string;
          retryable: boolean;
        };
        wrapped.code = failure.code;
        wrapped.retryable = failure.retryable;
        throw wrapped;
      }
    },
  };
}

export function createPublicationRollbackHandler(
  repositories: Readonly<
    Partial<
      Record<
        PublicationPlane,
        import("@athyper/server-contract-publication").LocalProjectionRepository
      >
    >
  >,
  metrics?: MetricsRegistry,
): JobHandler<
  typeof ROLLBACK_PUBLICATION_RELEASE_JOB,
  PublicationRollbackPayload
> {
  return {
    async handle(job) {
      const payload = rollbackPayload(job.data);
      const repository = repositories[payload.targetPlane];
      if (!repository) throw permanent("PUBLICATION_TARGET_DISABLED");
      const active = await repository.rollback({
        publicationKey: payload.publicationKey,
        targetAppliedReleaseId: payload.targetAppliedReleaseId,
        evidence: {
          actorId: payload.actorId,
          reason: payload.reason,
          jobId: job.id,
        },
      });
      metrics?.counter("publication_operations_total").increment({
        operation: "rollback",
        plane: payload.targetPlane,
        outcome: "success",
      });
      return {
        status: "completed",
        output: {
          activeAppliedReleaseId: active.id,
          publicationKey: active.publicationKey,
          targetPlane: payload.targetPlane,
        },
      };
    },
  };
}

export function createPublicationAuthorityHandlers(
  work: PublicationAuthorityWork,
  jobs: JobPublisher,
  resolveApplyExecution?: (
    execution: JobExecutionCoordinate,
    plane: PublicationPlane,
  ) => Promise<JobExecutionCoordinate>,
  options: { readonly dispatchEnabled?: boolean } = {},
): Readonly<Record<string, JobHandler>> {
  return {
    [COMPILE_PUBLICATION_ARTIFACT_JOB]: delegate(async (job) => {
      const releaseId = requiredId(job.data, "releaseId");
      const result = await work.compile(releaseId);
      for (const compilationId of result.compilationIds) {
        await jobs.enqueue(
          PUBLICATION_AUTHORITY_QUEUE,
          SIGN_PUBLICATION_ARTIFACT_JOB,
          { compilationId },
          { ...deterministic(compilationId, "sign"), execution: job.execution },
        );
      }
      return { releaseId, compilationCount: result.compilationIds.length };
    }),
    [SIGN_PUBLICATION_ARTIFACT_JOB]: delegate(async (job) => {
      const compilationId = requiredId(job.data, "compilationId");
      const { deploymentId } = await work.sign(compilationId);
      if (options.dispatchEnabled !== false)
        await jobs.enqueue(
          PUBLICATION_AUTHORITY_QUEUE,
          DISPATCH_PUBLICATION_JOB,
          { deploymentId },
          {
            ...deterministic(deploymentId, "dispatch"),
            execution: job.execution,
          },
        );
      return { deploymentId };
    }),
    [DISPATCH_PUBLICATION_JOB]: delegate(async (job) => {
      const deploymentId = requiredId(job.data, "deploymentId");
      if (options.dispatchEnabled === false)
        return { deploymentId, dispatchDeferred: true };
      const payload = await work.dispatch(deploymentId);
      const execution =
        job.execution && resolveApplyExecution
          ? await resolveApplyExecution(job.execution, payload.targetPlane)
          : job.execution;
      await enqueueApply(jobs, payload, execution);
      return payload;
    }),
    [ACKNOWLEDGE_PUBLICATION_JOB]: delegate(async (job) => {
      const deploymentId = requiredId(job.data, "deploymentId");
      await work.acknowledge(deploymentId);
      return { deploymentId };
    }),
    [RECOVER_STALLED_PUBLICATIONS_JOB]: delegate(async () => {
      const recovered = await work.recoverStalled();
      for (const payload of recovered) await enqueueApply(jobs, payload);
      return { recovered: recovered.length };
    }),
  };
}

export function createPublicationRecoveryHandler(
  authority: PublicationAuthorityRepository,
  jobs: JobPublisher,
  metrics?: MetricsRegistry,
): JobHandler<typeof RECOVER_STALLED_PUBLICATIONS_JOB, Record<string, never>> {
  return {
    async handle(): Promise<JobExecutionResult> {
      const deployments = await authority.listRecoverableDeployments(200);
      for (const deployment of deployments) {
        await enqueueApply(jobs, {
          deploymentId: deployment.deploymentId,
          targetPlane: deployment.targetPlane,
        });
      }
      metrics
        ?.counter("publication_operations_total")
        .incrementBy(deployments.length, {
          operation: "recover",
          plane: "studio",
          outcome: "reenqueued",
        });
      return { status: "completed", output: { recovered: deployments.length } };
    },
  };
}

export async function enqueueApply(
  jobs: JobPublisher,
  payload: PublicationCoordinatePayload,
  execution?: JobExecutionCoordinate,
): Promise<string> {
  coordinate(payload);
  return jobs.enqueue(
    PUBLICATION_APPLY_QUEUE,
    APPLY_PUBLICATION_RELEASE_JOB,
    payload,
    {
      ...deterministic(payload.deploymentId, `apply:${payload.targetPlane}`),
      maxAttempts: 5,
      backoff: { kind: "exponential", delayMs: 2_000, jitter: 0.25 },
      execution: {
        ...(execution ?? {
          scope: "plane" as const,
          principalId: "publication-worker",
        }),
        planeKey: payload.targetPlane,
      },
      payloadSchema: { name: APPLY_PUBLICATION_RELEASE_JOB, version: 1 },
    },
  );
}

function delegate<T extends object>(
  work: (job: JobEnvelope) => Promise<T>,
): JobHandler {
  return {
    async handle(job) {
      return {
        status: "completed",
        output: { ...(await work(job)) } as Readonly<Record<string, unknown>>,
      };
    },
  };
}

function deterministic(deploymentId: string, step: string) {
  return {
    enqueueKey: `publication:${deploymentId}:${step}:1`,
    maxAttempts: 5,
    removeOnComplete: 500,
    removeOnFail: false,
  } as const;
}

function requiredId(value: object, key: string): string {
  const candidate = Reflect.get(value, key);
  if (typeof candidate !== "string" || !candidate.trim())
    throw permanent("PUBLICATION_JOB_PAYLOAD_INVALID");
  return candidate;
}

function coordinate(value: object): PublicationCoordinatePayload {
  const deploymentId = requiredId(value, "deploymentId");
  const targetPlane = Reflect.get(value, "targetPlane");
  if (
    targetPlane !== "studio" &&
    targetPlane !== "neon" &&
    targetPlane !== "mesh"
  )
    throw permanent("PUBLICATION_JOB_PLANE_INVALID");
  return { deploymentId, targetPlane };
}
function rollbackPayload(value: object): PublicationRollbackPayload {
  const targetPlane = Reflect.get(value, "targetPlane"),
    publicationKey = Reflect.get(value, "publicationKey"),
    targetAppliedReleaseId = Reflect.get(value, "targetAppliedReleaseId"),
    reason = Reflect.get(value, "reason"),
    actorId = Reflect.get(value, "actorId");
  if (
    targetPlane !== "studio" &&
    targetPlane !== "neon" &&
    targetPlane !== "mesh"
  )
    throw permanent("PUBLICATION_JOB_PLANE_INVALID");
  for (const [key, item] of Object.entries({
    publicationKey,
    targetAppliedReleaseId,
    reason,
    actorId,
  }))
    if (typeof item !== "string" || !item.trim())
      throw permanent(`PUBLICATION_JOB_PAYLOAD_INVALID_${key.toUpperCase()}`);
  return {
    targetPlane,
    publicationKey: publicationKey as string,
    targetAppliedReleaseId: targetAppliedReleaseId as string,
    reason: reason as string,
    actorId: actorId as string,
  };
}

function permanent(code: string): Error {
  return Object.assign(new Error(code), { code, retryable: false });
}
