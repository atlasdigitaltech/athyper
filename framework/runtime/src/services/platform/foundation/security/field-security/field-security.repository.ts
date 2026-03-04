/**
 * Field Security Repository
 *
 * Storage implementation for field-level security policies and audit logs.
 */

import type {
  CreateFieldSecurityPolicyInput,
  FieldAccessAuditEntry,
  FieldSecurityPolicy,
  GetAccessLogOptions,
  ListFieldSecurityPoliciesOptions,
  UpdateFieldSecurityPolicyInput,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


// ============================================================================
// Repository Interface
// ============================================================================

/**
 * Interface for field security repository implementations
 */
export interface IFieldSecurityRepository {
  // Policy CRUD
  findPoliciesForEntity(entityId: string, tenantId: string): Promise<FieldSecurityPolicy[]>;
  findPolicyById(id: string): Promise<FieldSecurityPolicy | null>;
  findPoliciesForField(
    entityId: string,
    fieldPath: string,
    tenantId: string
  ): Promise<FieldSecurityPolicy[]>;
  listPolicies(tenantId: string, options?: ListFieldSecurityPoliciesOptions): Promise<FieldSecurityPolicy[]>;
  createPolicy(
    input: CreateFieldSecurityPolicyInput,
    tenantId: string,
    createdBy?: string
  ): Promise<FieldSecurityPolicy>;
  updatePolicy(id: string, input: UpdateFieldSecurityPolicyInput, updatedBy?: string): Promise<FieldSecurityPolicy>;
  deletePolicy(id: string): Promise<void>;

  // Audit logging
  logAccess(entry: FieldAccessAuditEntry): Promise<void>;
  logAccessBatch(entries: FieldAccessAuditEntry[]): Promise<void>;
  getAccessLog(
    entityKey: string,
    tenantId: string,
    options?: GetAccessLogOptions
  ): Promise<FieldAccessAuditEntry[]>;
}

// ============================================================================
// In-Memory Repository (for testing/development)
// ============================================================================

/**
 * In-memory implementation of the field security repository.
 * Useful for testing and development.
 */
export class InMemoryFieldSecurityRepository implements IFieldSecurityRepository {
  private policies: Map<string, FieldSecurityPolicy> = new Map();
  private accessLogs: FieldAccessAuditEntry[] = [];
  private idCounter = 0;

  private generateId(): string {
    this.idCounter++;
    return `fsp-${Date.now()}-${this.idCounter}`;
  }

  async findPoliciesForEntity(entityId: string, tenantId: string): Promise<FieldSecurityPolicy[]> {
    return Array.from(this.policies.values())
      .filter((p) => p.entityId === entityId && p.tenantId === tenantId && p.isActive)
      .sort((a, b) => a.priority - b.priority);
  }

  async findPolicyById(id: string): Promise<FieldSecurityPolicy | null> {
    return this.policies.get(id) ?? null;
  }

  async findPoliciesForField(
    entityId: string,
    fieldPath: string,
    tenantId: string
  ): Promise<FieldSecurityPolicy[]> {
    return Array.from(this.policies.values())
      .filter(
        (p) =>
          p.entityId === entityId &&
          p.fieldPath === fieldPath &&
          p.tenantId === tenantId &&
          p.isActive
      )
      .sort((a, b) => a.priority - b.priority);
  }

  async listPolicies(
    tenantId: string,
    options?: ListFieldSecurityPoliciesOptions
  ): Promise<FieldSecurityPolicy[]> {
    let results = Array.from(this.policies.values()).filter((p) => p.tenantId === tenantId);

    // Apply filters
    if (options?.entityId) {
      results = results.filter((p) => p.entityId === options.entityId);
    }
    if (options?.fieldPath) {
      results = results.filter((p) => p.fieldPath === options.fieldPath);
    }
    if (options?.policyType) {
      results = results.filter((p) => p.policyType === options.policyType);
    }
    if (options?.scope) {
      results = results.filter((p) => p.scope === options.scope);
    }
    if (options?.isActive !== undefined) {
      results = results.filter((p) => p.isActive === options.isActive);
    }

    // Sort by priority
    results.sort((a, b) => a.priority - b.priority);

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async createPolicy(
    input: CreateFieldSecurityPolicyInput,
    tenantId: string,
    createdBy?: string
  ): Promise<FieldSecurityPolicy> {
    const id = this.generateId();
    const now = new Date();

    const policy: FieldSecurityPolicy = {
      id,
      entityId: input.entityId,
      fieldPath: input.fieldPath,
      policyType: input.policyType,
      roleList: input.roleList,
      abacCondition: input.abacCondition,
      maskStrategy: input.maskStrategy,
      maskConfig: input.maskConfig,
      scope: input.scope ?? "entity",
      scopeRef: input.scopeRef,
      priority: input.priority ?? 100,
      isActive: true,
      tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy,
      version: 1,
    };

    this.policies.set(id, policy);
    return policy;
  }

  async updatePolicy(
    id: string,
    input: UpdateFieldSecurityPolicyInput,
    updatedBy?: string
  ): Promise<FieldSecurityPolicy> {
    const existing = this.policies.get(id);
    if (!existing) {
      throw new Error(`Policy not found: ${id}`);
    }

    const updated: FieldSecurityPolicy = {
      ...existing,
      roleList: input.roleList ?? existing.roleList,
      abacCondition: input.abacCondition ?? existing.abacCondition,
      maskStrategy: input.maskStrategy ?? existing.maskStrategy,
      maskConfig: input.maskConfig ?? existing.maskConfig,
      priority: input.priority ?? existing.priority,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date(),
      updatedBy,
      version: existing.version + 1,
    };

    this.policies.set(id, updated);
    return updated;
  }

  async deletePolicy(id: string): Promise<void> {
    this.policies.delete(id);
  }

  async logAccess(entry: FieldAccessAuditEntry): Promise<void> {
    this.accessLogs.push(entry);
  }

  async logAccessBatch(entries: FieldAccessAuditEntry[]): Promise<void> {
    this.accessLogs.push(...entries);
  }

  async getAccessLog(
    entityKey: string,
    tenantId: string,
    options?: GetAccessLogOptions
  ): Promise<FieldAccessAuditEntry[]> {
    let results = this.accessLogs.filter(
      (l) => l.entityKey === entityKey && l.tenantId === tenantId
    );

    // Apply filters
    if (options?.subjectId) {
      results = results.filter((l) => l.subjectId === options.subjectId);
    }
    if (options?.recordId) {
      results = results.filter((l) => l.recordId === options.recordId);
    }
    if (options?.action) {
      results = results.filter((l) => l.action === options.action);
    }
    if (options?.wasAllowed !== undefined) {
      results = results.filter((l) => l.wasAllowed === options.wasAllowed);
    }

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }
}

// ============================================================================
// Database Repository (for production)
// ============================================================================

/**
 * Database implementation of the field security repository.
 * Uses Kysely for type-safe SQL queries.
 */
export class DatabaseFieldSecurityRepository implements IFieldSecurityRepository {
  constructor(private db: Kysely<DB>) {}

  async findPoliciesForEntity(entityId: string, tenantId: string): Promise<FieldSecurityPolicy[]> {
    const results = await this.db
      .selectFrom("meta.field_security_policy" as any)
      .selectAll()
      .where("entity_id", "=", entityId)
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    return results.map(this.mapToPolicy);
  }

  async findPolicyById(id: string): Promise<FieldSecurityPolicy | null> {
    const result = await this.db
      .selectFrom("meta.field_security_policy" as any)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return result ? this.mapToPolicy(result) : null;
  }

  async findPoliciesForField(
    entityId: string,
    fieldPath: string,
    tenantId: string
  ): Promise<FieldSecurityPolicy[]> {
    const results = await this.db
      .selectFrom("meta.field_security_policy" as any)
      .selectAll()
      .where("entity_id", "=", entityId)
      .where("field_path", "=", fieldPath)
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    return results.map(this.mapToPolicy);
  }

  async listPolicies(
    tenantId: string,
    options?: ListFieldSecurityPoliciesOptions
  ): Promise<FieldSecurityPolicy[]> {
    let query = this.db
      .selectFrom("meta.field_security_policy" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.entityId) {
      query = query.where("entity_id", "=", options.entityId);
    }
    if (options?.fieldPath) {
      query = query.where("field_path", "=", options.fieldPath);
    }
    if (options?.policyType) {
      query = query.where("policy_type", "=", options.policyType);
    }
    if (options?.scope) {
      query = query.where("scope", "=", options.scope);
    }
    if (options?.isActive !== undefined) {
      query = query.where("is_active", "=", options.isActive);
    }

    query = query.orderBy("priority", "asc");

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query.execute();
    return results.map(this.mapToPolicy);
  }

  async createPolicy(
    input: CreateFieldSecurityPolicyInput,
    tenantId: string,
    createdBy?: string
  ): Promise<FieldSecurityPolicy> {
    const result = await this.db
      .insertInto("meta.field_security_policy" as any)
      .values({
        entity_id: input.entityId,
        field_path: input.fieldPath,
        policy_type: input.policyType,
        role_list: input.roleList,
        abac_condition: input.abacCondition ? JSON.stringify(input.abacCondition) : null,
        mask_strategy: input.maskStrategy,
        mask_config: input.maskConfig ? JSON.stringify(input.maskConfig) : null,
        scope: input.scope ?? "entity",
        scope_ref: input.scopeRef,
        priority: input.priority ?? 100,
        is_active: true,
        tenant_id: tenantId,
        created_by: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToPolicy(result);
  }

  async updatePolicy(
    id: string,
    input: UpdateFieldSecurityPolicyInput,
    updatedBy?: string
  ): Promise<FieldSecurityPolicy> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: updatedBy,
    };

    if (input.roleList !== undefined) {
      updateData.role_list = input.roleList;
    }
    if (input.abacCondition !== undefined) {
      updateData.abac_condition = input.abacCondition ? JSON.stringify(input.abacCondition) : null;
    }
    if (input.maskStrategy !== undefined) {
      updateData.mask_strategy = input.maskStrategy;
    }
    if (input.maskConfig !== undefined) {
      updateData.mask_config = input.maskConfig ? JSON.stringify(input.maskConfig) : null;
    }
    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }
    if (input.isActive !== undefined) {
      updateData.is_active = input.isActive;
    }

    const result = await this.db
      .updateTable("meta.field_security_policy" as any)
      .set(updateData)
      .set((eb: any) => ({ version: eb("version", "+", 1) }))
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error(`Policy not found: ${id}`);
    }

    return this.mapToPolicy(result);
  }

  async deletePolicy(id: string): Promise<void> {
    await this.db
      .deleteFrom("meta.field_security_policy" as any)
      .where("id", "=", id)
      .execute();
  }

  async logAccess(entry: FieldAccessAuditEntry): Promise<void> {
    await this.db
      .insertInto("audit.field_access_log" as any)
      .values({
        entity_key: entry.entityKey,
        record_id: entry.recordId,
        subject_id: entry.subjectId,
        subject_type: entry.subjectType,
        action: entry.action,
        field_path: entry.fieldPath,
        was_allowed: entry.wasAllowed,
        mask_applied: entry.maskApplied,
        policy_id: entry.policyId,
        request_id: entry.requestId,
        trace_id: entry.traceId,
        tenant_id: entry.tenantId,
      })
      .execute();
  }

  async logAccessBatch(entries: FieldAccessAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.db
      .insertInto("audit.field_access_log" as any)
      .values(
        entries.map((entry) => ({
          entity_key: entry.entityKey,
          record_id: entry.recordId,
          subject_id: entry.subjectId,
          subject_type: entry.subjectType,
          action: entry.action,
          field_path: entry.fieldPath,
          was_allowed: entry.wasAllowed,
          mask_applied: entry.maskApplied,
          policy_id: entry.policyId,
          request_id: entry.requestId,
          trace_id: entry.traceId,
          tenant_id: entry.tenantId,
        }))
      )
      .execute();
  }

  async getAccessLog(
    entityKey: string,
    tenantId: string,
    options?: GetAccessLogOptions
  ): Promise<FieldAccessAuditEntry[]> {
    let query = this.db
      .selectFrom("audit.field_access_log" as any)
      .selectAll()
      .where("entity_key", "=", entityKey)
      .where("tenant_id", "=", tenantId);

    if (options?.subjectId) {
      query = query.where("subject_id", "=", options.subjectId);
    }
    if (options?.recordId) {
      query = query.where("record_id", "=", options.recordId);
    }
    if (options?.action) {
      query = query.where("action", "=", options.action);
    }
    if (options?.wasAllowed !== undefined) {
      query = query.where("was_allowed", "=", options.wasAllowed);
    }
    if (options?.since) {
      query = query.where("created_at", ">=", options.since);
    }
    if (options?.until) {
      query = query.where("created_at", "<=", options.until);
    }

    query = query.orderBy("created_at", "desc");

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query.execute();
    return results.map(this.mapToAuditEntry);
  }

  // ============================================================================
  // Mapping Helpers
  // ============================================================================

  private mapToPolicy(row: any): FieldSecurityPolicy {
    return {
      id: row.id,
      entityId: row.entity_id,
      fieldPath: row.field_path,
      policyType: row.policy_type,
      roleList: row.role_list ?? undefined,
      abacCondition: row.abac_condition
        ? typeof row.abac_condition === "string"
          ? JSON.parse(row.abac_condition)
          : row.abac_condition
        : undefined,
      maskStrategy: row.mask_strategy ?? undefined,
      maskConfig: row.mask_config
        ? typeof row.mask_config === "string"
          ? JSON.parse(row.mask_config)
          : row.mask_config
        : undefined,
      scope: row.scope,
      scopeRef: row.scope_ref ?? undefined,
      priority: row.priority,
      isActive: row.is_active,
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by ?? undefined,
      updatedBy: row.updated_by ?? undefined,
      version: row.version,
    };
  }

  private mapToAuditEntry(row: any): FieldAccessAuditEntry {
    return {
      entityKey: row.entity_key,
      recordId: row.record_id ?? undefined,
      subjectId: row.subject_id,
      subjectType: row.subject_type,
      action: row.action,
      fieldPath: row.field_path,
      wasAllowed: row.was_allowed,
      maskApplied: row.mask_applied ?? undefined,
      policyId: row.policy_id ?? undefined,
      requestId: row.request_id ?? undefined,
      traceId: row.trace_id ?? undefined,
      tenantId: row.tenant_id,
    };
  }
}
