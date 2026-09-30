import { randomUUID } from "node:crypto";
import type { JobAdministration, JobAdministrationCommand, JobAdministrationRequest, JobAdministrationResult, JobDeadLetterSummary, JobExecutionCoordinate, JobPublisher, JobReplaySource, JobTransportControl } from "@athyper/server-contract-jobs";

export interface JobAdministrationStore {
  load(request: JobAdministrationRequest): Promise<JobReplaySource | undefined>;
  recordCommand(input: {
    readonly request: JobAdministrationRequest;
    readonly command: JobAdministrationCommand;
    readonly applied: boolean;
    readonly replacementJobId?: string;
    readonly expectedAttempt?: number;
    readonly detail?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
  listDeadLetters(input: {
    readonly execution: JobExecutionCoordinate;
    readonly limit: number;
  }): Promise<readonly JobDeadLetterSummary[]>;
}

export function createJobAdministrationService(options: {
  readonly store: JobAdministrationStore;
  readonly transport: JobTransportControl;
  readonly publisher: JobPublisher;
}): JobAdministration {
  const executeExisting = async (
    command: "cancel" | "retry",
    request: JobAdministrationRequest,
  ): Promise<JobAdministrationResult> => {
    validateRequest(request);
    const source = await options.store.load(request);
    if (!source) return { command, applied: false, reason: "Job execution was not found" };
    const applied = command === "cancel"
      ? await options.transport.cancel(source.queue, source.jobId)
      : await options.transport.retry(source.queue, source.jobId);
    await options.store.recordCommand({
      request,
      command,
      applied,
      ...(source.attempt !== undefined ? { expectedAttempt: source.attempt } : {}),
      detail: { jobId: source.jobId, queue: source.queue },
    });
    return { command, applied, ...(applied ? { jobId: source.jobId } : { reason: command === "cancel" ? "Job is not cancellable or the owning worker did not acknowledge cancellation" : "BullMQ job was not available" }) };
  };

  return {
    cancel: (request) => executeExisting("cancel", request),
    retry: (request) => executeExisting("retry", request),
    async replay(request) {
      validateRequest(request);
      const source = await options.store.load(request);
      if (!source) return { command: "replay", applied: false, reason: "Job execution was not found" };
      const publishedId = await options.publisher.enqueue(source.queue, source.name, source.data, {
        enqueueKey: `replay:${request.executionId}:${randomUUID()}`,
        maxAttempts: source.maxAttempts,
        execution: request.execution,
        ...(source.subject ? { subject: source.subject } : {}),
        ...(source.payloadSchema ? { payloadSchema: source.payloadSchema } : {}),
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
      await options.store.recordCommand({
        request,
        command: "replay",
        applied: true,
        replacementJobId: publishedId,
        detail: { sourceJobId: source.jobId, queue: source.queue },
      });
      return { command: "replay", applied: true, jobId: publishedId };
    },
    listDeadLetters(input) {
      return options.store.listDeadLetters({ execution: input.execution, limit: bounded(input.limit ?? 50, 1, 200) });
    },
  };
}

function validateRequest(request: JobAdministrationRequest): void {
  if (!request.executionId.trim()) throw new Error("Job administration requires executionId");
  if (!request.reason.trim()) throw new Error("Job administration requires a reason");
  if (request.execution.scope === "tenant" && !request.execution.tenantId) {
    throw new Error("Tenant-scoped job administration requires tenantId");
  }
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}
