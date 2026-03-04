/**
 * Overlay Repository
 *
 * Storage implementation for schema overlays.
 * Provides both in-memory (for testing) and database (for production) implementations.
 */

import { OverlayNotFoundError } from "./types.js";

import type {
  OverlayRecord,
  OverlayChangeRecord,
  OverlayWithChanges,
  CreateOverlayInput,
  CreateOverlayChangeInput,
  UpdateOverlayInput,
  ListOverlaysOptions,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


// ============================================================================
// Repository Interface
// ============================================================================

/**
 * Interface for overlay repository implementations
 */
export interface IOverlayRepository {
  // Overlay CRUD
  findById(id: string): Promise<OverlayRecord | null>;
  findByKey(overlayKey: string, tenantId: string): Promise<OverlayRecord | null>;
  findByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]>;
  findActiveByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]>;
  list(tenantId: string, options?: ListOverlaysOptions): Promise<OverlayRecord[]>;
  create(input: CreateOverlayInput, tenantId: string, createdBy?: string): Promise<OverlayRecord>;
  update(id: string, input: UpdateOverlayInput, updatedBy?: string): Promise<OverlayRecord>;
  delete(id: string): Promise<void>;

  // Overlay with changes
  findByIdWithChanges(id: string): Promise<OverlayWithChanges | null>;
  findByKeyWithChanges(overlayKey: string, tenantId: string): Promise<OverlayWithChanges | null>;

  // Change CRUD
  getChanges(overlayId: string): Promise<OverlayChangeRecord[]>;
  addChange(overlayId: string, change: CreateOverlayChangeInput, tenantId: string, createdBy?: string): Promise<OverlayChangeRecord>;
  removeChange(changeId: string): Promise<void>;
  reorderChanges(overlayId: string, changeIds: string[]): Promise<void>;
}

// ============================================================================
// In-Memory Repository (for testing/development)
// ============================================================================

/**
 * In-memory implementation of the overlay repository.
 * Useful for testing and development.
 */
export class InMemoryOverlayRepository implements IOverlayRepository {
  private overlays: Map<string, OverlayRecord> = new Map();
  private changes: Map<string, OverlayChangeRecord> = new Map();
  private overlayIdCounter = 0;
  private changeIdCounter = 0;

  private generateOverlayId(): string {
    this.overlayIdCounter++;
    return `overlay-${Date.now()}-${this.overlayIdCounter}`;
  }

  private generateChangeId(): string {
    this.changeIdCounter++;
    return `change-${Date.now()}-${this.changeIdCounter}`;
  }

  async findById(id: string): Promise<OverlayRecord | null> {
    return this.overlays.get(id) ?? null;
  }

  async findByKey(overlayKey: string, tenantId: string): Promise<OverlayRecord | null> {
    return (
      Array.from(this.overlays.values()).find(
        (o) => o.overlayKey === overlayKey && o.tenantId === tenantId
      ) ?? null
    );
  }

  async findByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]> {
    return Array.from(this.overlays.values())
      .filter((o) => o.baseEntityId === baseEntityId && o.tenantId === tenantId)
      .sort((a, b) => a.priority - b.priority);
  }

  async findActiveByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]> {
    return Array.from(this.overlays.values())
      .filter((o) => o.baseEntityId === baseEntityId && o.tenantId === tenantId && o.isActive)
      .sort((a, b) => a.priority - b.priority);
  }

  async list(tenantId: string, options?: ListOverlaysOptions): Promise<OverlayRecord[]> {
    let results = Array.from(this.overlays.values()).filter((o) => o.tenantId === tenantId);

    // Apply filters
    if (options?.baseEntityId) {
      results = results.filter((o) => o.baseEntityId === options.baseEntityId);
    }

    if (options?.isActive !== undefined) {
      results = results.filter((o) => o.isActive === options.isActive);
    }

    // Sort
    const orderBy = options?.orderBy ?? "priority";
    const dir = options?.orderDirection === "desc" ? -1 : 1;

    results.sort((a, b) => {
      const aVal = a[orderBy] as number | Date;
      const bVal = b[orderBy] as number | Date;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async create(input: CreateOverlayInput, tenantId: string, createdBy?: string): Promise<OverlayRecord> {
    const id = this.generateOverlayId();
    const now = new Date();

    const record: OverlayRecord = {
      id,
      overlayKey: input.overlayKey,
      baseEntityId: input.baseEntityId,
      baseVersionId: input.baseVersionId,
      priority: input.priority ?? 100,
      conflictMode: input.conflictMode ?? "fail",
      description: input.description,
      isActive: true,
      tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy,
      version: 1,
    };

    this.overlays.set(id, record);

    // Add initial changes if provided
    if (input.changes) {
      for (let i = 0; i < input.changes.length; i++) {
        await this.addChange(id, input.changes[i], tenantId, createdBy);
      }
    }

    return record;
  }

  async update(id: string, input: UpdateOverlayInput, updatedBy?: string): Promise<OverlayRecord> {
    const existing = this.overlays.get(id);
    if (!existing) {
      throw new OverlayNotFoundError(id);
    }

    const updated: OverlayRecord = {
      ...existing,
      priority: input.priority ?? existing.priority,
      conflictMode: input.conflictMode ?? existing.conflictMode,
      description: input.description ?? existing.description,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date(),
      updatedBy,
      version: existing.version + 1,
    };

    this.overlays.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    // Delete changes first
    const changes = await this.getChanges(id);
    for (const change of changes) {
      this.changes.delete(change.id);
    }

    this.overlays.delete(id);
  }

  async findByIdWithChanges(id: string): Promise<OverlayWithChanges | null> {
    const overlay = await this.findById(id);
    if (!overlay) return null;

    const changes = await this.getChanges(id);
    return { ...overlay, changes };
  }

  async findByKeyWithChanges(overlayKey: string, tenantId: string): Promise<OverlayWithChanges | null> {
    const overlay = await this.findByKey(overlayKey, tenantId);
    if (!overlay) return null;

    const changes = await this.getChanges(overlay.id);
    return { ...overlay, changes };
  }

  async getChanges(overlayId: string): Promise<OverlayChangeRecord[]> {
    return Array.from(this.changes.values())
      .filter((c) => c.overlayId === overlayId)
      .sort((a, b) => a.changeOrder - b.changeOrder);
  }

  async addChange(overlayId: string, change: CreateOverlayChangeInput, _tenantId: string, _createdBy?: string): Promise<OverlayChangeRecord> {
    const existingChanges = await this.getChanges(overlayId);
    const maxOrder = existingChanges.length > 0 ? Math.max(...existingChanges.map((c) => c.changeOrder)) : -1;

    const id = this.generateChangeId();
    const record: OverlayChangeRecord = {
      id,
      overlayId,
      changeOrder: maxOrder + 1,
      kind: change.kind,
      path: change.path,
      value: change.value,
      createdAt: new Date(),
    };

    this.changes.set(id, record);
    return record;
  }

  async removeChange(changeId: string): Promise<void> {
    this.changes.delete(changeId);
  }

  async reorderChanges(overlayId: string, changeIds: string[]): Promise<void> {
    for (let i = 0; i < changeIds.length; i++) {
      const change = this.changes.get(changeIds[i]);
      if (change && change.overlayId === overlayId) {
        this.changes.set(changeIds[i], { ...change, changeOrder: i });
      }
    }
  }
}

// ============================================================================
// Database Repository (for production)
// ============================================================================

/**
 * Database implementation of the overlay repository.
 * Uses Kysely for type-safe SQL queries.
 */
export class DatabaseOverlayRepository implements IOverlayRepository {
  constructor(private db: Kysely<DB>) {}

  async findById(id: string): Promise<OverlayRecord | null> {
    const result = await this.db
      .selectFrom("meta.overlay" as any)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  async findByKey(overlayKey: string, tenantId: string): Promise<OverlayRecord | null> {
    const result = await this.db
      .selectFrom("meta.overlay" as any)
      .selectAll()
      .where("overlay_key", "=", overlayKey)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return result ? this.mapToRecord(result) : null;
  }

  async findByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]> {
    const results = await this.db
      .selectFrom("meta.overlay" as any)
      .selectAll()
      .where("base_entity_id", "=", baseEntityId)
      .where("tenant_id", "=", tenantId)
      .orderBy("priority", "asc")
      .execute();

    return results.map(this.mapToRecord);
  }

  async findActiveByBaseEntity(baseEntityId: string, tenantId: string): Promise<OverlayRecord[]> {
    const results = await this.db
      .selectFrom("meta.overlay" as any)
      .selectAll()
      .where("base_entity_id", "=", baseEntityId)
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    return results.map(this.mapToRecord);
  }

  async list(tenantId: string, options?: ListOverlaysOptions): Promise<OverlayRecord[]> {
    let query = this.db
      .selectFrom("meta.overlay" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.baseEntityId) {
      query = query.where("base_entity_id", "=", options.baseEntityId);
    }

    if (options?.isActive !== undefined) {
      query = query.where("is_active", "=", options.isActive);
    }

    const orderBy = options?.orderBy ?? "priority";
    const orderCol =
      orderBy === "priority" ? "priority" : orderBy === "createdAt" ? "created_at" : "updated_at";
    query = query.orderBy(orderCol, options?.orderDirection ?? "asc");

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query.execute();
    return results.map(this.mapToRecord);
  }

  async create(input: CreateOverlayInput, tenantId: string, createdBy?: string): Promise<OverlayRecord> {
    const result = await this.db
      .insertInto("meta.overlay" as any)
      .values({
        overlay_key: input.overlayKey,
        base_entity_id: input.baseEntityId,
        base_version_id: input.baseVersionId,
        priority: input.priority ?? 100,
        conflict_mode: input.conflictMode ?? "fail",
        description: input.description,
        is_active: true,
        tenant_id: tenantId,
        created_by: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const record = this.mapToRecord(result);

    // Add initial changes if provided
    if (input.changes) {
      for (const change of input.changes) {
        await this.addChange(record.id, change, tenantId, createdBy);
      }
    }

    return record;
  }

  async update(id: string, input: UpdateOverlayInput, updatedBy?: string): Promise<OverlayRecord> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: updatedBy,
    };

    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }
    if (input.conflictMode !== undefined) {
      updateData.conflict_mode = input.conflictMode;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.isActive !== undefined) {
      updateData.is_active = input.isActive;
    }

    const result = await this.db
      .updateTable("meta.overlay" as any)
      .set(updateData)
      .set((eb: any) => ({ version: eb("version", "+", 1) }))
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new OverlayNotFoundError(id);
    }

    return this.mapToRecord(result);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom("meta.overlay" as any)
      .where("id", "=", id)
      .execute();
  }

  async findByIdWithChanges(id: string): Promise<OverlayWithChanges | null> {
    const overlay = await this.findById(id);
    if (!overlay) return null;

    const changes = await this.getChanges(id);
    return { ...overlay, changes };
  }

  async findByKeyWithChanges(overlayKey: string, tenantId: string): Promise<OverlayWithChanges | null> {
    const overlay = await this.findByKey(overlayKey, tenantId);
    if (!overlay) return null;

    const changes = await this.getChanges(overlay.id);
    return { ...overlay, changes };
  }

  async getChanges(overlayId: string): Promise<OverlayChangeRecord[]> {
    const results = await this.db
      .selectFrom("meta.overlay_change" as any)
      .selectAll()
      .where("overlay_id", "=", overlayId)
      .orderBy("change_order", "asc")
      .execute();

    return results.map(this.mapToChangeRecord);
  }

  async addChange(overlayId: string, change: CreateOverlayChangeInput, tenantId: string, createdBy?: string): Promise<OverlayChangeRecord> {
    // Get next change order
    const existingChanges = await this.getChanges(overlayId);
    const maxOrder = existingChanges.length > 0 ? Math.max(...existingChanges.map((c) => c.changeOrder)) : -1;

    const result = await this.db
      .insertInto("meta.overlay_change" as any)
      .values({
        overlay_id: overlayId,
        tenant_id: tenantId,
        change_order: maxOrder + 1,
        kind: change.kind,
        path: change.path,
        value: change.value ? JSON.stringify(change.value) : null,
        created_by: createdBy ?? "system",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToChangeRecord(result);
  }

  async removeChange(changeId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.overlay_change" as any)
      .where("id", "=", changeId)
      .execute();
  }

  async reorderChanges(overlayId: string, changeIds: string[]): Promise<void> {
    // Use a transaction to update all change orders atomically
    await this.db.transaction().execute(async (trx) => {
      for (let i = 0; i < changeIds.length; i++) {
        await trx
          .updateTable("meta.overlay_change" as any)
          .set({ change_order: i })
          .where("id", "=", changeIds[i])
          .where("overlay_id", "=", overlayId)
          .execute();
      }
    });
  }

  // ============================================================================
  // Mapping Helpers
  // ============================================================================

  private mapToRecord(row: any): OverlayRecord {
    return {
      id: row.id,
      overlayKey: row.overlay_key,
      baseEntityId: row.base_entity_id,
      baseVersionId: row.base_version_id ?? undefined,
      priority: row.priority,
      conflictMode: row.conflict_mode,
      description: row.description ?? undefined,
      isActive: row.is_active,
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by ?? undefined,
      updatedBy: row.updated_by ?? undefined,
      version: row.version,
    };
  }

  private mapToChangeRecord(row: any): OverlayChangeRecord {
    return {
      id: row.id,
      overlayId: row.overlay_id,
      changeOrder: row.change_order,
      kind: row.kind,
      path: row.path,
      value: row.value ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
