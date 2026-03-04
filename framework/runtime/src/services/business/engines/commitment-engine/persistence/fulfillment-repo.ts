// framework/runtime/src/services/business/engines/commitment-engine/persistence/fulfillment-repo.ts

import type {
  CommitmentFulfillment,
  CreateFulfillmentInput,
} from "../domain/types.js";

/**
 * Commitment Fulfillment Repository.
 */
export interface CommitmentFulfillmentRepo {
  create(input: CreateFulfillmentInput): Promise<CommitmentFulfillment>;
  getById(tenantId: string, id: string): Promise<CommitmentFulfillment | null>;
  getByCommitmentId(
    tenantId: string,
    commitmentId: string,
  ): Promise<CommitmentFulfillment[]>;
  getByScheduleId(
    tenantId: string,
    scheduleId: string,
  ): Promise<CommitmentFulfillment[]>;
}
