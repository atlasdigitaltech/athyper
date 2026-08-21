import type { PlaneKey } from "@athyper/server-foundation/context";

import type {
  JobEnvelope,
  JobExecutionFailure,
  JobExecutionResult,
  JobPayload,
  JobPayloadSchema,
  JobScope,
  JobSubject,
} from "./jobs.js";
import type { ScheduledJobDefinition } from "./scheduling.js";

export type JobExecutionStatus =
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "dead_letter";

export interface JobDefinition {
  readonly code: string;
  readonly owner: string;
  readonly queue: string;
  readonly name: string;
  readonly scope: JobScope;
  readonly payloadSchema: JobPayloadSchema;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly executionRetentionDays?: number;
}

export interface JobDefinitionCatalog {
  get(queue: string, name: string): JobDefinition | undefined;
  list(): readonly JobDefinition[];
}

export interface JobExecutionIdentity {
  readonly executionId: string;
  readonly executionKey: string;
}

export interface JobExecutionLifecycle {
  enqueued(input: {
    readonly jobId: string;
    readonly queue: string;
    readonly name: string;
    readonly data: JobPayload;
    readonly maxAttempts: number;
    readonly executionKey: string;
    readonly execution?: JobEnvelope["execution"];
    readonly subject?: JobSubject;
    readonly payloadSchema?: JobPayloadSchema;
    readonly enqueuedAt: string;
  }): Promise<JobExecutionIdentity | void>;
  started(job: JobEnvelope): Promise<void>;
  completed(job: JobEnvelope, result: JobExecutionResult | void): Promise<void>;
  failed(job: JobEnvelope, failure: JobExecutionFailure): Promise<void>;
}

export interface GovernedScheduleRecord {
  readonly id: string;
  readonly planeKey: PlaneKey;
  readonly tenantId?: string;
  readonly code: string;
  readonly handlerType: string;
  readonly definition: ScheduledJobDefinition;
}

export interface JobScheduleRepository {
  listActive(planeKey: PlaneKey): Promise<readonly GovernedScheduleRecord[]>;
  markReconciled(input: {
    readonly planeKey: PlaneKey;
    readonly scheduleId: string;
    readonly reconciledAt: string;
    readonly nextRunAt?: string;
  }): Promise<void>;
}
