// framework/runtime/src/services/business/engines/event-store/persistence/checkpoint-repo.ts

import type { ProjectionCheckpoint } from "../domain/types.js";

/**
 * Checkpoint Repository — tracks consumer progress for projection resume/replay.
 */
export interface CheckpointRepo {
  /**
   * Upsert a checkpoint for a projection + partition.
   */
  upsert(tenantId: string, checkpoint: ProjectionCheckpoint): Promise<void>;

  /**
   * Get checkpoint for a projection + partition.
   */
  get(
    tenantId: string,
    projectionId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<ProjectionCheckpoint | null>;

  /**
   * Get all checkpoints for a projection.
   */
  getAllForProjection(
    tenantId: string,
    projectionId: string,
  ): Promise<ProjectionCheckpoint[]>;

  /**
   * Delete all checkpoints for a projection (used during full rebuild).
   */
  deleteForProjection(tenantId: string, projectionId: string): Promise<void>;
}
