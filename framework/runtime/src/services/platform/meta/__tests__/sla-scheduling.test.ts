import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApprovalServiceImpl } from "../approval/approval.service.js";
import {
  SLA_JOB_TYPES,
  createSlaReminderHandler,
  createSlaEscalationHandler,
} from "../approval/workers/sla-timer.worker.js";

import type { JobQueue, Job, JobData } from "@athyper/core";
import type { ApprovalTask } from "@athyper/core/meta";

// ============================================================================
// Helpers
// ============================================================================

function createMockDb() {
  const rows: Record<string, unknown>[] = [];

  const mockQuery = {
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue([]),
  };

  const mockInsert = {
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  return {
    selectFrom: vi.fn().mockReturnValue(mockQuery),
    insertInto: vi.fn().mockReturnValue(mockInsert),
    updateTable: vi.fn().mockReturnValue(mockUpdate),
    _mockQuery: mockQuery,
    _mockInsert: mockInsert,
    _rows: rows,
  };
}

function createMockJobQueue(): JobQueue & {
  _addedJobs: Array<{ data: JobData; options: any }>;
} {
  const addedJobs: Array<{ data: JobData; options: any }> = [];
  return {
    _addedJobs: addedJobs,
    add: vi.fn(async (data: JobData, options?: any) => {
      addedJobs.push({ data, options });
      return {
        id: `job-${addedJobs.length}`,
        data,
        status: "delayed" as const,
        attempts: 0,
        maxAttempts: options?.attempts ?? 3,
        priority: 2,
        createdAt: new Date(),
      };
    }),
    addBulk: vi.fn().mockResolvedValue([]),
    process: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(undefined),
    getJobs: vi.fn().mockResolvedValue([]),
    removeJob: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
    }),
  };
}

function makePendingTask(overrides?: Partial<ApprovalTask>): ApprovalTask {
  return {
    id: "task-1",
    tenantId: "t1",
    approvalInstanceId: "inst-1",
    approvalStageId: "stage-1",
    taskType: "approver",
    status: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeJob<T>(payload: T, type: string): Job<T> {
  return {
    id: "job-1",
    data: { type, payload, metadata: {} },
    status: "active",
    attempts: 0,
    maxAttempts: 3,
    priority: 2,
    createdAt: new Date(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("SLA Scheduling", () => {
  let db: ReturnType<typeof createMockDb>;
  let jobQueue: ReturnType<typeof createMockJobQueue>;
  let service: ApprovalServiceImpl;

  beforeEach(() => {
    db = createMockDb();
    jobQueue = createMockJobQueue();
    service = new ApprovalServiceImpl(db as any);
    service.setJobQueue(jobQueue);
  });

  // --------------------------------------------------------------------------
  // scheduleReminder
  // --------------------------------------------------------------------------

  describe("scheduleReminder", () => {
    it("adds a delayed reminder job to the queue", async () => {
      const task = makePendingTask();
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: task.id,
        tenant_id: task.tenantId,
        approval_instance_id: task.approvalInstanceId,
        approval_stage_id: task.approvalStageId,
        task_type: "approver",
        status: "pending",
        created_at: new Date(),
      });

      const fireAt = new Date(Date.now() + 60_000); // 1 min from now
      await service.scheduleReminder("task-1", fireAt, "t1");

      expect(jobQueue.add).toHaveBeenCalledTimes(1);
      const call = jobQueue._addedJobs[0];
      expect(call.data.type).toBe(SLA_JOB_TYPES.REMINDER);
      expect(call.data.payload.taskId).toBe("task-1");
      expect(call.data.payload.tenantId).toBe("t1");
      expect(call.options.delay).toBeGreaterThan(0);
      expect(call.options.delay).toBeLessThanOrEqual(60_000);
    });

    it("skips scheduling when fireAt is in the past", async () => {
      const fireAt = new Date(Date.now() - 10_000); // 10 sec ago
      await service.scheduleReminder("task-1", fireAt, "t1");

      expect(jobQueue.add).not.toHaveBeenCalled();
    });

    it("skips scheduling when task is no longer pending", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "approved",
        created_at: new Date(),
      });

      const fireAt = new Date(Date.now() + 60_000);
      await service.scheduleReminder("task-1", fireAt, "t1");

      expect(jobQueue.add).not.toHaveBeenCalled();
    });

    it("no-ops when job queue is not configured", async () => {
      const serviceNoQueue = new ApprovalServiceImpl(db as any);
      // Don't call setJobQueue

      const fireAt = new Date(Date.now() + 60_000);
      await serviceNoQueue.scheduleReminder("task-1", fireAt, "t1");
      // Should not throw
    });
  });

  // --------------------------------------------------------------------------
  // scheduleEscalation
  // --------------------------------------------------------------------------

  describe("scheduleEscalation", () => {
    it("adds a delayed escalation job to the queue", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "pending",
        created_at: new Date(),
      });

      const fireAt = new Date(Date.now() + 120_000);
      await service.scheduleEscalation(
        "task-1",
        fireAt,
        { kind: "sla_breach", reassignTo: "manager-1" },
        "t1",
      );

      expect(jobQueue.add).toHaveBeenCalledTimes(1);
      const call = jobQueue._addedJobs[0];
      expect(call.data.type).toBe(SLA_JOB_TYPES.ESCALATION);
      expect(call.data.payload.escalation.kind).toBe("sla_breach");
      expect(call.options.delay).toBeGreaterThan(0);
    });

    it("skips scheduling when fireAt is in the past", async () => {
      const fireAt = new Date(Date.now() - 5_000);
      await service.scheduleEscalation("task-1", fireAt, { kind: "breach" }, "t1");
      expect(jobQueue.add).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // processReminder
  // --------------------------------------------------------------------------

  describe("processReminder", () => {
    it("logs a reminder event when task is pending", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "pending",
        assignee_principal_id: "user-42",
        created_at: new Date(),
      });

      await service.processReminder("task-1", "t1");

      // Should have logged an event (insertInto "wf.approval_event")
      expect(db.insertInto).toHaveBeenCalled();
      const insertCalls = (db.insertInto as any).mock.calls;
      const eventInsert = insertCalls.find((c: any[]) => c[0] === "wf.approval_event");
      expect(eventInsert).toBeDefined();
    });

    it("skips when task is not pending", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "approved",
        created_at: new Date(),
      });

      await service.processReminder("task-1", "t1");

      // Should NOT have logged an event
      const insertCalls = (db.insertInto as any).mock.calls;
      const eventInsert = insertCalls.find((c: any[]) => c[0] === "wf.approval_event");
      expect(eventInsert).toBeUndefined();
    });

    it("skips when task is not found", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue(undefined);
      await service.processReminder("missing-task", "t1");
      // Should not throw
    });
  });

  // --------------------------------------------------------------------------
  // processEscalation
  // --------------------------------------------------------------------------

  describe("processEscalation", () => {
    it("creates an escalation record and logs event when task is pending", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "pending",
        created_at: new Date(),
      });

      await service.processEscalation(
        "task-1",
        { kind: "sla_breach", reassignTo: "manager-1" },
        "t1",
      );

      // Should have inserted into wf.approval_escalation AND wf.approval_event
      const insertCalls = (db.insertInto as any).mock.calls;
      const escalationInsert = insertCalls.find((c: any[]) => c[0] === "wf.approval_escalation");
      const eventInsert = insertCalls.find((c: any[]) => c[0] === "wf.approval_event");
      expect(escalationInsert).toBeDefined();
      expect(eventInsert).toBeDefined();
    });

    it("skips when task is no longer pending", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "rejected",
        created_at: new Date(),
      });

      await service.processEscalation("task-1", { kind: "breach" }, "t1");

      const insertCalls = (db.insertInto as any).mock.calls;
      expect(insertCalls.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // cancelTimers
  // --------------------------------------------------------------------------

  describe("cancelTimers", () => {
    it("logs a cancellation event when task exists", async () => {
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "approved",
        created_at: new Date(),
      });

      await service.cancelTimers("task-1", "t1");

      const insertCalls = (db.insertInto as any).mock.calls;
      const eventInsert = insertCalls.find((c: any[]) => c[0] === "wf.approval_event");
      expect(eventInsert).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Worker Handlers
  // --------------------------------------------------------------------------

  describe("SLA worker handlers", () => {
    it("reminder handler calls processReminder on pending task", async () => {
      const mockApprovalService = {
        getTask: vi.fn().mockResolvedValue(makePendingTask()),
        processReminder: vi.fn().mockResolvedValue(undefined),
      };

      const handler = createSlaReminderHandler(mockApprovalService as any);
      const job = makeJob(
        { taskId: "task-1", tenantId: "t1", instanceId: "inst-1", stageId: "stage-1" },
        SLA_JOB_TYPES.REMINDER,
      );

      await handler(job);

      expect(mockApprovalService.getTask).toHaveBeenCalledWith("task-1", "t1");
      expect(mockApprovalService.processReminder).toHaveBeenCalledWith("task-1", "t1");
    });

    it("reminder handler skips resolved task", async () => {
      const mockApprovalService = {
        getTask: vi.fn().mockResolvedValue({ ...makePendingTask(), status: "approved" }),
        processReminder: vi.fn(),
      };

      const handler = createSlaReminderHandler(mockApprovalService as any);
      const job = makeJob(
        { taskId: "task-1", tenantId: "t1", instanceId: "inst-1", stageId: "stage-1" },
        SLA_JOB_TYPES.REMINDER,
      );

      await handler(job);

      expect(mockApprovalService.processReminder).not.toHaveBeenCalled();
    });

    it("reminder handler skips missing task", async () => {
      const mockApprovalService = {
        getTask: vi.fn().mockResolvedValue(undefined),
        processReminder: vi.fn(),
      };

      const handler = createSlaReminderHandler(mockApprovalService as any);
      const job = makeJob(
        { taskId: "missing", tenantId: "t1", instanceId: "inst-1", stageId: "stage-1" },
        SLA_JOB_TYPES.REMINDER,
      );

      await handler(job);

      expect(mockApprovalService.processReminder).not.toHaveBeenCalled();
    });

    it("escalation handler calls processEscalation on pending task", async () => {
      const mockApprovalService = {
        getTask: vi.fn().mockResolvedValue(makePendingTask()),
        processEscalation: vi.fn().mockResolvedValue(undefined),
      };

      const handler = createSlaEscalationHandler(mockApprovalService as any);
      const job = makeJob(
        {
          taskId: "task-1",
          tenantId: "t1",
          instanceId: "inst-1",
          stageId: "stage-1",
          escalation: { kind: "sla_breach" },
        },
        SLA_JOB_TYPES.ESCALATION,
      );

      await handler(job);

      expect(mockApprovalService.getTask).toHaveBeenCalledWith("task-1", "t1");
      expect(mockApprovalService.processEscalation).toHaveBeenCalledWith(
        "task-1",
        { kind: "sla_breach" },
        "t1",
      );
    });

    it("escalation handler skips resolved task", async () => {
      const mockApprovalService = {
        getTask: vi.fn().mockResolvedValue({ ...makePendingTask(), status: "rejected" }),
        processEscalation: vi.fn(),
      };

      const handler = createSlaEscalationHandler(mockApprovalService as any);
      const job = makeJob(
        {
          taskId: "task-1",
          tenantId: "t1",
          instanceId: "inst-1",
          stageId: "stage-1",
          escalation: { kind: "sla_breach" },
        },
        SLA_JOB_TYPES.ESCALATION,
      );

      await handler(job);

      expect(mockApprovalService.processEscalation).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // rehydratePendingTimers
  // --------------------------------------------------------------------------

  describe("rehydratePendingTimers", () => {
    it("reschedules timers for pending tasks with future due dates", async () => {
      const futureDate = new Date(Date.now() + 3_600_000); // 1 hour from now

      // First call: selectFrom returns pending tasks
      db._mockQuery.execute.mockResolvedValueOnce([
        {
          id: "task-1",
          tenant_id: "t1",
          approval_instance_id: "inst-1",
          approval_stage_id: "stage-1",
          task_type: "approver",
          status: "pending",
          due_at: futureDate,
          created_at: new Date(),
        },
      ]);

      // Subsequent calls for getTask inside schedule methods
      db._mockQuery.executeTakeFirst.mockResolvedValue({
        id: "task-1",
        tenant_id: "t1",
        approval_instance_id: "inst-1",
        approval_stage_id: "stage-1",
        task_type: "approver",
        status: "pending",
        created_at: new Date(),
      });

      const count = await service.rehydratePendingTimers("t1");

      expect(count).toBe(1);
      // Should have scheduled both a reminder and an escalation
      expect(jobQueue.add).toHaveBeenCalledTimes(2);
      const types = jobQueue._addedJobs.map((j) => j.data.type);
      expect(types).toContain(SLA_JOB_TYPES.REMINDER);
      expect(types).toContain(SLA_JOB_TYPES.ESCALATION);
    });

    it("returns 0 when no pending tasks have due dates", async () => {
      db._mockQuery.execute.mockResolvedValueOnce([]);

      const count = await service.rehydratePendingTimers("t1");

      expect(count).toBe(0);
      expect(jobQueue.add).not.toHaveBeenCalled();
    });
  });
});
