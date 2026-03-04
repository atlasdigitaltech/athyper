/**
 * Approval Task Repository
 *
 * Storage implementations for approval tasks.
 */

import type {
  ApprovalTask,
  ApprovalTaskStatus,
  IApprovalTaskRepository,
  InboxFilterOptions,
  InboxSummary,
  TaskPriority,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// In-Memory Repository (for testing/development)
// ============================================================================

export class InMemoryApprovalTaskRepository implements IApprovalTaskRepository {
  private tasks: Map<string, ApprovalTask> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter++;
    return `task-${Date.now()}-${this.idCounter}`;
  }

  private makeKey(tenantId: string, taskId: string): string {
    return `${tenantId}:${taskId}`;
  }

  async getById(tenantId: string, taskId: string): Promise<ApprovalTask | undefined> {
    return this.tasks.get(this.makeKey(tenantId, taskId));
  }

  async getByAssignmentId(tenantId: string, assignmentId: string): Promise<ApprovalTask | undefined> {
    return Array.from(this.tasks.values()).find(
      (t) => t.tenantId === tenantId && t.assignmentId === assignmentId
    );
  }

  async list(tenantId: string, assigneeId: string, options?: InboxFilterOptions): Promise<ApprovalTask[]> {
    let results = Array.from(this.tasks.values()).filter(
      (t) => t.tenantId === tenantId && t.assigneeId === assigneeId
    );

    // Apply filters
    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((t) => statuses.includes(t.status));
    }

    if (options?.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      results = results.filter((t) => priorities.includes(t.priority));
    }

    if (options?.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      results = results.filter((t) => types.includes(t.type));
    }

    if (options?.entityType) {
      results = results.filter((t) => t.entity.type === options.entityType);
    }

    if (options?.templateCode) {
      results = results.filter((t) => t.workflow.templateCode === options.templateCode);
    }

    if (options?.requesterId) {
      results = results.filter((t) => t.requester.userId === options.requesterId);
    }

    if (options?.overdueOnly) {
      results = results.filter((t) => t.sla.isOverdue);
    }

    if (options?.slaStatus) {
      results = results.filter((t) => t.sla.slaStatus === options.slaStatus);
    }

    if (options?.unreadOnly) {
      results = results.filter((t) => !t.isRead);
    }

    if (options?.createdAfter) {
      results = results.filter((t) => t.createdAt >= options.createdAfter!);
    }

    if (options?.createdBefore) {
      results = results.filter((t) => t.createdAt <= options.createdBefore!);
    }

    if (options?.dueAfter) {
      results = results.filter((t) => t.sla.dueAt >= options.dueAfter!);
    }

    if (options?.dueBefore) {
      results = results.filter((t) => t.sla.dueAt <= options.dueBefore!);
    }

    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.entity.displayName?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sortBy = options?.sortBy || "createdAt";
    const sortDir = options?.sortDirection === "asc" ? 1 : -1;

    results.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortBy) {
        case "dueAt":
          aVal = a.sla.dueAt.getTime();
          bVal = b.sla.dueAt.getTime();
          break;
        case "priority": {
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
          aVal = priorityOrder[a.priority];
          bVal = priorityOrder[b.priority];
          break;
        }
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "title":
          aVal = a.title;
          bVal = b.title;
          break;
        default:
          aVal = a.createdAt.getTime();
          bVal = b.createdAt.getTime();
      }

      if (aVal === bVal) return 0;
      if (aVal < bVal) return -1 * sortDir;
      return 1 * sortDir;
    });

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async create(tenantId: string, task: Omit<ApprovalTask, "id" | "createdAt">): Promise<ApprovalTask> {
    const id = this.generateId();
    const now = new Date();

    const created: ApprovalTask = {
      ...task,
      id,
      createdAt: now,
    };

    this.tasks.set(this.makeKey(tenantId, id), created);
    return created;
  }

  async update(tenantId: string, taskId: string, updates: Partial<ApprovalTask>): Promise<ApprovalTask> {
    const key = this.makeKey(tenantId, taskId);
    const existing = this.tasks.get(key);

    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated: ApprovalTask = {
      ...existing,
      ...updates,
      id: taskId,
      tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    this.tasks.set(key, updated);
    return updated;
  }

  async delete(tenantId: string, taskId: string): Promise<void> {
    this.tasks.delete(this.makeKey(tenantId, taskId));
  }

  async createBulk(tenantId: string, tasks: Omit<ApprovalTask, "id" | "createdAt">[]): Promise<ApprovalTask[]> {
    const created: ApprovalTask[] = [];
    for (const task of tasks) {
      const newTask = await this.create(tenantId, task);
      created.push(newTask);
    }
    return created;
  }

  async updateByInstanceId(tenantId: string, instanceId: string, updates: Partial<ApprovalTask>): Promise<void> {
    for (const [key, task] of this.tasks) {
      if (task.tenantId === tenantId && task.instanceId === instanceId) {
        this.tasks.set(key, { ...task, ...updates, updatedAt: new Date() });
      }
    }
  }

  async deleteByInstanceId(tenantId: string, instanceId: string): Promise<void> {
    for (const [key, task] of this.tasks) {
      if (task.tenantId === tenantId && task.instanceId === instanceId) {
        this.tasks.delete(key);
      }
    }
  }

  async getTasksForInstance(tenantId: string, instanceId: string): Promise<ApprovalTask[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.tenantId === tenantId && t.instanceId === instanceId
    );
  }

  async getTasksForStep(tenantId: string, stepInstanceId: string): Promise<ApprovalTask[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.tenantId === tenantId && t.stepInstanceId === stepInstanceId
    );
  }

  async getOverdueTasks(tenantId: string): Promise<ApprovalTask[]> {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      (t) =>
        t.tenantId === tenantId &&
        t.status === "pending" &&
        t.sla.dueAt < now
    );
  }

  async getTasksDueSoon(tenantId: string, withinHours: number): Promise<ApprovalTask[]> {
    const now = new Date();
    const deadline = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    return Array.from(this.tasks.values()).filter(
      (t) =>
        t.tenantId === tenantId &&
        t.status === "pending" &&
        t.sla.dueAt > now &&
        t.sla.dueAt <= deadline
    );
  }

  async getInboxSummary(tenantId: string, assigneeId: string): Promise<InboxSummary> {
    const tasks = Array.from(this.tasks.values()).filter(
      (t) => t.tenantId === tenantId && t.assigneeId === assigneeId
    );

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const byStatus: Record<ApprovalTaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      delegated: 0,
      escalated: 0,
      expired: 0,
      cancelled: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };

    let overdueCount = 0;
    let warningCount = 0;
    let unreadCount = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const task of tasks) {
      byStatus[task.status]++;
      byPriority[task.priority]++;

      if (task.sla.isOverdue) overdueCount++;
      if (task.sla.slaStatus === "warning") warningCount++;
      if (!task.isRead) unreadCount++;

      if (task.status === "pending") {
        if (task.sla.dueAt <= todayEnd) dueToday++;
        if (task.sla.dueAt <= weekEnd) dueThisWeek++;
      }
    }

    return {
      totalPending: byStatus.pending + byStatus.in_progress,
      byStatus,
      byPriority,
      overdueCount,
      warningCount,
      unreadCount,
      dueToday,
      dueThisWeek,
    };
  }

  async countByAssignee(tenantId: string, assigneeId: string, status?: ApprovalTaskStatus): Promise<number> {
    let tasks = Array.from(this.tasks.values()).filter(
      (t) => t.tenantId === tenantId && t.assigneeId === assigneeId
    );

    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }

    return tasks.length;
  }

  // Utility methods
  clear(): void {
    this.tasks.clear();
    this.idCounter = 0;
  }

  count(): number {
    return this.tasks.size;
  }
}

// ============================================================================
// Database Repository (for production)
// ============================================================================

export class DatabaseApprovalTaskRepository implements IApprovalTaskRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(tenantId: string, taskId: string): Promise<ApprovalTask | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", taskId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToTask(result);
  }

  async getByAssignmentId(tenantId: string, assignmentId: string): Promise<ApprovalTask | undefined> {
    const result = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("assignment_id", "=", assignmentId)
      .executeTakeFirst();

    if (!result) return undefined;
    return this.mapRowToTask(result);
  }

  async list(tenantId: string, assigneeId: string, options?: InboxFilterOptions): Promise<ApprovalTask[]> {
    let query = this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("assignee_id", "=", assigneeId);

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      query = query.where("status", "in", statuses);
    }

    if (options?.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      query = query.where("priority", "in", priorities);
    }

    if (options?.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      query = query.where("type", "in", types);
    }

    if (options?.entityType) {
      query = query.where("entity_type", "=", options.entityType);
    }

    if (options?.templateCode) {
      query = query.where("template_code", "=", options.templateCode);
    }

    if (options?.overdueOnly) {
      query = query.where("is_overdue", "=", true);
    }

    if (options?.slaStatus) {
      query = query.where("sla_status", "=", options.slaStatus);
    }

    if (options?.unreadOnly) {
      query = query.where("is_read", "=", false);
    }

    if (options?.createdAfter) {
      query = query.where("created_at", ">=", options.createdAfter);
    }

    if (options?.createdBefore) {
      query = query.where("created_at", "<=", options.createdBefore);
    }

    if (options?.dueAfter) {
      query = query.where("due_at", ">=", options.dueAfter);
    }

    if (options?.dueBefore) {
      query = query.where("due_at", "<=", options.dueBefore);
    }

    if (options?.search) {
      query = query.where((eb: any) =>
        eb.or([
          eb("title", "ilike", `%${options.search}%`),
          eb("description", "ilike", `%${options.search}%`),
        ])
      );
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
    return results.map((r: any) => this.mapRowToTask(r));
  }

  async create(tenantId: string, task: Omit<ApprovalTask, "id" | "createdAt">): Promise<ApprovalTask> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("meta.approval_task" as any)
      .values({
        id,
        tenant_id: tenantId,
        org_id: task.orgId,
        instance_id: task.instanceId,
        step_instance_id: task.stepInstanceId,
        assignment_id: task.assignmentId,
        type: task.type,
        status: task.status,
        priority: task.priority,
        assignee_id: task.assigneeId,
        assignee_display_name: task.assigneeDisplayName,
        assignee_email: task.assigneeEmail,
        title: task.title,
        description: task.description,
        entity_type: task.entity.type,
        entity_id: task.entity.id,
        entity_reference_code: task.entity.referenceCode,
        entity_display_name: task.entity.displayName,
        template_code: task.workflow.templateCode,
        template_name: task.workflow.templateName,
        step_name: task.workflow.stepName,
        step_level: task.workflow.stepLevel,
        requester: JSON.stringify(task.requester),
        available_actions: JSON.stringify(task.availableActions),
        due_at: task.sla.dueAt,
        warning_at: task.sla.warningAt,
        is_overdue: task.sla.isOverdue,
        time_remaining_ms: task.sla.timeRemainingMs,
        sla_status: task.sla.slaStatus,
        delegation: task.delegation ? JSON.stringify(task.delegation) : null,
        escalation: task.escalation ? JSON.stringify(task.escalation) : null,
        is_read: task.isRead,
        read_at: task.readAt,
        created_at: now,
      })
      .execute();

    return { ...task, id, createdAt: now };
  }

  async update(tenantId: string, taskId: string, updates: Partial<ApprovalTask>): Promise<ApprovalTask> {
    const now = new Date();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.isRead !== undefined) updateData.is_read = updates.isRead;
    if (updates.readAt !== undefined) updateData.read_at = updates.readAt;
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;
    if (updates.assigneeId !== undefined) updateData.assignee_id = updates.assigneeId;
    if (updates.assigneeDisplayName !== undefined) updateData.assignee_display_name = updates.assigneeDisplayName;
    if (updates.assigneeEmail !== undefined) updateData.assignee_email = updates.assigneeEmail;
    if (updates.delegation !== undefined) updateData.delegation = JSON.stringify(updates.delegation);
    if (updates.escalation !== undefined) updateData.escalation = JSON.stringify(updates.escalation);
    if (updates.sla !== undefined) {
      updateData.due_at = updates.sla.dueAt;
      updateData.warning_at = updates.sla.warningAt;
      updateData.is_overdue = updates.sla.isOverdue;
      updateData.time_remaining_ms = updates.sla.timeRemainingMs;
      updateData.sla_status = updates.sla.slaStatus;
    }

    await this.db
      .updateTable("meta.approval_task" as any)
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", taskId)
      .execute();

    const result = await this.getById(tenantId, taskId);
    if (!result) {
      throw new Error(`Task not found after update: ${taskId}`);
    }
    return result;
  }

  async delete(tenantId: string, taskId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.approval_task" as any)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", taskId)
      .execute();
  }

  async createBulk(tenantId: string, tasks: Omit<ApprovalTask, "id" | "createdAt">[]): Promise<ApprovalTask[]> {
    const created: ApprovalTask[] = [];
    for (const task of tasks) {
      const newTask = await this.create(tenantId, task);
      created.push(newTask);
    }
    return created;
  }

  async updateByInstanceId(tenantId: string, instanceId: string, updates: Partial<ApprovalTask>): Promise<void> {
    const updateData: Record<string, unknown> = { updated_at: new Date() };

    if (updates.status !== undefined) updateData.status = updates.status;

    await this.db
      .updateTable("meta.approval_task" as any)
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("instance_id", "=", instanceId)
      .execute();
  }

  async deleteByInstanceId(tenantId: string, instanceId: string): Promise<void> {
    await this.db
      .deleteFrom("meta.approval_task" as any)
      .where("tenant_id", "=", tenantId)
      .where("instance_id", "=", instanceId)
      .execute();
  }

  async getTasksForInstance(tenantId: string, instanceId: string): Promise<ApprovalTask[]> {
    const results = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("instance_id", "=", instanceId)
      .orderBy("created_at", "asc")
      .execute();

    return results.map((r: any) => this.mapRowToTask(r));
  }

  async getTasksForStep(tenantId: string, stepInstanceId: string): Promise<ApprovalTask[]> {
    const results = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("step_instance_id", "=", stepInstanceId)
      .orderBy("created_at", "asc")
      .execute();

    return results.map((r: any) => this.mapRowToTask(r));
  }

  async getOverdueTasks(tenantId: string): Promise<ApprovalTask[]> {
    const now = new Date();

    const results = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "pending")
      .where("due_at", "<", now)
      .execute();

    return results.map((r: any) => this.mapRowToTask(r));
  }

  async getTasksDueSoon(tenantId: string, withinHours: number): Promise<ApprovalTask[]> {
    const now = new Date();
    const deadline = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    const results = await this.db
      .selectFrom("meta.approval_task" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "pending")
      .where("due_at", ">", now)
      .where("due_at", "<=", deadline)
      .execute();

    return results.map((r: any) => this.mapRowToTask(r));
  }

  async getInboxSummary(tenantId: string, assigneeId: string): Promise<InboxSummary> {
    // For now, use a simpler approach by fetching tasks
    const tasks = await this.list(tenantId, assigneeId, { limit: 1000 });

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const byStatus: Record<ApprovalTaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      delegated: 0,
      escalated: 0,
      expired: 0,
      cancelled: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };

    let overdueCount = 0;
    let warningCount = 0;
    let unreadCount = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const task of tasks) {
      byStatus[task.status]++;
      byPriority[task.priority]++;

      if (task.sla.isOverdue) overdueCount++;
      if (task.sla.slaStatus === "warning") warningCount++;
      if (!task.isRead) unreadCount++;

      if (task.status === "pending") {
        if (task.sla.dueAt <= todayEnd) dueToday++;
        if (task.sla.dueAt <= weekEnd) dueThisWeek++;
      }
    }

    return {
      totalPending: byStatus.pending + byStatus.in_progress,
      byStatus,
      byPriority,
      overdueCount,
      warningCount,
      unreadCount,
      dueToday,
      dueThisWeek,
    };
  }

  async countByAssignee(tenantId: string, assigneeId: string, status?: ApprovalTaskStatus): Promise<number> {
    let query = this.db
      .selectFrom("meta.approval_task" as any)
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("assignee_id", "=", assigneeId);

    if (status) {
      query = query.where("status", "=", status);
    }

    const result = await query.executeTakeFirst();
    return Number((result as any)?.count ?? 0);
  }

  private mapRowToTask(row: any): ApprovalTask {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orgId: row.org_id,
      instanceId: row.instance_id,
      stepInstanceId: row.step_instance_id,
      assignmentId: row.assignment_id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assignee_id,
      assigneeDisplayName: row.assignee_display_name,
      assigneeEmail: row.assignee_email,
      title: row.title,
      description: row.description,
      entity: {
        type: row.entity_type,
        id: row.entity_id,
        referenceCode: row.entity_reference_code,
        displayName: row.entity_display_name,
      },
      workflow: {
        templateCode: row.template_code,
        templateName: row.template_name,
        stepName: row.step_name,
        stepLevel: row.step_level,
      },
      requester: this.parseJson(row.requester) || {},
      availableActions: this.parseJson(row.available_actions) || [],
      sla: {
        dueAt: new Date(row.due_at),
        warningAt: row.warning_at ? new Date(row.warning_at) : undefined,
        isOverdue: row.is_overdue,
        timeRemainingMs: row.time_remaining_ms,
        slaStatus: row.sla_status,
      },
      delegation: this.parseJson(row.delegation),
      escalation: this.parseJson(row.escalation),
      isRead: row.is_read,
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
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
      dueAt: "due_at",
      priority: "priority",
      status: "status",
      title: "title",
    };
    return fieldMap[field] || "created_at";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createInMemoryApprovalTaskRepository(): InMemoryApprovalTaskRepository {
  return new InMemoryApprovalTaskRepository();
}

export function createDatabaseApprovalTaskRepository(db: Kysely<DB>): DatabaseApprovalTaskRepository {
  return new DatabaseApprovalTaskRepository(db);
}
