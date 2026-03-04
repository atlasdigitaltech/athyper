/**
 * Approval Instance Repository
 *
 * Storage implementations for approval instances at runtime.
 * Provides both in-memory (for testing) and database (for production) implementations.
 */

import type {
  ApprovalActionRecord,
  ApprovalInstance,
  ApprovalInstanceQueryOptions,
  ApprovalInstanceStatus,
  ApprovalStepInstance,
  EntityLock,
  EntityStateTransition,
  IApprovalInstanceRepository,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// In-Memory Repository (for testing/development)
// ============================================================================

/**
 * In-memory implementation of the approval instance repository
 */
export class InMemoryApprovalInstanceRepository implements IApprovalInstanceRepository {
  private instances: Map<string, ApprovalInstance> = new Map();
  private stepInstances: Map<string, ApprovalStepInstance> = new Map();
  private actionRecords: Map<string, ApprovalActionRecord> = new Map();
  private entityLocks: Map<string, EntityLock> = new Map();
  private stateTransitions: Map<string, EntityStateTransition> = new Map();
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter++;
    return `${prefix}-${Date.now()}-${this.idCounter}`;
  }

  private makeKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private makeLockKey(tenantId: string, entityType: string, entityId: string): string {
    return `${tenantId}:${entityType}:${entityId}`;
  }

  // Instance CRUD
  async getById(tenantId: string, instanceId: string): Promise<ApprovalInstance | undefined> {
    return this.instances.get(this.makeKey(tenantId, instanceId));
  }

  async getByEntityId(tenantId: string, entityType: string, entityId: string): Promise<ApprovalInstance[]> {
    return Array.from(this.instances.values()).filter(
      (i) => i.tenantId === tenantId && i.entity.type === entityType && i.entity.id === entityId
    );
  }

  async list(tenantId: string, options?: ApprovalInstanceQueryOptions): Promise<ApprovalInstance[]> {
    let results = Array.from(this.instances.values()).filter((i) => i.tenantId === tenantId);

    // Apply filters
    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((i) => statuses.includes(i.status));
    }

    if (options?.entityType) {
      results = results.filter((i) => i.entity.type === options.entityType);
    }

    if (options?.entityId) {
      results = results.filter((i) => i.entity.id === options.entityId);
    }

    if (options?.requesterId) {
      results = results.filter((i) => i.requester.userId === options.requesterId);
    }

    if (options?.templateCode) {
      results = results.filter((i) => i.workflowSnapshot.templateCode === options.templateCode);
    }

    if (options?.createdAfter) {
      results = results.filter((i) => i.createdAt >= options.createdAfter!);
    }

    if (options?.createdBefore) {
      results = results.filter((i) => i.createdAt <= options.createdBefore!);
    }

    if (options?.tags && options.tags.length > 0) {
      results = results.filter((i) => i.tags?.some((t) => options.tags!.includes(t)));
    }

    if (!options?.includeCompleted) {
      const completedStatuses: ApprovalInstanceStatus[] = ["approved", "rejected", "cancelled", "expired", "withdrawn"];
      results = results.filter((i) => !completedStatuses.includes(i.status));
    }

    // Filter by pending approver
    if (options?.pendingApproverId) {
      const userId = options.pendingApproverId;
      results = results.filter((instance) => {
        // Get step instances for this instance
        const steps = Array.from(this.stepInstances.values()).filter(
          (s) => s.instanceId === instance.id && s.status === "active"
        );
        // Check if user is a pending approver
        return steps.some((step) =>
          step.approvers.some((a) => a.userId === userId && a.status === "pending")
        );
      });
    }

    // Sort
    const sortBy = options?.sortBy || "createdAt";
    const sortDir = options?.sortDirection === "asc" ? 1 : -1;
    results.sort((a, b) => {
      const aVal = a[sortBy as keyof ApprovalInstance];
      const bVal = b[sortBy as keyof ApprovalInstance];
      if (aVal === bVal) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      if (aVal < bVal) return -1 * sortDir;
      return 1 * sortDir;
    });

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async create(
    tenantId: string,
    instance: Omit<ApprovalInstance, "id" | "createdAt">
  ): Promise<ApprovalInstance> {
    const id = this.generateId("api");
    const now = new Date();

    const created: ApprovalInstance = {
      ...instance,
      id,
      createdAt: now,
      version: 1, // Initialize version
    };

    this.instances.set(this.makeKey(tenantId, id), created);
    return created;
  }

  async update(
    tenantId: string,
    instanceId: string,
    updates: Partial<ApprovalInstance>
  ): Promise<ApprovalInstance> {
    const key = this.makeKey(tenantId, instanceId);
    const existing = this.instances.get(key);

    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const updated: ApprovalInstance = {
      ...existing,
      ...updates,
      id: instanceId, // Cannot change ID
      tenantId, // Cannot change tenant
      createdAt: existing.createdAt, // Cannot change creation time
      version: (existing.version || 0) + 1, // Increment version
      updatedAt: new Date(),
    };

    this.instances.set(key, updated);
    return updated;
  }

  async delete(tenantId: string, instanceId: string): Promise<void> {
    this.instances.delete(this.makeKey(tenantId, instanceId));

    // Also delete related step instances and actions
    for (const [key, step] of this.stepInstances) {
      if (step.instanceId === instanceId) {
        this.stepInstances.delete(key);
      }
    }
    for (const [key, action] of this.actionRecords) {
      if (action.instanceId === instanceId) {
        this.actionRecords.delete(key);
      }
    }
  }

  // Step instance operations
  async getStepInstances(tenantId: string, instanceId: string): Promise<ApprovalStepInstance[]> {
    return Array.from(this.stepInstances.values())
      .filter((s) => s.instanceId === instanceId)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.order - b.order;
      });
  }

  async getStepInstance(tenantId: string, stepInstanceId: string): Promise<ApprovalStepInstance | undefined> {
    return this.stepInstances.get(this.makeKey(tenantId, stepInstanceId));
  }

  async createStepInstances(
    tenantId: string,
    steps: Omit<ApprovalStepInstance, "id">[]
  ): Promise<ApprovalStepInstance[]> {
    const created: ApprovalStepInstance[] = [];

    for (const step of steps) {
      const id = this.generateId("asi");
      const stepInstance: ApprovalStepInstance = {
        ...step,
        id,
      };
      this.stepInstances.set(this.makeKey(tenantId, id), stepInstance);
      created.push(stepInstance);
    }

    return created;
  }

  async updateStepInstance(
    tenantId: string,
    stepInstanceId: string,
    updates: Partial<ApprovalStepInstance>
  ): Promise<ApprovalStepInstance> {
    const key = this.makeKey(tenantId, stepInstanceId);
    const existing = this.stepInstances.get(key);

    if (!existing) {
      throw new Error(`Step instance not found: ${stepInstanceId}`);
    }

    const updated: ApprovalStepInstance = {
      ...existing,
      ...updates,
      id: stepInstanceId, // Cannot change ID
    };

    this.stepInstances.set(key, updated);
    return updated;
  }

  // Action records
  async recordAction(
    tenantId: string,
    action: Omit<ApprovalActionRecord, "id">
  ): Promise<ApprovalActionRecord> {
    const id = this.generateId("aar");
    const record: ApprovalActionRecord = {
      ...action,
      id,
    };
    this.actionRecords.set(this.makeKey(tenantId, id), record);
    return record;
  }

  async getActionHistory(tenantId: string, instanceId: string): Promise<ApprovalActionRecord[]> {
    return Array.from(this.actionRecords.values())
      .filter((a) => a.instanceId === instanceId)
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
  }

  // Entity locks
  async acquireLock(tenantId: string, lock: Omit<EntityLock, "id">): Promise<EntityLock> {
    const key = this.makeLockKey(tenantId, lock.entityType, lock.entityId);

    // Check for existing lock
    const existing = this.entityLocks.get(key);
    if (existing) {
      throw new Error(`Entity already locked: ${lock.entityType}/${lock.entityId}`);
    }

    const id = this.generateId("elk");
    const created: EntityLock = {
      ...lock,
      id,
    };

    this.entityLocks.set(key, created);
    return created;
  }

  async releaseLock(tenantId: string, entityType: string, entityId: string): Promise<void> {
    const key = this.makeLockKey(tenantId, entityType, entityId);
    this.entityLocks.delete(key);
  }

  async getLock(tenantId: string, entityType: string, entityId: string): Promise<EntityLock | undefined> {
    return this.entityLocks.get(this.makeLockKey(tenantId, entityType, entityId));
  }

  // State transitions
  async recordStateTransition(
    tenantId: string,
    transition: Omit<EntityStateTransition, "id">
  ): Promise<EntityStateTransition> {
    const id = this.generateId("est");
    const record: EntityStateTransition = {
      ...transition,
      id,
    };
    this.stateTransitions.set(this.makeKey(tenantId, id), record);
    return record;
  }

  async getStateTransitions(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<EntityStateTransition[]> {
    return Array.from(this.stateTransitions.values())
      .filter(
        (t) => t.tenantId === tenantId && t.entityType === entityType && t.entityId === entityId
      )
      .sort((a, b) => a.transitionedAt.getTime() - b.transitionedAt.getTime());
  }

  // Dashboard queries
  async countByStatus(tenantId: string): Promise<Record<ApprovalInstanceStatus, number>> {
    const counts: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      expired: 0,
      withdrawn: 0,
      on_hold: 0,
    };

    for (const instance of this.instances.values()) {
      if (instance.tenantId === tenantId) {
        counts[instance.status] = (counts[instance.status] || 0) + 1;
      }
    }

    return counts as Record<ApprovalInstanceStatus, number>;
  }

  async getPendingForUser(tenantId: string, userId: string): Promise<ApprovalInstance[]> {
    return this.list(tenantId, { pendingApproverId: userId });
  }

  // Optimistic locking support
  private instanceLocks: Map<string, { lockToken: string; lockOwner: string; expiresAt: Date }> = new Map();

  async updateWithLock(
    tenantId: string,
    instanceId: string,
    updates: Partial<ApprovalInstance>,
    expectedVersion: number
  ): Promise<ApprovalInstance> {
    const key = this.makeKey(tenantId, instanceId);
    const existing = this.instances.get(key);

    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    if (existing.version !== expectedVersion) {
      // Import ConcurrencyError dynamically to avoid circular dependency
      const { ConcurrencyError } = await import("./types.js");
      throw new ConcurrencyError(instanceId, expectedVersion, existing.version);
    }

    return this.update(tenantId, instanceId, updates);
  }

  async acquireInstanceLock(
    tenantId: string,
    instanceId: string,
    lockOwner: string,
    timeoutMs: number = 5000
  ): Promise<{ lockToken: string; expiresAt: Date } | null> {
    const key = this.makeKey(tenantId, instanceId);
    const existing = this.instanceLocks.get(key);
    const now = new Date();

    // Check if existing lock is still valid
    if (existing && existing.expiresAt > now) {
      // Lock is held by someone else
      return null;
    }

    // Create new lock
    const lockToken = this.generateId("lock");
    const expiresAt = new Date(now.getTime() + timeoutMs);
    this.instanceLocks.set(key, { lockToken, lockOwner, expiresAt });

    return { lockToken, expiresAt };
  }

  async releaseInstanceLock(
    tenantId: string,
    instanceId: string,
    lockToken: string
  ): Promise<boolean> {
    const key = this.makeKey(tenantId, instanceId);
    const existing = this.instanceLocks.get(key);

    if (!existing || existing.lockToken !== lockToken) {
      return false;
    }

    this.instanceLocks.delete(key);
    return true;
  }

  // Utility methods for testing
  clear(): void {
    this.instances.clear();
    this.stepInstances.clear();
    this.actionRecords.clear();
    this.entityLocks.clear();
    this.stateTransitions.clear();
    this.instanceLocks.clear();
    this.idCounter = 0;
  }

  count(): number {
    return this.instances.size;
  }
}

// ============================================================================
// Database Repository (for production)
// ============================================================================

/**
 * Database-backed implementation of the approval instance repository
 */
export class DatabaseApprovalInstanceRepository implements IApprovalInstanceRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(tenantId: string, instanceId: string): Promise<ApprovalInstance | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_instance" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", instanceId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToInstance(result);
  }

  async getByEntityId(tenantId: string, entityType: string, entityId: string): Promise<ApprovalInstance[]> {
    const results = await this.db
      .selectFrom("meta.approval_instance" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .orderBy("created_at", "desc")
      .execute();

    return results.map((r: any) => this.mapRowToInstance(r));
  }

  async list(tenantId: string, options?: ApprovalInstanceQueryOptions): Promise<ApprovalInstance[]> {
    let query = this.db
      .selectFrom("meta.approval_instance" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query = query.where("status", "in", statuses);
    }

    if (options?.entityType) {
      query = query.where("entity_type", "=", options.entityType);
    }

    if (options?.entityId) {
      query = query.where("entity_id", "=", options.entityId);
    }

    if (options?.requesterId) {
      query = query.where("requester_user_id", "=", options.requesterId);
    }

    if (options?.templateCode) {
      query = query.where("template_code", "=", options.templateCode);
    }

    if (options?.createdAfter) {
      query = query.where("created_at", ">=", options.createdAfter);
    }

    if (options?.createdBefore) {
      query = query.where("created_at", "<=", options.createdBefore);
    }

    if (!options?.includeCompleted) {
      const completedStatuses = ["approved", "rejected", "cancelled", "expired", "withdrawn"];
      query = query.where("status", "not in", completedStatuses);
    }

    // Sorting
    const sortField = this.mapSortField(options?.sortBy || "createdAt");
    const sortDir = options?.sortDirection === "asc" ? "asc" : "desc";
    query = query.orderBy(sortField, sortDir);

    // Pagination
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    query = query.limit(limit).offset(offset);

    const results = await query.execute();
    return results.map((r: any) => this.mapRowToInstance(r));
  }

  async create(
    tenantId: string,
    instance: Omit<ApprovalInstance, "id" | "createdAt">
  ): Promise<ApprovalInstance> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("meta.approval_instance" as any)
      .values({
        id,
        tenant_id: tenantId,
        org_id: instance.orgId,
        entity_type: instance.entity.type,
        entity_id: instance.entity.id,
        entity_version: instance.entity.version,
        entity_reference_code: instance.entity.referenceCode,
        entity_display_name: instance.entity.displayName,
        template_id: instance.workflowSnapshot.templateId,
        template_code: instance.workflowSnapshot.templateCode,
        template_version: instance.workflowSnapshot.templateVersion,
        template_name: instance.workflowSnapshot.templateName,
        workflow_snapshot: JSON.stringify(instance.workflowSnapshot.definition),
        status: instance.status,
        entity_state: instance.entityState,
        lock_mode: instance.lockMode,
        is_locked: instance.isLocked,
        requester: JSON.stringify(instance.requester),
        trigger: JSON.stringify(instance.trigger),
        active_step_ids: JSON.stringify(instance.activeStepIds),
        completed_step_ids: JSON.stringify(instance.completedStepIds),
        skipped_step_ids: JSON.stringify(instance.skippedStepIds),
        sla: instance.sla ? JSON.stringify(instance.sla) : null,
        decision: instance.decision ? JSON.stringify(instance.decision) : null,
        priority: instance.priority,
        tags: instance.tags ? JSON.stringify(instance.tags) : null,
        metadata: instance.metadata ? JSON.stringify(instance.metadata) : null,
        created_at: now,
        created_by: instance.createdBy,
      })
      .execute();

    return {
      ...instance,
      id,
      createdAt: now,
    };
  }

  async update(
    tenantId: string,
    instanceId: string,
    updates: Partial<ApprovalInstance>
  ): Promise<ApprovalInstance> {
    const now = new Date();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.entityState !== undefined) updateData.entity_state = updates.entityState;
    if (updates.lockMode !== undefined) updateData.lock_mode = updates.lockMode;
    if (updates.isLocked !== undefined) updateData.is_locked = updates.isLocked;
    if (updates.activeStepIds !== undefined) updateData.active_step_ids = JSON.stringify(updates.activeStepIds);
    if (updates.completedStepIds !== undefined) updateData.completed_step_ids = JSON.stringify(updates.completedStepIds);
    if (updates.skippedStepIds !== undefined) updateData.skipped_step_ids = JSON.stringify(updates.skippedStepIds);
    if (updates.sla !== undefined) updateData.sla = JSON.stringify(updates.sla);
    if (updates.decision !== undefined) updateData.decision = JSON.stringify(updates.decision);
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;
    if (updates.updatedBy !== undefined) updateData.updated_by = updates.updatedBy;

    await this.db
      .updateTable("meta.approval_instance" as any)
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", instanceId)
      .execute();

    const result = await this.getById(tenantId, instanceId);
    if (!result) {
      throw new Error(`Instance not found after update: ${instanceId}`);
    }
    return result;
  }

  async delete(tenantId: string, instanceId: string): Promise<void> {
    // Delete step instances first
    await this.db
      .deleteFrom("meta.approval_step_instance" as any)
      .where("instance_id", "=", instanceId)
      .execute();

    // Delete action records
    await this.db
      .deleteFrom("meta.approval_action_record" as any)
      .where("instance_id", "=", instanceId)
      .execute();

    // Delete the instance
    await this.db
      .deleteFrom("meta.approval_instance" as any)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", instanceId)
      .execute();
  }

  // Step instance operations
  async getStepInstances(tenantId: string, instanceId: string): Promise<ApprovalStepInstance[]> {
    const results = await this.db
      .selectFrom("meta.approval_step_instance" as any)
      .selectAll()
      .where("instance_id", "=", instanceId)
      .orderBy("level", "asc")
      .orderBy("order_num", "asc")
      .execute();

    return results.map((r: any) => this.mapRowToStepInstance(r));
  }

  async getStepInstance(tenantId: string, stepInstanceId: string): Promise<ApprovalStepInstance | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_step_instance" as any)
      .selectAll()
      .where("id", "=", stepInstanceId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToStepInstance(result);
  }

  async createStepInstances(
    tenantId: string,
    steps: Omit<ApprovalStepInstance, "id">[]
  ): Promise<ApprovalStepInstance[]> {
    const created: ApprovalStepInstance[] = [];

    for (const step of steps) {
      const id = crypto.randomUUID();

      await this.db
        .insertInto("meta.approval_step_instance" as any)
        .values({
          id,
          instance_id: step.instanceId,
          step_definition_id: step.stepDefinitionId,
          name: step.name,
          level: step.level,
          order_num: step.order,
          step_type: step.type,
          requirement: step.requirement,
          quorum: step.quorum ? JSON.stringify(step.quorum) : null,
          status: step.status,
          approvers: JSON.stringify(step.approvers),
          depends_on: JSON.stringify(step.dependsOn),
          dependencies_satisfied: step.dependenciesSatisfied,
          conditions: step.conditions ? JSON.stringify(step.conditions) : null,
          conditions_met: step.conditionsMet,
          skip_reason: step.skipReason,
          auto_approved: step.autoApproved,
          auto_approve_reason: step.autoApproveReason,
          sla: step.sla ? JSON.stringify(step.sla) : null,
          approval_counts: JSON.stringify(step.approvalCounts),
          activated_at: step.activatedAt,
          completed_at: step.completedAt,
        })
        .execute();

      created.push({ ...step, id });
    }

    return created;
  }

  async updateStepInstance(
    tenantId: string,
    stepInstanceId: string,
    updates: Partial<ApprovalStepInstance>
  ): Promise<ApprovalStepInstance> {
    const updateData: Record<string, unknown> = {};

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.approvers !== undefined) updateData.approvers = JSON.stringify(updates.approvers);
    if (updates.dependenciesSatisfied !== undefined) updateData.dependencies_satisfied = updates.dependenciesSatisfied;
    if (updates.conditionsMet !== undefined) updateData.conditions_met = updates.conditionsMet;
    if (updates.skipReason !== undefined) updateData.skip_reason = updates.skipReason;
    if (updates.autoApproved !== undefined) updateData.auto_approved = updates.autoApproved;
    if (updates.autoApproveReason !== undefined) updateData.auto_approve_reason = updates.autoApproveReason;
    if (updates.sla !== undefined) updateData.sla = JSON.stringify(updates.sla);
    if (updates.approvalCounts !== undefined) updateData.approval_counts = JSON.stringify(updates.approvalCounts);
    if (updates.activatedAt !== undefined) updateData.activated_at = updates.activatedAt;
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;

    await this.db
      .updateTable("meta.approval_step_instance" as any)
      .set(updateData)
      .where("id", "=", stepInstanceId)
      .execute();

    const result = await this.getStepInstance(tenantId, stepInstanceId);
    if (!result) {
      throw new Error(`Step instance not found after update: ${stepInstanceId}`);
    }
    return result;
  }

  // Action records
  async recordAction(
    tenantId: string,
    action: Omit<ApprovalActionRecord, "id">
  ): Promise<ApprovalActionRecord> {
    const id = crypto.randomUUID();

    await this.db
      .insertInto("meta.approval_action_record" as any)
      .values({
        id,
        instance_id: action.instanceId,
        step_instance_id: action.stepInstanceId,
        assignment_id: action.assignmentId,
        user_id: action.userId,
        user_display_name: action.userDisplayName,
        action: action.action,
        comment: action.comment,
        additional_fields: action.additionalFields ? JSON.stringify(action.additionalFields) : null,
        delegation_target: action.delegationTarget ? JSON.stringify(action.delegationTarget) : null,
        performed_at: action.performedAt,
        ip_address: action.ipAddress,
        user_agent: action.userAgent,
      })
      .execute();

    return { ...action, id };
  }

  async getActionHistory(tenantId: string, instanceId: string): Promise<ApprovalActionRecord[]> {
    const results = await this.db
      .selectFrom("meta.approval_action_record" as any)
      .selectAll()
      .where("instance_id", "=", instanceId)
      .orderBy("performed_at", "asc")
      .execute();

    return results.map((r: any) => this.mapRowToActionRecord(r));
  }

  // Entity locks
  async acquireLock(tenantId: string, lock: Omit<EntityLock, "id">): Promise<EntityLock> {
    // Check for existing lock
    const existing = await this.getLock(tenantId, lock.entityType, lock.entityId);
    if (existing) {
      throw new Error(`Entity already locked: ${lock.entityType}/${lock.entityId}`);
    }

    const id = crypto.randomUUID();

    await this.db
      .insertInto("meta.entity_lock" as any)
      .values({
        id,
        entity_type: lock.entityType,
        entity_id: lock.entityId,
        tenant_id: tenantId,
        approval_instance_id: lock.approvalInstanceId,
        mode: lock.mode,
        locked_at: lock.lockedAt,
        expires_at: lock.expiresAt,
        locked_by: lock.lockedBy,
      })
      .execute();

    return { ...lock, id };
  }

  async releaseLock(tenantId: string, entityType: string, entityId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.entity_lock" as any)
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .execute();
  }

  async getLock(tenantId: string, entityType: string, entityId: string): Promise<EntityLock | undefined> {
    const result = await this.db
      .selectFrom("meta.entity_lock" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToEntityLock(result);
  }

  // State transitions
  async recordStateTransition(
    tenantId: string,
    transition: Omit<EntityStateTransition, "id">
  ): Promise<EntityStateTransition> {
    const id = crypto.randomUUID();

    await this.db
      .insertInto("meta.entity_state_transition" as any)
      .values({
        id,
        entity_type: transition.entityType,
        entity_id: transition.entityId,
        tenant_id: tenantId,
        approval_instance_id: transition.approvalInstanceId,
        from_state: transition.fromState,
        to_state: transition.toState,
        reason: transition.reason,
        transitioned_at: transition.transitionedAt,
        transitioned_by: transition.transitionedBy,
      })
      .execute();

    return { ...transition, id };
  }

  async getStateTransitions(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<EntityStateTransition[]> {
    const results = await this.db
      .selectFrom("meta.entity_state_transition" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .orderBy("transitioned_at", "asc")
      .execute();

    return results.map((r: any) => this.mapRowToStateTransition(r));
  }

  // Dashboard queries
  async countByStatus(tenantId: string): Promise<Record<ApprovalInstanceStatus, number>> {
    const results = await this.db
      .selectFrom("meta.approval_instance" as any)
      .select(["status"])
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .groupBy("status")
      .execute();

    const counts: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      expired: 0,
      withdrawn: 0,
      on_hold: 0,
    };

    for (const row of results as any[]) {
      counts[row.status] = Number(row.count);
    }

    return counts as Record<ApprovalInstanceStatus, number>;
  }

  async getPendingForUser(tenantId: string, userId: string): Promise<ApprovalInstance[]> {
    // This is a more complex query that joins with step instances
    // For now, use a simpler approach
    const instances = await this.list(tenantId, { includeCompleted: false });

    const pending: ApprovalInstance[] = [];
    for (const instance of instances) {
      const steps = await this.getStepInstances(tenantId, instance.id);
      const hasPending = steps.some(
        (step) =>
          step.status === "active" &&
          step.approvers.some((a) => a.userId === userId && a.status === "pending")
      );
      if (hasPending) {
        pending.push(instance);
      }
    }

    return pending;
  }

  // Mapping functions
  private mapRowToInstance(row: any): ApprovalInstance {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orgId: row.org_id,
      entity: {
        type: row.entity_type,
        id: row.entity_id,
        version: row.entity_version,
        referenceCode: row.entity_reference_code,
        displayName: row.entity_display_name,
      },
      workflowSnapshot: {
        templateId: row.template_id,
        templateCode: row.template_code,
        templateVersion: row.template_version,
        templateName: row.template_name,
        definition: this.parseJson(row.workflow_snapshot),
      },
      status: row.status,
      entityState: row.entity_state,
      lockMode: row.lock_mode,
      isLocked: row.is_locked,
      requester: this.parseJson(row.requester),
      trigger: this.parseJson(row.trigger),
      activeStepIds: this.parseJson(row.active_step_ids) || [],
      completedStepIds: this.parseJson(row.completed_step_ids) || [],
      skippedStepIds: this.parseJson(row.skipped_step_ids) || [],
      sla: this.parseJson(row.sla),
      decision: this.parseJson(row.decision),
      priority: row.priority,
      tags: this.parseJson(row.tags),
      metadata: this.parseJson(row.metadata),
      version: row.version || 1,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      updatedBy: row.updated_by,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapRowToStepInstance(row: any): ApprovalStepInstance {
    return {
      id: row.id,
      instanceId: row.instance_id,
      stepDefinitionId: row.step_definition_id,
      name: row.name,
      level: row.level,
      order: row.order_num,
      type: row.step_type,
      requirement: row.requirement,
      quorum: this.parseJson(row.quorum),
      status: row.status,
      approvers: this.parseJson(row.approvers) || [],
      dependsOn: this.parseJson(row.depends_on) || [],
      dependenciesSatisfied: row.dependencies_satisfied,
      conditions: this.parseJson(row.conditions),
      conditionsMet: row.conditions_met,
      skipReason: row.skip_reason,
      autoApproved: row.auto_approved,
      autoApproveReason: row.auto_approve_reason,
      sla: this.parseJson(row.sla),
      approvalCounts: this.parseJson(row.approval_counts) || {
        total: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        delegated: 0,
      },
      activatedAt: row.activated_at ? new Date(row.activated_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapRowToActionRecord(row: any): ApprovalActionRecord {
    return {
      id: row.id,
      instanceId: row.instance_id,
      stepInstanceId: row.step_instance_id,
      assignmentId: row.assignment_id,
      userId: row.user_id,
      userDisplayName: row.user_display_name,
      action: row.action,
      comment: row.comment,
      additionalFields: this.parseJson(row.additional_fields),
      delegationTarget: this.parseJson(row.delegation_target),
      performedAt: new Date(row.performed_at),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }

  private mapRowToEntityLock(row: any): EntityLock {
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      approvalInstanceId: row.approval_instance_id,
      mode: row.mode,
      lockedAt: new Date(row.locked_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      lockedBy: row.locked_by,
    };
  }

  private mapRowToStateTransition(row: any): EntityStateTransition {
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      tenantId: row.tenant_id,
      approvalInstanceId: row.approval_instance_id,
      fromState: row.from_state,
      toState: row.to_state,
      reason: row.reason,
      transitionedAt: new Date(row.transitioned_at),
      transitionedBy: row.transitioned_by,
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
      createdAt: "created_at",
      updatedAt: "updated_at",
      priority: "priority",
      status: "status",
    };
    return fieldMap[field] || "created_at";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create in-memory approval instance repository
 */
export function createInMemoryApprovalInstanceRepository(): InMemoryApprovalInstanceRepository {
  return new InMemoryApprovalInstanceRepository();
}

/**
 * Create database approval instance repository
 */
export function createDatabaseApprovalInstanceRepository(db: Kysely<DB>): DatabaseApprovalInstanceRepository {
  return new DatabaseApprovalInstanceRepository(db);
}
