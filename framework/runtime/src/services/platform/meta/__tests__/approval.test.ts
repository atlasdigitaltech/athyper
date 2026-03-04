/**
 * Tests for ApprovalServiceImpl
 *
 * Tests approval instance creation, decision processing, and status mapping.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { ApprovalServiceImpl } from "../approval/approval.service.js";

// ============================================================================
// Mock Types (inferred from service usage)
// ============================================================================

type RequestContext = {
  userId: string;
  tenantId: string;
  realmId: string;
  roles: string[];
  metadata?: Record<string, unknown>;
};

type ApprovalInstance = {
  id: string;
  tenantId: string;
  entityName: string;
  entityId: string;
  transitionId?: string;
  approvalTemplateId?: string;
  status: "open" | "completed" | "canceled";
  createdAt: Date;
  createdBy: string;
};

type ApprovalTask = {
  id: string;
  tenantId: string;
  approvalInstanceId: string;
  approvalStageId: string;
  assigneePrincipalId?: string;
  assigneeGroupId?: string;
  taskType: "approver" | "observer";
  status: "pending" | "approved" | "rejected";
  dueAt?: Date;
  decidedAt?: Date;
  decidedBy?: string;
  decisionNote?: string;
  createdAt: Date;
};

// ============================================================================
// Mock DB Builder
// ============================================================================

function createMockDb() {
  const mockExecute = vi.fn();
  const mockExecuteTakeFirst = vi.fn();
  const mockExecuteTakeFirstOrThrow = vi.fn();
  const mockWhere = vi.fn();
  const mockSelect = vi.fn();
  const mockSelectAll = vi.fn();
  const mockSelectFrom = vi.fn();
  const mockInsertInto = vi.fn();
  const mockUpdateTable = vi.fn();
  const mockValues = vi.fn();
  const mockSet = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockOffset = vi.fn();

  // Build chainable query builder
  const queryBuilder: any = {
    selectAll: mockSelectAll,
    select: mockSelect,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    offset: mockOffset,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  };

  // Chain methods to return queryBuilder
  mockSelectAll.mockReturnValue(queryBuilder);
  mockSelect.mockReturnValue(queryBuilder);
  mockWhere.mockReturnValue(queryBuilder);
  mockOrderBy.mockReturnValue(queryBuilder);
  mockLimit.mockReturnValue(queryBuilder);
  mockOffset.mockReturnValue(queryBuilder);

  // Insert/update builder
  const mutationBuilder: any = {
    values: mockValues,
    set: mockSet,
    where: mockWhere,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
  };

  mockValues.mockReturnValue(mutationBuilder);
  mockSet.mockReturnValue(mutationBuilder);

  // Root methods
  mockSelectFrom.mockReturnValue(queryBuilder);
  mockInsertInto.mockReturnValue(mutationBuilder);
  mockUpdateTable.mockReturnValue(mutationBuilder);

  const db: any = {
    selectFrom: mockSelectFrom,
    insertInto: mockInsertInto,
    updateTable: mockUpdateTable,
    // Executor for sql tagged template (used by healthCheck)
    getExecutor: vi.fn(() => ({
      transformQuery: vi.fn((node: any) => node),
      compileQuery: vi.fn((node: any) => ({
        sql: "mock-sql",
        parameters: [],
        query: node,
      })),
      executeQuery: vi.fn(async () => ({ rows: [] })),
    })),
  };

  return {
    db,
    mocks: {
      selectFrom: mockSelectFrom,
      insertInto: mockInsertInto,
      updateTable: mockUpdateTable,
      selectAll: mockSelectAll,
      select: mockSelect,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
      offset: mockOffset,
      values: mockValues,
      set: mockSet,
      execute: mockExecute,
      executeTakeFirst: mockExecuteTakeFirst,
      executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("ApprovalServiceImpl", () => {
  let service: ApprovalServiceImpl;
  let mockDb: any;
  let mocks: any;

  const testCtx: RequestContext = {
    userId: "user-123",
    tenantId: "tenant-456",
    realmId: "realm-789",
    roles: ["approver"],
  };

  beforeEach(() => {
    const dbSetup = createMockDb();
    mockDb = dbSetup.db;
    mocks = dbSetup.mocks;
    service = new ApprovalServiceImpl(mockDb);
  });

  describe("createApprovalInstance", () => {
    it("should create approval instance from template with stages and tasks", async () => {
      // Setup: template exists
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "template-1",
        code: "TRAVEL_APPROVAL",
        tenant_id: "tenant-456",
      });

      // Setup: template stages
      mocks.execute.mockResolvedValueOnce([
        {
          id: "stage-1",
          approval_template_id: "template-1",
          stage_no: 1,
          mode: "all",
          tenant_id: "tenant-456",
        },
      ]);

      // Setup: routing rules
      mocks.execute.mockResolvedValueOnce([
        {
          id: "rule-1",
          approval_template_id: "template-1",
          priority: 1,
          conditions: null,
          assign_to: { principal_id: "approver-1" },
          tenant_id: "tenant-456",
        },
      ]);

      // Setup: inserts succeed
      mocks.execute.mockResolvedValue(undefined);

      const result = await service.createApprovalInstance({
        entityName: "TravelRequest",
        entityId: "req-123",
        transitionId: "trans-456",
        approvalTemplateId: "template-1",
        ctx: testCtx,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBeDefined();
      expect(result.stageCount).toBe(1);
      expect(result.taskCount).toBe(1);

      // Verify template lookup
      expect(mocks.selectFrom).toHaveBeenCalledWith("meta.approval_template");
      expect(mocks.where).toHaveBeenCalledWith("id", "=", "template-1");

      // Verify instance insert
      expect(mocks.insertInto).toHaveBeenCalledWith("wf.approval_instance");
      expect(mocks.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-456",
          entity_name: "TravelRequest",
          entity_id: "req-123",
          transition_id: "trans-456",
          approval_template_id: "template-1",
          status: "open",
        })
      );

      // Verify stage insert
      expect(mocks.insertInto).toHaveBeenCalledWith("wf.approval_stage");

      // Verify task insert
      expect(mocks.insertInto).toHaveBeenCalledWith("wf.approval_task");

      // Verify snapshot insert
      expect(mocks.insertInto).toHaveBeenCalledWith(
        "wf.approval_assignment_snapshot"
      );

      // Verify event insert
      expect(mocks.insertInto).toHaveBeenCalledWith("wf.approval_event");
    });

    it("should return error when template not found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await service.createApprovalInstance({
        entityName: "TravelRequest",
        entityId: "req-123",
        transitionId: "trans-456",
        approvalTemplateId: "nonexistent",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error when template has no stages", async () => {
      // Template exists
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "template-1",
        code: "EMPTY_TEMPLATE",
        tenant_id: "tenant-456",
      });

      // No stages
      mocks.execute.mockResolvedValueOnce([]);

      const result = await service.createApprovalInstance({
        entityName: "TravelRequest",
        entityId: "req-123",
        transitionId: "trans-456",
        approvalTemplateId: "template-1",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("no stages");
    });
  });

  describe("getInstance", () => {
    it("should return instance when found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "instance-1",
        tenant_id: "tenant-456",
        entity_name: "TravelRequest",
        entity_id: "req-123",
        transition_id: "trans-456",
        approval_template_id: "template-1",
        status: "open",
        created_at: new Date(),
        created_by: "user-123",
      });

      const instance = await service.getInstance("instance-1", "tenant-456");

      expect(instance).toBeDefined();
      expect(instance?.id).toBe("instance-1");
      expect(instance?.status).toBe("open");
    });

    it("should return undefined when not found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce(undefined);

      const instance = await service.getInstance("nonexistent", "tenant-456");

      expect(instance).toBeUndefined();
    });
  });

  describe("getInstanceForEntity", () => {
    it("should return open instance for entity", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "instance-1",
        tenant_id: "tenant-456",
        entity_name: "TravelRequest",
        entity_id: "req-123",
        status: "open",
        created_at: new Date(),
        created_by: "user-123",
      });

      const instance = await service.getInstanceForEntity(
        "TravelRequest",
        "req-123",
        "tenant-456"
      );

      expect(instance).toBeDefined();
      expect(instance?.status).toBe("open");
      expect(mocks.where).toHaveBeenCalledWith("status", "=", "open");
    });
  });

  describe("makeDecision - approve", () => {
    it("should approve task and mark stage and instance as completed", async () => {
      const taskId = "task-1";
      const stageId = "stage-1";
      const instanceId = "instance-1";

      // Setup: get task
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: taskId,
        tenant_id: "tenant-456",
        approval_instance_id: instanceId,
        approval_stage_id: stageId,
        status: "pending",
        created_at: new Date(),
      });

      // Setup: update task succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: cancelTimers → getTask (re-fetches task by id)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: taskId,
        tenant_id: "tenant-456",
        approval_instance_id: instanceId,
        approval_stage_id: stageId,
        status: "approved",
        created_at: new Date(),
      });

      // Setup: cancelTimers → logEvent
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: log decision event succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: isStageComplete → get stage mode
      mocks.executeTakeFirst.mockResolvedValueOnce({ mode: "all" });

      // Setup: isStageComplete → get tasks for stage (no more pending tasks)
      mocks.execute.mockResolvedValueOnce([{ status: "approved" }]);

      // Setup: stage outcome check (all approved)
      mocks.execute.mockResolvedValueOnce([{ status: "approved" }]);

      // Setup: update stage succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: instance complete check (all stages completed)
      mocks.execute.mockResolvedValueOnce([{ status: "completed" }]);

      // Setup: update instance succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: log instance completed event
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: resume transition (get instance)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        transition_id: "trans-1",
        entity_name: "TravelRequest",
        entity_id: "req-123",
      });

      // Setup: get transition
      mocks.executeTakeFirst.mockResolvedValueOnce({
        operation_code: "APPROVE",
      });

      const result = await service.makeDecision({
        taskId,
        decision: "approve",
        ctx: testCtx,
      });

      expect(result.success).toBe(true);
      expect(result.taskStatus).toBe("approved");
      expect(result.stageStatus).toBe("completed");
      expect(result.instanceStatus).toBe("completed");

      // Verify task update
      expect(mocks.updateTable).toHaveBeenCalledWith("wf.approval_task");
      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "approved",
          decided_by: "user-123",
        })
      );

      // Verify stage update
      expect(mocks.updateTable).toHaveBeenCalledWith("wf.approval_stage");
      expect(mocks.set).toHaveBeenCalledWith({ status: "completed" });

      // Verify instance update
      expect(mocks.updateTable).toHaveBeenCalledWith("wf.approval_instance");
      expect(mocks.set).toHaveBeenCalledWith({ status: "completed" });
    });
  });

  describe("makeDecision - reject", () => {
    it("should reject task and cancel instance with rejected reason", async () => {
      const taskId = "task-1";
      const stageId = "stage-1";
      const instanceId = "instance-1";

      // Setup: get task (via getTask -> executeTakeFirst)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: taskId,
        tenant_id: "tenant-456",
        approval_instance_id: instanceId,
        approval_stage_id: stageId,
        status: "pending",
        created_at: new Date(),
      });

      // Setup: update task succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: cancelTimers → getTask (re-fetches task by id)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: taskId,
        tenant_id: "tenant-456",
        approval_instance_id: instanceId,
        approval_stage_id: stageId,
        status: "rejected",
        created_at: new Date(),
      });

      // Setup: cancelTimers → logEvent
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: log decision event succeeds
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: isStageComplete -> get stage mode (executeTakeFirst)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        mode: "all",
      });

      // Setup: isStageComplete -> get tasks (execute)
      mocks.execute.mockResolvedValueOnce([{ status: "rejected" }]);

      // Setup: resolveStageOutcome -> get tasks (execute)
      mocks.execute.mockResolvedValueOnce([{ status: "rejected" }]);

      // Setup: update stage to canceled
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: update instance to canceled with rejected reason
      mocks.execute.mockResolvedValueOnce(undefined);

      // Setup: log instance rejected event
      mocks.execute.mockResolvedValueOnce(undefined);

      const result = await service.makeDecision({
        taskId,
        decision: "reject",
        note: "Budget exceeds limit",
        ctx: testCtx,
      });

      expect(result.success).toBe(true);
      expect(result.taskStatus).toBe("rejected");
      expect(result.stageStatus).toBe("rejected");
      expect(result.instanceStatus).toBe("rejected");

      // Verify task update
      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          decided_by: "user-123",
          decision_note: "Budget exceeds limit",
        })
      );

      // Verify stage update to canceled
      expect(mocks.set).toHaveBeenCalledWith({ status: "canceled" });

      // Verify instance update to canceled with rejected context
      expect(mocks.set).toHaveBeenCalledWith({
        status: "canceled",
        context: JSON.stringify({ reason: "rejected" }),
      });
    });
  });

  describe("status mapping", () => {
    it("should map DB canceled with rejected reason to spec 'rejected'", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "instance-1",
        tenant_id: "tenant-456",
        entity_name: "TravelRequest",
        entity_id: "req-123",
        status: "canceled",
        context: { reason: "rejected" },
        created_at: new Date(),
        created_by: "user-123",
      });

      const instance = await service.getInstance("instance-1", "tenant-456");

      expect(instance).toBeDefined();
      expect(instance?.status).toBe("rejected");
    });

    it("should map DB canceled without rejected reason to canceled", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "instance-1",
        tenant_id: "tenant-456",
        entity_name: "TravelRequest",
        entity_id: "req-123",
        status: "canceled",
        context: { reason: "timeout" },
        created_at: new Date(),
        created_by: "user-123",
      });

      const instance = await service.getInstance("instance-1", "tenant-456");

      expect(instance).toBeDefined();
      expect(instance?.status).toBe("canceled");
    });
  });

  describe("makeDecision - validation", () => {
    it("should return error when task not found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await service.makeDecision({
        taskId: "nonexistent",
        decision: "approve",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error when task is not pending", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "task-1",
        tenant_id: "tenant-456",
        approval_instance_id: "instance-1",
        approval_stage_id: "stage-1",
        status: "approved", // Already decided
        created_at: new Date(),
      });

      const result = await service.makeDecision({
        taskId: "task-1",
        decision: "approve",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not pending");
    });
  });

  describe("getTask", () => {
    it("should return task when found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "task-1",
        tenant_id: "tenant-456",
        approval_instance_id: "instance-1",
        approval_stage_id: "stage-1",
        assignee_principal_id: "user-123",
        task_type: "approver",
        status: "pending",
        created_at: new Date(),
      });

      const task = await service.getTask("task-1", "tenant-456");

      expect(task).toBeDefined();
      expect(task?.id).toBe("task-1");
      expect(task?.status).toBe("pending");
    });

    it("should return undefined when not found", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce(undefined);

      const task = await service.getTask("nonexistent", "tenant-456");

      expect(task).toBeUndefined();
    });
  });

  describe("getTasksForInstance", () => {
    it("should return all tasks for an instance", async () => {
      mocks.execute.mockResolvedValueOnce([
        {
          id: "task-1",
          tenant_id: "tenant-456",
          approval_instance_id: "instance-1",
          approval_stage_id: "stage-1",
          status: "pending",
          task_type: "approver",
          created_at: new Date(),
        },
        {
          id: "task-2",
          tenant_id: "tenant-456",
          approval_instance_id: "instance-1",
          approval_stage_id: "stage-1",
          status: "approved",
          task_type: "approver",
          created_at: new Date(),
        },
      ]);

      const tasks = await service.getTasksForInstance(
        "instance-1",
        "tenant-456"
      );

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe("task-1");
      expect(tasks[1].id).toBe("task-2");
    });
  });

  describe("healthCheck", () => {
    it("should return healthy when DB is accessible", async () => {
      // healthCheck uses sql tagged template which goes through getExecutor
      // The default mock getExecutor returns { rows: [] } which is sufficient
      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.name).toBe("approval-service");
    });

    it("should return unhealthy when DB fails", async () => {
      // Override getExecutor to simulate DB failure
      mockDb.getExecutor = vi.fn(() => ({
        transformQuery: vi.fn((node: any) => node),
        compileQuery: vi.fn((node: any) => ({
          sql: "mock-sql",
          parameters: [],
          query: node,
        })),
        executeQuery: vi.fn(async () => {
          throw new Error("DB connection failed");
        }),
      }));

      const result = await service.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("DB connection failed");
    });
  });
});
