import type { EnqueueOptions, JobPayload } from "./jobs.js";

export type SchedulePattern =
  | { readonly kind: "cron"; readonly expression: string; readonly timezone?: string }
  | { readonly kind: "interval"; readonly everyMs: number };

export interface ScheduledJobDefinition<
  Name extends string = string,
  Payload extends JobPayload = JobPayload,
> {
  readonly scheduleId: string;
  readonly queue: string;
  readonly name: Name;
  readonly data: Payload;
  readonly pattern: SchedulePattern;
  readonly options?: EnqueueOptions;
}

export interface JobScheduler {
  upsert(definition: ScheduledJobDefinition): Promise<void>;
  remove(scheduleId: string): Promise<boolean>;
  inspect?(definition: ScheduledJobDefinition): Promise<ScheduleDriftReport>;
}

export type ScheduleDriftStatus = "in_sync" | "missing" | "drifted" | "unknown";

export interface ScheduleDriftReport {
  readonly scheduleId: string;
  readonly queue: string;
  readonly status: ScheduleDriftStatus;
  readonly differences: readonly string[];
  readonly observedNextRunAt?: string;
}
