// framework/runtime/src/services/business/engines/event-store/persistence/projection-registry-repo.ts

import type { ProjectionRegistration } from "../domain/types.js";

/**
 * Projection Registry Repository — manages formal projection registrations.
 */
export interface ProjectionRegistryRepo {
  /**
   * Register or update a projection.
   */
  upsert(tenantId: string, registration: ProjectionRegistration): Promise<void>;

  /**
   * Get a projection registration by ID.
   */
  getById(
    tenantId: string,
    projectionId: string,
  ): Promise<ProjectionRegistration | null>;

  /**
   * Get all active projections for an engine.
   */
  getByEngine(
    tenantId: string,
    owningEngine: string,
  ): Promise<ProjectionRegistration[]>;

  /**
   * Get all active projections that subscribe to a given event type.
   */
  getByEventType(
    tenantId: string,
    eventType: string,
  ): Promise<ProjectionRegistration[]>;

  /**
   * Deactivate a projection.
   */
  deactivate(tenantId: string, projectionId: string): Promise<void>;
}
