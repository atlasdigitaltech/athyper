import type { JobExecutionCoordinate, JobPayload, JobSubject, JobPayloadSchema } from "./jobs.js";

export type JobAdministrationCommand = "cancel" | "retry" | "replay";

export interface JobAdministrationRequest {
  readonly executionId: string;
  readonly execution: JobExecutionCoordinate;
  readonly reason: string;
}

export interface JobAdministrationResult {
  readonly command: JobAdministrationCommand;
  readonly applied: boolean;
  readonly jobId?: string;
  readonly reason?: string;
}

export interface JobReplaySource {
  readonly executionId: string;
  readonly executionKey: string;
  readonly jobId: string;
  readonly queue: string;
  readonly name: string;
  readonly data: JobPayload;
  readonly maxAttempts: number;
  readonly attempt?: number;
  readonly subject?: JobSubject;
  readonly payloadSchema?: JobPayloadSchema;
}

export interface JobDeadLetterSummary {
  readonly executionId: string;
  readonly executionKey: string;
  readonly jobCode: string;
  readonly attempt: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly completedAt: string;
}

export interface JobTransportControl {
  cancel(queue: string, jobId: string): Promise<boolean>;
  retry(queue: string, jobId: string): Promise<boolean>;
}

export interface JobAdministration {
  cancel(request: JobAdministrationRequest): Promise<JobAdministrationResult>;
  retry(request: JobAdministrationRequest): Promise<JobAdministrationResult>;
  replay(request: JobAdministrationRequest): Promise<JobAdministrationResult>;
  listDeadLetters(input: {
    readonly execution: JobExecutionCoordinate;
    readonly limit?: number;
  }): Promise<readonly JobDeadLetterSummary[]>;
}
