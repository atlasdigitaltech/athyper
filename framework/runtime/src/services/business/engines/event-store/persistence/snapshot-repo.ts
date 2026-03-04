// framework/runtime/src/services/business/engines/event-store/persistence/snapshot-repo.ts

import type { ProjectionSnapshot } from "../domain/types.js";

/**
 * Snapshot Repository — manages projection state snapshots for efficient rebuild.
 */
export interface SnapshotRepo {
  /**
   * Save a projection snapshot.
   */
  save(tenantId: string, snapshot: ProjectionSnapshot): Promise<void>;

  /**
   * Get the latest snapshot for a projection + partition.
   */
  getLatest(
    tenantId: string,
    projectionId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<ProjectionSnapshot | null>;

  /**
   * Delete snapshots older than a given sequence number.
   */
  deleteOlderThan(
    tenantId: string,
    projectionId: string,
    partitionDomain: string,
    partitionKey: string,
    beforeSequenceNo: bigint,
  ): Promise<number>;
}
