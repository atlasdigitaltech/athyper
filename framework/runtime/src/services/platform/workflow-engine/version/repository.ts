/**
 * In-Memory Version Repository
 *
 * Provides in-memory storage for workflow versions
 * and lifecycle events.
 */

import type {
  IVersionRepository,
  VersionLifecycleEvent,
  VersionSearchCriteria,
  WorkflowVersion,
} from "./types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * In-Memory Version Repository Implementation
 */
export class InMemoryVersionRepository implements IVersionRepository {
  private versions: Map<string, WorkflowVersion> = new Map();
  private lifecycleEvents: Map<string, VersionLifecycleEvent[]> = new Map();

  // Version CRUD

  async createVersion(version: Omit<WorkflowVersion, "id">): Promise<WorkflowVersion> {
    const id = generateId("ver");
    const newVersion: WorkflowVersion = { id, ...version };
    this.versions.set(id, newVersion);
    return newVersion;
  }

  async getVersion(tenantId: string, versionId: string): Promise<WorkflowVersion | null> {
    return this.versions.get(versionId) || null;
  }

  async getVersionByNumber(
    tenantId: string,
    templateId: string,
    version: number
  ): Promise<WorkflowVersion | null> {
    return (
      Array.from(this.versions.values()).find(
        (v) => v.templateId === templateId && v.version === version
      ) || null
    );
  }

  async getVersions(tenantId: string, templateId: string): Promise<WorkflowVersion[]> {
    return Array.from(this.versions.values())
      .filter((v) => v.templateId === templateId)
      .sort((a, b) => b.version - a.version);
  }

  async getActiveVersion(tenantId: string, templateId: string): Promise<WorkflowVersion | null> {
    return (
      Array.from(this.versions.values()).find(
        (v) => v.templateId === templateId && v.status === "active"
      ) || null
    );
  }

  async updateVersion(
    tenantId: string,
    versionId: string,
    updates: Partial<WorkflowVersion>
  ): Promise<WorkflowVersion> {
    const existing = this.versions.get(versionId);
    if (!existing) {
      throw new Error(`Version not found: ${versionId}`);
    }

    const updated: WorkflowVersion = { ...existing, ...updates };
    this.versions.set(versionId, updated);
    return updated;
  }

  async searchVersions(
    tenantId: string,
    criteria: VersionSearchCriteria
  ): Promise<WorkflowVersion[]> {
    return Array.from(this.versions.values()).filter((v) => {
      if (criteria.templateId && v.templateId !== criteria.templateId) {
        return false;
      }

      if (criteria.status) {
        const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
        if (!statuses.includes(v.status)) {
          return false;
        }
      }

      if (criteria.createdAfter && new Date(v.createdAt) < criteria.createdAfter) {
        return false;
      }

      if (criteria.createdBefore && new Date(v.createdAt) > criteria.createdBefore) {
        return false;
      }

      if (criteria.createdBy && v.createdBy !== criteria.createdBy) {
        return false;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const versionTags = v.metadata.tags || [];
        if (!criteria.tags.some((t) => versionTags.includes(t))) {
          return false;
        }
      }

      if (criteria.hasActiveInstances !== undefined) {
        const hasActive = (v.activeInstanceCount || 0) > 0;
        if (criteria.hasActiveInstances !== hasActive) {
          return false;
        }
      }

      return true;
    });
  }

  // Lifecycle events

  async createLifecycleEvent(
    event: Omit<VersionLifecycleEvent, "id">
  ): Promise<VersionLifecycleEvent> {
    const id = generateId("evt");
    const newEvent: VersionLifecycleEvent = { id, ...event };

    const existing = this.lifecycleEvents.get(event.versionId) || [];
    existing.push(newEvent);
    this.lifecycleEvents.set(event.versionId, existing);

    return newEvent;
  }

  async getLifecycleEvents(tenantId: string, versionId: string): Promise<VersionLifecycleEvent[]> {
    return (this.lifecycleEvents.get(versionId) || []).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Statistics

  async updateInstanceCount(
    tenantId: string,
    versionId: string,
    count: number,
    activeCount: number
  ): Promise<void> {
    const version = this.versions.get(versionId);
    if (version) {
      version.instanceCount = count;
      version.activeInstanceCount = activeCount;
      this.versions.set(versionId, version);
    }
  }

  // Utility methods

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.versions.clear();
    this.lifecycleEvents.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    versions: { total: number; byStatus: Record<string, number> };
    lifecycleEvents: number;
  } {
    const versions = Array.from(this.versions.values());
    const byStatus: Record<string, number> = {};

    for (const v of versions) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
    }

    const eventCount = Array.from(this.lifecycleEvents.values()).reduce(
      (sum, events) => sum + events.length,
      0
    );

    return {
      versions: {
        total: versions.length,
        byStatus,
      },
      lifecycleEvents: eventCount,
    };
  }
}

/**
 * Factory function to create in-memory version repository
 */
export function createInMemoryVersionRepository(): IVersionRepository {
  return new InMemoryVersionRepository();
}
