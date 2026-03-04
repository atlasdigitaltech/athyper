/**
 * Approval Workflow Repository
 *
 * Storage implementations for approval workflow templates.
 * Provides both in-memory (for testing) and database (for production) implementations.
 */

import type {
  ApprovalEntityType,
  ApprovalTriggerEvent,
  ApprovalWorkflowQueryOptions,
  CreateApprovalWorkflowInput,
  IApprovalWorkflowRepository,
  StoredApprovalWorkflowTemplate,
  UpdateApprovalWorkflowInput,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// In-Memory Repository (for testing/development)
// ============================================================================

/**
 * In-memory implementation of the approval workflow repository.
 * Useful for testing and development.
 */
export class InMemoryApprovalWorkflowRepository implements IApprovalWorkflowRepository {
  private templates: Map<string, StoredApprovalWorkflowTemplate> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter++;
    return `awf-${Date.now()}-${this.idCounter}`;
  }

  private makeKey(tenantId: string, templateId: string): string {
    return `${tenantId}:${templateId}`;
  }

  async getById(tenantId: string, templateId: string): Promise<StoredApprovalWorkflowTemplate | undefined> {
    return this.templates.get(this.makeKey(tenantId, templateId));
  }

  async getByCode(
    tenantId: string,
    code: string,
    version?: number
  ): Promise<StoredApprovalWorkflowTemplate | undefined> {
    const templates = Array.from(this.templates.values()).filter(
      (t) => t.tenantId === tenantId && t.code === code
    );

    if (version !== undefined) {
      return templates.find((t) => t.version === version);
    }

    // Return highest version
    return templates.sort((a, b) => b.version - a.version)[0];
  }

  async getActiveByCode(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate | undefined> {
    return Array.from(this.templates.values()).find(
      (t) => t.tenantId === tenantId && t.code === code && t.isActive
    );
  }

  async list(
    tenantId: string,
    options?: ApprovalWorkflowQueryOptions
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    let results = Array.from(this.templates.values()).filter(
      (t) => t.tenantId === tenantId
    );

    // Apply filters
    if (options?.entityType) {
      results = results.filter((t) => t.entityType === options.entityType);
    }

    if (options?.enabled !== undefined) {
      results = results.filter((t) => t.enabled === options.enabled);
    }

    if (options?.activeOnly) {
      results = results.filter((t) => t.isActive);
    }

    if (options?.code) {
      results = results.filter((t) => t.code === options.code);
    }

    if (options?.searchName) {
      const searchLower = options.searchName.toLowerCase();
      results = results.filter((t) => t.name.toLowerCase().includes(searchLower));
    }

    if (!options?.includeInactive) {
      // Group by code and keep only active or highest version
      const byCode = new Map<string, StoredApprovalWorkflowTemplate>();
      for (const template of results) {
        const existing = byCode.get(template.code);
        if (!existing) {
          byCode.set(template.code, template);
        } else if (template.isActive || template.version > existing.version) {
          byCode.set(template.code, template);
        }
      }
      results = Array.from(byCode.values());
    }

    // Sort
    const sortBy = options?.sortBy || "name";
    const sortDir = options?.sortDirection === "desc" ? -1 : 1;
    results.sort((a, b) => {
      const aVal = a[sortBy as keyof StoredApprovalWorkflowTemplate];
      const bVal = b[sortBy as keyof StoredApprovalWorkflowTemplate];
      if (aVal === bVal) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * sortDir;
      }
      return (aVal < bVal ? -1 : 1) * sortDir;
    });

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async create(
    tenantId: string,
    template: CreateApprovalWorkflowInput,
    createdBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const id = this.generateId();
    const now = new Date();

    const stored: StoredApprovalWorkflowTemplate = {
      ...template,
      id,
      tenantId,
      version: 1,
      isActive: false,
      createdAt: now,
      createdBy,
    };

    this.templates.set(this.makeKey(tenantId, id), stored);
    return stored;
  }

  async update(
    tenantId: string,
    templateId: string,
    updates: UpdateApprovalWorkflowInput,
    updatedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const existing = await this.getById(tenantId, templateId);
    if (!existing) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create new version
    const newId = this.generateId();
    const now = new Date();

    const updated: StoredApprovalWorkflowTemplate = {
      ...existing,
      ...updates,
      id: newId,
      tenantId,
      version: existing.version + 1,
      isActive: false,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: now,
      updatedBy,
    };

    // Store new version
    this.templates.set(this.makeKey(tenantId, newId), updated);

    // Mark old version as inactive
    existing.isActive = false;
    this.templates.set(this.makeKey(tenantId, templateId), existing);

    return updated;
  }

  async publish(
    tenantId: string,
    templateId: string,
    publishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const template = await this.getById(tenantId, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Deactivate other versions with same code
    for (const [key, t] of this.templates) {
      if (t.tenantId === tenantId && t.code === template.code && t.id !== templateId) {
        t.isActive = false;
        this.templates.set(key, t);
      }
    }

    // Activate this version
    const now = new Date();
    template.isActive = true;
    template.publishedAt = now;
    template.publishedBy = publishedBy;
    this.templates.set(this.makeKey(tenantId, templateId), template);

    return template;
  }

  async unpublish(
    tenantId: string,
    templateId: string,
    _unpublishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const template = await this.getById(tenantId, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.isActive = false;
    this.templates.set(this.makeKey(tenantId, templateId), template);

    return template;
  }

  async delete(tenantId: string, templateId: string): Promise<void> {
    this.templates.delete(this.makeKey(tenantId, templateId));
  }

  async getVersionHistory(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate[]> {
    return Array.from(this.templates.values())
      .filter((t) => t.tenantId === tenantId && t.code === code)
      .sort((a, b) => b.version - a.version);
  }

  async clone(
    tenantId: string,
    templateId: string,
    newCode: string,
    newName: string,
    clonedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const existing = await this.getById(tenantId, templateId);
    if (!existing) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const id = this.generateId();
    const now = new Date();

    const cloned: StoredApprovalWorkflowTemplate = {
      ...existing,
      id,
      code: newCode,
      name: newName,
      version: 1,
      isActive: false,
      createdAt: now,
      createdBy: clonedBy,
      updatedAt: undefined,
      updatedBy: undefined,
      publishedAt: undefined,
      publishedBy: undefined,
    };

    this.templates.set(this.makeKey(tenantId, id), cloned);
    return cloned;
  }

  async findMatchingTemplates(
    tenantId: string,
    entityType: ApprovalEntityType,
    triggerEvent: ApprovalTriggerEvent
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    return Array.from(this.templates.values())
      .filter((t) => {
        if (t.tenantId !== tenantId) return false;
        if (!t.isActive || !t.enabled) return false;
        if (t.entityType !== entityType) return false;

        // Check if any trigger matches the event
        return t.triggers.some((trigger) => trigger.event === triggerEvent);
      })
      .sort((a, b) => a.priority - b.priority);
  }

  // Utility methods for testing
  clear(): void {
    this.templates.clear();
    this.idCounter = 0;
  }

  count(): number {
    return this.templates.size;
  }
}

// ============================================================================
// Database Repository (for production)
// ============================================================================

/**
 * Database-backed implementation of the approval workflow repository.
 * Stores templates in meta.approval_workflow_template table.
 */
export class DatabaseApprovalWorkflowRepository implements IApprovalWorkflowRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(tenantId: string, templateId: string): Promise<StoredApprovalWorkflowTemplate | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", templateId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToTemplate(result);
  }

  async getByCode(
    tenantId: string,
    code: string,
    version?: number
  ): Promise<StoredApprovalWorkflowTemplate | undefined> {
    let query = this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code);

    if (version !== undefined) {
      query = query.where("version", "=", version);
    } else {
      query = query.orderBy("version", "desc");
    }

    const result = await query.executeTakeFirst();
    if (!result) return undefined;
    return this.mapRowToTemplate(result);
  }

  async getActiveByCode(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToTemplate(result);
  }

  async list(
    tenantId: string,
    options?: ApprovalWorkflowQueryOptions
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    let query = this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.entityType) {
      query = query.where("entity_type", "=", options.entityType);
    }

    if (options?.enabled !== undefined) {
      query = query.where("is_enabled", "=", options.enabled);
    }

    if (options?.activeOnly) {
      query = query.where("is_active", "=", true);
    }

    if (options?.code) {
      query = query.where("code", "=", options.code);
    }

    if (options?.searchName) {
      query = query.where("name", "ilike", `%${options.searchName}%`);
    }

    // Sorting
    const sortBy = this.mapSortField(options?.sortBy || "name");
    const sortDir = options?.sortDirection === "desc" ? "desc" : "asc";
    query = query.orderBy(sortBy, sortDir);

    // Pagination
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    query = query.limit(limit).offset(offset);

    const results = await query.execute();
    return results.map((r: any) => this.mapRowToTemplate(r));
  }

  async create(
    tenantId: string,
    template: CreateApprovalWorkflowInput,
    createdBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("meta.approval_workflow_template" as any)
      .values({
        id,
        tenant_id: tenantId,
        name: template.name,
        code: template.code,
        description: template.description,
        entity_type: template.entityType,
        custom_entity_type: template.customEntityType,
        version: 1,
        is_active: false,
        is_enabled: template.enabled,
        priority: template.priority,
        triggers: JSON.stringify(template.triggers),
        steps: JSON.stringify(template.steps),
        global_sla: template.globalSla ? JSON.stringify(template.globalSla) : null,
        allowed_actions: JSON.stringify(template.allowedActions),
        metadata: template.metadata ? JSON.stringify(template.metadata) : null,
        created_at: now,
        created_by: createdBy,
      })
      .execute();

    return {
      ...template,
      id,
      tenantId,
      version: 1,
      isActive: false,
      createdAt: now,
      createdBy,
    };
  }

  async update(
    tenantId: string,
    templateId: string,
    updates: UpdateApprovalWorkflowInput,
    updatedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const existing = await this.getById(tenantId, templateId);
    if (!existing) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create new version
    const newId = crypto.randomUUID();
    const now = new Date();

    const merged = { ...existing, ...updates };

    await this.db
      .insertInto("meta.approval_workflow_template" as any)
      .values({
        id: newId,
        tenant_id: tenantId,
        name: merged.name,
        code: merged.code,
        description: merged.description,
        entity_type: merged.entityType,
        custom_entity_type: merged.customEntityType,
        version: existing.version + 1,
        is_active: false,
        is_enabled: merged.enabled,
        priority: merged.priority,
        triggers: JSON.stringify(merged.triggers),
        steps: JSON.stringify(merged.steps),
        global_sla: merged.globalSla ? JSON.stringify(merged.globalSla) : null,
        allowed_actions: JSON.stringify(merged.allowedActions),
        metadata: merged.metadata ? JSON.stringify(merged.metadata) : null,
        created_at: existing.createdAt,
        created_by: existing.createdBy,
        updated_at: now,
        updated_by: updatedBy,
      })
      .execute();

    return {
      ...merged,
      id: newId,
      version: existing.version + 1,
      isActive: false,
      updatedAt: now,
      updatedBy,
    };
  }

  async publish(
    tenantId: string,
    templateId: string,
    publishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const template = await this.getById(tenantId, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const now = new Date();

    // Deactivate other versions
    await this.db
      .updateTable("meta.approval_workflow_template" as any)
      .set({ is_active: false })
      .where("tenant_id", "=", tenantId)
      .where("code", "=", template.code)
      .where("id", "!=", templateId)
      .execute();

    // Activate this version
    await this.db
      .updateTable("meta.approval_workflow_template" as any)
      .set({
        is_active: true,
        published_at: now,
        published_by: publishedBy,
      })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", templateId)
      .execute();

    return {
      ...template,
      isActive: true,
      publishedAt: now,
      publishedBy,
    };
  }

  async unpublish(
    tenantId: string,
    templateId: string,
    _unpublishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const template = await this.getById(tenantId, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    await this.db
      .updateTable("meta.approval_workflow_template" as any)
      .set({ is_active: false })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", templateId)
      .execute();

    return {
      ...template,
      isActive: false,
    };
  }

  async delete(tenantId: string, templateId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.approval_workflow_template" as any)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", templateId)
      .execute();
  }

  async getVersionHistory(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate[]> {
    const results = await this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .orderBy("version", "desc")
      .execute();

    return results.map((r: any) => this.mapRowToTemplate(r));
  }

  async clone(
    tenantId: string,
    templateId: string,
    newCode: string,
    newName: string,
    clonedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    const existing = await this.getById(tenantId, templateId);
    if (!existing) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("meta.approval_workflow_template" as any)
      .values({
        id,
        tenant_id: tenantId,
        name: newName,
        code: newCode,
        description: existing.description,
        entity_type: existing.entityType,
        custom_entity_type: existing.customEntityType,
        version: 1,
        is_active: false,
        is_enabled: existing.enabled,
        priority: existing.priority,
        triggers: JSON.stringify(existing.triggers),
        steps: JSON.stringify(existing.steps),
        global_sla: existing.globalSla ? JSON.stringify(existing.globalSla) : null,
        allowed_actions: JSON.stringify(existing.allowedActions),
        metadata: existing.metadata ? JSON.stringify(existing.metadata) : null,
        created_at: now,
        created_by: clonedBy,
      })
      .execute();

    return {
      ...existing,
      id,
      name: newName,
      code: newCode,
      version: 1,
      isActive: false,
      createdAt: now,
      createdBy: clonedBy,
      updatedAt: undefined,
      updatedBy: undefined,
      publishedAt: undefined,
      publishedBy: undefined,
    };
  }

  async findMatchingTemplates(
    tenantId: string,
    entityType: ApprovalEntityType,
    triggerEvent: ApprovalTriggerEvent
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    // Get all active templates for this entity type
    const results = await this.db
      .selectFrom("meta.approval_workflow_template" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("is_active", "=", true)
      .where("is_enabled", "=", true)
      .orderBy("priority", "asc")
      .execute();

    // Filter by trigger event in application code
    // (JSON querying varies by database)
    return results
      .map((r: any) => this.mapRowToTemplate(r))
      .filter((t) => t.triggers.some((trigger) => trigger.event === triggerEvent));
  }

  private mapRowToTemplate(row: any): StoredApprovalWorkflowTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      code: row.code,
      description: row.description,
      entityType: row.entity_type,
      customEntityType: row.custom_entity_type,
      version: row.version,
      isActive: row.is_active,
      enabled: row.is_enabled,
      priority: row.priority,
      triggers: this.parseJson(row.triggers) || [],
      steps: this.parseJson(row.steps) || [],
      globalSla: this.parseJson(row.global_sla),
      allowedActions: this.parseJson(row.allowed_actions) || [],
      metadata: this.parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      updatedBy: row.updated_by,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      publishedBy: row.published_by,
    };
  }

  private parseJson(value: unknown): any {
    if (!value) return undefined;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  }

  private mapSortField(field: string): string {
    const fieldMap: Record<string, string> = {
      name: "name",
      code: "code",
      createdAt: "created_at",
      updatedAt: "updated_at",
      priority: "priority",
    };
    return fieldMap[field] || "name";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create in-memory approval workflow repository
 */
export function createInMemoryApprovalWorkflowRepository(): InMemoryApprovalWorkflowRepository {
  return new InMemoryApprovalWorkflowRepository();
}

/**
 * Create database approval workflow repository
 */
export function createDatabaseApprovalWorkflowRepository(db: Kysely<DB>): DatabaseApprovalWorkflowRepository {
  return new DatabaseApprovalWorkflowRepository(db);
}
