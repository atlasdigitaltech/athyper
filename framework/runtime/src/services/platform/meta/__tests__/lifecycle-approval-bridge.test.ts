/**
 * Tests for Approval Bridge in LifecycleManagerService
 *
 * Tests the integration between lifecycle gates and approval workflows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { LifecycleManagerService } from "../lifecycle/lifecycle-manager.service.js";

// ============================================================================
// Mock Types
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
  status: "open" | "completed" | "rejected" | "canceled";
  createdAt: Date;
  createdBy: string;
};

type ApprovalCreationResult = {
  success: boolean;
  instanceId?: string;
  stageCount?: number;
  taskCount?: number;
  error?: string;
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
  const mockOnConflict = vi.fn();
  const mockDoUpdateSet = vi.fn();
  const mockReturningAll = vi.fn();

  // Build chainable query builder
  const queryBuilder: any = {
    selectAll: mockSelectAll,
    select: mockSelect,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
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

  // Insert builder with conflict handling
  const conflictBuilder: any = {
    columns: vi.fn().mockReturnThis(),
    doUpdateSet: mockDoUpdateSet,
  };

  const insertBuilder: any = {
    values: mockValues,
    onConflict: mockOnConflict,
    returningAll: mockReturningAll,
    execute: mockExecute,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  };

  mockValues.mockReturnValue(insertBuilder);
  mockOnConflict.mockReturnValue(conflictBuilder);
  mockDoUpdateSet.mockReturnValue(insertBuilder);
  mockReturningAll.mockReturnValue(insertBuilder);

  // Update builder
  const mutationBuilder: any = {
    set: mockSet,
    where: mockWhere,
    execute: mockExecute,
  };

  mockSet.mockReturnValue(mutationBuilder);

  // Root methods
  mockSelectFrom.mockReturnValue(queryBuilder);
  mockInsertInto.mockReturnValue(insertBuilder);
  mockUpdateTable.mockReturnValue(mutationBuilder);

  const db: any = {
    selectFrom: mockSelectFrom,
    insertInto: mockInsertInto,
    updateTable: mockUpdateTable,
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
      values: mockValues,
      set: mockSet,
      execute: mockExecute,
      executeTakeFirst: mockExecuteTakeFirst,
      executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
      onConflict: mockOnConflict,
      doUpdateSet: mockDoUpdateSet,
      returningAll: mockReturningAll,
    },
  };
}

// ============================================================================
// Mock Services
// ============================================================================

function createMockRouteCompiler() {
  return {
    resolveLifecycle: vi.fn(),
  };
}

function createMockPolicyGate() {
  return {
    authorize: vi.fn(),
  };
}

function createMockApprovalService() {
  return {
    getInstanceForEntity: vi.fn(),
    createApprovalInstance: vi.fn(),
    getInstance: vi.fn(),
    getTask: vi.fn(),
    makeDecision: vi.fn(),
    setLifecycleManager: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("LifecycleManagerService - Approval Bridge", () => {
  let service: LifecycleManagerService;
  let mockDb: any;
  let mocks: any;
  let mockRouteCompiler: any;
  let mockPolicyGate: any;
  let mockApprovalService: any;

  const testCtx: RequestContext = {
    userId: "user-123",
    tenantId: "tenant-456",
    realmId: "realm-789",
    roles: ["employee"],
  };

  beforeEach(() => {
    const dbSetup = createMockDb();
    mockDb = dbSetup.db;
    mocks = dbSetup.mocks;

    mockRouteCompiler = createMockRouteCompiler();
    mockPolicyGate = createMockPolicyGate();
    mockApprovalService = createMockApprovalService();

    service = new LifecycleManagerService(
      mockDb,
      mockRouteCompiler,
      mockPolicyGate,
    );
    service.setApprovalService(mockApprovalService);
  });

  describe("validateGates - approval bridge", () => {
    const transitionId = "trans-123";
    const entityContext = {
      entityName: "TravelRequest",
      entityId: "req-456",
    };

    it("should create approval instance and block when gate has approval_template_id and no existing instance", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          required_operations: null,
          approval_template_id: "approval-template-1",
          conditions: null,
          threshold_rules: null,
        },
      ]);

      // Setup: no existing approval instance
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce(undefined);

      // Setup: create approval instance succeeds
      mockApprovalService.createApprovalInstance.mockResolvedValueOnce({
        success: true,
        instanceId: "approval-instance-1",
        stageCount: 2,
        taskCount: 3,
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Approval workflow initiated");

      // Verify approval service was called
      expect(mockApprovalService.getInstanceForEntity).toHaveBeenCalledWith(
        "TravelRequest",
        "req-456",
        "tenant-456",
      );

      expect(mockApprovalService.createApprovalInstance).toHaveBeenCalledWith({
        entityName: "TravelRequest",
        entityId: "req-456",
        transitionId,
        approvalTemplateId: "approval-template-1",
        ctx: testCtx,
      });
    });

    it("should block when approval instance is pending (status: open)", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: existing approval instance in open status
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce({
        id: "approval-instance-1",
        tenantId: "tenant-456",
        entityName: "TravelRequest",
        entityId: "req-456",
        status: "open",
        createdAt: new Date(),
        createdBy: "user-123",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Approval pending");

      // Should not create a new instance
      expect(mockApprovalService.createApprovalInstance).not.toHaveBeenCalled();
    });

    it("should allow when approval instance is completed", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: existing approval instance in completed status
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce({
        id: "approval-instance-1",
        tenantId: "tenant-456",
        entityName: "TravelRequest",
        entityId: "req-456",
        status: "completed",
        createdAt: new Date(),
        createdBy: "user-123",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should block when approval instance is canceled (rejected)", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: existing approval instance in canceled status
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce({
        id: "approval-instance-1",
        tenantId: "tenant-456",
        entityName: "TravelRequest",
        entityId: "req-456",
        status: "canceled",
        createdAt: new Date(),
        createdBy: "user-123",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Approval was canceled");
    });

    it("should bypass approval checks when _approvalBypass is true", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          approval_template_id: "approval-template-1",
        },
      ]);

      const ctxWithBypass: RequestContext = {
        ...testCtx,
        metadata: { _approvalBypass: true },
      };

      const result = await service.validateGates(
        transitionId,
        ctxWithBypass,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(true);

      // Approval service should not be called
      expect(mockApprovalService.getInstanceForEntity).not.toHaveBeenCalled();
      expect(mockApprovalService.createApprovalInstance).not.toHaveBeenCalled();
    });

    it("should handle approval creation failure gracefully", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: no existing approval instance
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce(undefined);

      // Setup: create approval instance fails
      mockApprovalService.createApprovalInstance.mockResolvedValueOnce({
        success: false,
        error: "Template not found",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Failed to create approval");
      expect(result.reason).toContain("Template not found");
    });
  });

  describe("validateGates - with required operations and approval", () => {
    const transitionId = "trans-123";
    const entityContext = {
      entityName: "TravelRequest",
      entityId: "req-456",
    };

    it("should check required operations before approval", async () => {
      // Setup: gate with both required operations and approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          required_operations: ["travel.approve"],
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: policy gate denies operation
      mockPolicyGate.authorize.mockResolvedValueOnce({
        allowed: false,
        reason: "User lacks travel.approve permission",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Missing required operation");

      // Approval service should not be called if operation check fails
      expect(mockApprovalService.getInstanceForEntity).not.toHaveBeenCalled();
    });

    it("should proceed to approval check when operations are satisfied", async () => {
      // Setup: gate with both required operations and approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: transitionId,
          required_operations: ["travel.approve"],
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: policy gate allows operation
      mockPolicyGate.authorize.mockResolvedValueOnce({
        allowed: true,
      });

      // Setup: approval instance is completed
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce({
        id: "approval-instance-1",
        tenantId: "tenant-456",
        entityName: "TravelRequest",
        entityId: "req-456",
        status: "completed",
        createdAt: new Date(),
        createdBy: "user-123",
      });

      const result = await service.validateGates(
        transitionId,
        testCtx,
        undefined,
        entityContext,
      );

      expect(result.allowed).toBe(true);

      // Both checks should have been performed
      expect(mockPolicyGate.authorize).toHaveBeenCalledWith(
        "travel.approve",
        "TravelRequest",
        testCtx,
        undefined,
      );
      expect(mockApprovalService.getInstanceForEntity).toHaveBeenCalled();
    });
  });

  describe("validateGates - no gates", () => {
    it("should allow when no gates are defined", async () => {
      // Setup: no gates
      mocks.execute.mockResolvedValueOnce([]);

      const result = await service.validateGates("trans-123", testCtx);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("validateGates - without entity context", () => {
    it("should skip approval check when entity context is not provided", async () => {
      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: "trans-123",
          approval_template_id: "approval-template-1",
        },
      ]);

      const result = await service.validateGates("trans-123", testCtx);

      // Should allow (skip approval check without entity context)
      expect(result.allowed).toBe(true);

      // Approval service should not be called
      expect(mockApprovalService.getInstanceForEntity).not.toHaveBeenCalled();
    });
  });

  describe("requiresApproval", () => {
    it("should return approval template ID when gate requires approval", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce({
        approval_template_id: "approval-template-1",
      });

      const result = await service.requiresApproval("trans-123");

      expect(result).toBe("approval-template-1");

      expect(mocks.selectFrom).toHaveBeenCalledWith(
        "meta.lifecycle_transition_gate",
      );
      expect(mocks.where).toHaveBeenCalledWith(
        "transition_id",
        "=",
        "trans-123",
      );
    });

    it("should return undefined when no approval is required", async () => {
      mocks.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await service.requiresApproval("trans-123");

      expect(result).toBeUndefined();
    });
  });

  describe("integration - transition with approval gate", () => {
    it("should block transition when approval is pending", async () => {
      const entityName = "TravelRequest";
      const entityId = "req-456";
      const operationCode = "APPROVE";

      // Setup: get instance
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "instance-1",
        tenant_id: "tenant-456",
        entity_name: entityName,
        entity_id: entityId,
        lifecycle_id: "lifecycle-1",
        state_id: "state-1",
        updated_at: new Date(),
        updated_by: "user-123",
      });

      // Setup: get current state (not terminal)
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "state-1",
        tenant_id: "tenant-456",
        lifecycle_id: "lifecycle-1",
        code: "DRAFT",
        name: "Draft",
        is_terminal: false,
        sort_order: 1,
        created_at: new Date(),
        created_by: "system",
      });

      // Setup: find transition
      mocks.executeTakeFirst.mockResolvedValueOnce({
        id: "trans-123",
        tenant_id: "tenant-456",
        lifecycle_id: "lifecycle-1",
        from_state_id: "state-1",
        to_state_id: "state-2",
        operation_code: operationCode,
        is_active: true,
        created_at: new Date(),
        created_by: "system",
      });

      // Setup: gate with approval template
      mocks.execute.mockResolvedValueOnce([
        {
          id: "gate-1",
          tenant_id: "tenant-456",
          transition_id: "trans-123",
          approval_template_id: "approval-template-1",
        },
      ]);

      // Setup: existing approval instance in open status
      mockApprovalService.getInstanceForEntity.mockResolvedValueOnce({
        id: "approval-instance-1",
        tenantId: "tenant-456",
        entityName,
        entityId,
        status: "open",
        createdAt: new Date(),
        createdBy: "user-123",
      });

      const result = await service.transition({
        entityName,
        entityId,
        operationCode,
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Approval pending");

      // Instance should not be updated
      expect(mocks.updateTable).not.toHaveBeenCalledWith(
        "core.entity_lifecycle_instance",
      );
    });
  });
});
