import type {
  JobEnvelope,
  JobExecutionCoordinate,
  JobExecutionFailure,
  JobExecutionIdentity,
  JobExecutionLifecycle,
  JobExecutionResult,
  JobPayload,
  JobPayloadSchema,
  JobSubject,
} from "@athyper/server-contract-jobs";

// System jobs have no human actor; audit UUID columns use this reserved identity.
export const SYSTEM_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000000";

type PlaneKey = JobExecutionCoordinate["planeKey"];

export interface JobExecutionStore {
  recordEnqueued(input: {
    readonly jobId: string;
    readonly executionKey: string;
    readonly planeKey: PlaneKey;
    readonly tenantId?: string;
    readonly principalId: string;
    readonly queue: string;
    readonly name: string;
    readonly data: JobPayload;
    readonly maxAttempts: number;
    readonly subject?: JobSubject;
    readonly payloadSchema?: JobPayloadSchema;
    readonly enqueuedAt: string;
  }): Promise<JobExecutionIdentity>;
  recordStarted(job: JobEnvelope): Promise<void>;
  recordCompleted(
    job: JobEnvelope,
    result: JobExecutionResult | void,
  ): Promise<void>;
  recordFailed(job: JobEnvelope, failure: JobExecutionFailure): Promise<void>;
}

export interface JobExecutionLifecycleOptions {
  readonly store: JobExecutionStore;
  readonly requireGovernedCoordinates?: boolean;
}

export function createJobExecutionLifecycle(
  options: JobExecutionLifecycleOptions,
): JobExecutionLifecycle {
  const requireGoverned = options.requireGovernedCoordinates ?? false;
  return {
    async enqueued(input) {
      if (!input.execution) {
        if (requireGoverned)
          throw new Error(`Job ${input.queue}/${input.name} is not governed`);
        return;
      }
      return options.store.recordEnqueued({
        jobId: input.jobId,
        executionKey: input.executionKey,
        planeKey: input.execution.planeKey,
        ...(input.execution.tenantId
          ? { tenantId: input.execution.tenantId }
          : {}),
        principalId: input.execution.principalId,
        queue: input.queue,
        name: input.name,
        data: input.data,
        maxAttempts: input.maxAttempts,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.payloadSchema ? { payloadSchema: input.payloadSchema } : {}),
        enqueuedAt: input.enqueuedAt,
      });
    },
    async started(job) {
      if (job.execution) await options.store.recordStarted(job);
      else if (requireGoverned)
        throw new Error(`Job ${job.queue}/${job.name} is not governed`);
    },
    async completed(job, result) {
      if (job.execution) await options.store.recordCompleted(job, result);
    },
    async failed(job, failure) {
      if (job.execution) await options.store.recordFailed(job, failure);
    },
  };
}
