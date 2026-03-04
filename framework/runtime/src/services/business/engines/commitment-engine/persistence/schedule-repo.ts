// framework/runtime/src/services/business/engines/commitment-engine/persistence/schedule-repo.ts

import type {
  CommitmentSchedule,
  CreateScheduleInput,
  ScheduleStatus,
} from "../domain/types.js";

/**
 * Commitment Schedule Repository.
 */
export interface CommitmentScheduleRepo {
  create(input: CreateScheduleInput): Promise<CommitmentSchedule>;
  createBatch(inputs: CreateScheduleInput[]): Promise<CommitmentSchedule[]>;
  getById(tenantId: string, id: string): Promise<CommitmentSchedule | null>;
  getByCommitmentId(
    tenantId: string,
    commitmentId: string,
  ): Promise<CommitmentSchedule[]>;

  updateStatus(
    tenantId: string,
    id: string,
    status: ScheduleStatus,
    timestamps?: {
      triggeredAt?: Date;
      fulfilledAt?: Date;
    },
  ): Promise<CommitmentSchedule>;

  /** Get schedules due on or before a date with PENDING status */
  getDueSchedules(
    tenantId: string,
    dueDate: Date,
  ): Promise<CommitmentSchedule[]>;

  /** Cancel all pending schedules for a commitment */
  cancelAllPending(tenantId: string, commitmentId: string): Promise<number>;
}
