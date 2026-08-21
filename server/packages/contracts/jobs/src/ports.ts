import type {
  EnqueueOptions,
  JobEnvelope,
  JobExecutionContext,
  JobExecutionResult,
  JobPayload,
} from "./jobs.js";

export interface JobPublisher {
  enqueue<Name extends string, Payload extends JobPayload>(
    queue: string,
    name: Name,
    data: Payload,
    options?: EnqueueOptions,
  ): Promise<string>;
}

export interface JobHandler<
  Name extends string = string,
  Payload extends JobPayload = JobPayload,
> {
  handle(
    job: JobEnvelope<Name, Payload>,
    context: JobExecutionContext,
  ): Promise<JobExecutionResult | void>;
}

export interface JobHandlerRegistry {
  register(queue: string, name: string, handler: JobHandler): void;
}
