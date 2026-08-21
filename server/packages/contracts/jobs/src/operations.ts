import type { JobExecutionCoordinate, JobPayload } from "./jobs.js";

export interface QueueCatalogEntry {
  readonly queue: string;
  readonly handlers: readonly string[];
  readonly scope: "tenant" | "plane" | "mixed";
  readonly operationalControl: "none" | "pause-resume";
}

export interface JobExecutionSummary {
  readonly executionId: string;
  readonly executionKey: string;
  readonly jobCode: string;
  readonly status: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly completedAt?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface GovernedSchedule {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly handlerType: string;
  readonly cronExpression: string;
  readonly timezone: string;
  readonly targetQueue: string;
  readonly payloadTemplate: JobPayload;
  readonly enabled: boolean;
  readonly nextRunAt?: string;
}

export interface ScheduleChangeAudit {
  readonly action: "created" | "updated" | "deactivated";
  readonly reason: string;
  readonly changedAt: string;
  readonly changedBy: string;
}

export interface ScheduleMutation extends Omit<GovernedSchedule, "id" | "enabled" | "nextRunAt"> {}

export interface CronPreview {
  readonly expression: string;
  readonly timezone: string;
  readonly nextRuns: readonly string[];
}

export interface JobGovernance {
  listQueues(): Promise<readonly QueueCatalogEntry[]>;
  listExecutions(input: { readonly execution: JobExecutionCoordinate; readonly limit?: number; readonly cursor?: string }): Promise<readonly JobExecutionSummary[]>;
  listSchedules(execution: JobExecutionCoordinate): Promise<readonly GovernedSchedule[]>;
  previewCron(input: { readonly expression: string; readonly timezone: string; readonly count?: number; readonly from?: string }): CronPreview;
  createSchedule(input: { readonly execution: JobExecutionCoordinate; readonly schedule: ScheduleMutation; readonly reason: string }): Promise<GovernedSchedule>;
  updateSchedule(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string; readonly schedule: ScheduleMutation; readonly reason: string }): Promise<GovernedSchedule>;
  deactivateSchedule(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string; readonly reason: string }): Promise<void>;
  listScheduleAudit(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string }): Promise<readonly ScheduleChangeAudit[]>;
}
