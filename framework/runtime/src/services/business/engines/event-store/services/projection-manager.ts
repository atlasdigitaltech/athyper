// framework/runtime/src/services/business/engines/event-store/services/projection-manager.ts

import type { EventConsumer } from "./event-consumer.js";
import type {
  ProjectionRegistration,
  ProjectionSnapshot,
} from "../domain/types.js";
import type { CheckpointRepo } from "../persistence/checkpoint-repo.js";
import type { ProjectionRegistryRepo } from "../persistence/projection-registry-repo.js";
import type { SnapshotRepo } from "../persistence/snapshot-repo.js";

/**
 * Projection Manager — registers projections, manages rebuilds, verifies snapshots.
 */
export interface ProjectionManager {
  /**
   * Register a new projection.
   */
  register(
    tenantId: string,
    registration: ProjectionRegistration,
  ): Promise<void>;

  /**
   * Rebuild a projection from scratch (delete checkpoints + catchup from start).
   */
  rebuild(
    tenantId: string,
    projectionId: string,
  ): Promise<{ eventsProcessed: number }>;

  /**
   * Take a snapshot of the current projection state.
   */
  takeSnapshot(tenantId: string, snapshot: ProjectionSnapshot): Promise<void>;

  /**
   * Get the latest snapshot for a projection.
   */
  getLatestSnapshot(
    tenantId: string,
    projectionId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<ProjectionSnapshot | null>;

  /**
   * List all registered projections for a tenant.
   */
  listProjections(tenantId: string): Promise<ProjectionRegistration[]>;

  /**
   * List projections for a specific engine.
   */
  listByEngine(
    tenantId: string,
    engineCode: string,
  ): Promise<ProjectionRegistration[]>;
}

/**
 * Default implementation of ProjectionManager.
 */
export class DefaultProjectionManager implements ProjectionManager {
  constructor(
    private readonly registryRepo: ProjectionRegistryRepo,
    private readonly snapshotRepo: SnapshotRepo,
    private readonly checkpointRepo: CheckpointRepo,
    private readonly eventConsumer: EventConsumer,
  ) {}

  async register(
    tenantId: string,
    registration: ProjectionRegistration,
  ): Promise<void> {
    await this.registryRepo.upsert(tenantId, registration);
  }

  async rebuild(
    tenantId: string,
    projectionId: string,
  ): Promise<{ eventsProcessed: number }> {
    // Clear all checkpoints for this projection
    await this.checkpointRepo.deleteForProjection(tenantId, projectionId);

    // Catchup from the beginning
    return this.eventConsumer.catchUp(projectionId);
  }

  async takeSnapshot(
    tenantId: string,
    snapshot: ProjectionSnapshot,
  ): Promise<void> {
    await this.snapshotRepo.save(tenantId, snapshot);
  }

  async getLatestSnapshot(
    tenantId: string,
    projectionId: string,
    partitionDomain: string,
    partitionKey: string,
  ): Promise<ProjectionSnapshot | null> {
    return this.snapshotRepo.getLatest(
      tenantId,
      projectionId,
      partitionDomain,
      partitionKey,
    );
  }

  async listProjections(tenantId: string): Promise<ProjectionRegistration[]> {
    return this.registryRepo.getByEngine(tenantId, "*");
  }

  async listByEngine(
    tenantId: string,
    engineCode: string,
  ): Promise<ProjectionRegistration[]> {
    return this.registryRepo.getByEngine(tenantId, engineCode);
  }
}
