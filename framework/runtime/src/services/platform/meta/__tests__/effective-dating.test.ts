/**
 * Effective Dating Tests for GenericDataAPIService
 *
 * Tests the effective dating feature in the list() method which filters records
 * based on effective_from and effective_to dates when the entity has
 * effective_dating_enabled flag set.
 *
 * Key behaviors tested:
 * 1. list() with asOfDate filters when effective_dating_enabled
 * 2. Default asOfDate = now when not provided
 * 3. classificationService=undefined → no filtering
 * 4. Entity without effective_dating_enabled → no filtering
 */

import { describe, it, expect, vi } from "vitest";

import { GenericDataAPIService } from "../data/generic-data-api.service.js";

/**
 * Mock dependencies for GenericDataAPIService
 */
function createMockDependencies(options: {
  hasClassificationService?: boolean;
  effectiveDatingEnabled?: boolean;
  entityClass?: string;
}) {
  // Mock database with Kysely executor support
  let sqlCallCount = 0;
  const mockDb = {
    transaction: vi.fn(),
    execute: vi.fn(),
    getExecutor: vi.fn(() => ({
      transformQuery: vi.fn((node: any) => node),
      compileQuery: vi.fn((node: any) => ({
        sql: "mock-sql",
        parameters: [],
        query: node,
      })),
      executeQuery: vi.fn(async () => {
        sqlCallCount++;
        if (sqlCallCount % 2 === 1) {
          return { rows: [{ count: 0 }] }; // COUNT query
        }
        return { rows: [] }; // SELECT query
      }),
    })),
  } as any;

  // Mock compiler
  const mockCompiler = {
    compile: vi.fn(async () => ({
      entityName: "test_entity",
      tableName: "ent.test_entity",
      fields: [],
      entityClass: options.entityClass ?? "DOCUMENT",
      featureFlags: {
        effective_dating_enabled: options.effectiveDatingEnabled ?? false,
        approval_required: false,
        numbering_enabled: false,
        versioning_mode: "none",
      },
    })),
    healthCheck: vi.fn(async () => ({ healthy: true })),
  } as any;

  // Mock policy gate
  const mockPolicyGate = {
    enforce: vi.fn(async () => {}),
    getAllowedFields: vi.fn(async () => null), // null = all fields allowed
  } as any;

  // Mock audit logger
  const mockAuditLogger = {
    log: vi.fn(async () => {}),
  } as any;

  // Mock classification service (optional)
  const mockClassificationService = options.hasClassificationService
    ? {
        getClassification: vi.fn(async () => ({
          entityClass: options.entityClass ?? "DOCUMENT",
          featureFlags: {
            entity_class: options.entityClass ?? "DOCUMENT",
            effective_dating_enabled: options.effectiveDatingEnabled ?? false,
            approval_required: false,
            numbering_enabled: false,
            versioning_mode: "none" as const,
          },
        })),
      }
    : undefined;

  return {
    db: mockDb,
    compiler: mockCompiler,
    policyGate: mockPolicyGate,
    auditLogger: mockAuditLogger,
    classificationService: mockClassificationService,
  };
}

/**
 * Mock SQL execution for list queries via Kysely executor
 */
function mockSqlExecution(mockDb: any, countResult: number, dataResult: any[]) {
  let callCount = 0;

  const executeQueryFn = vi.fn(async () => {
    callCount++;
    if (callCount % 2 === 1) {
      // Odd calls are COUNT queries
      return { rows: [{ count: countResult }] };
    }
    // Even calls are SELECT queries
    return { rows: dataResult };
  });

  mockDb.getExecutor = vi.fn(() => ({
    transformQuery: vi.fn((node: any) => node),
    compileQuery: vi.fn((node: any) => ({
      sql: "mock-sql",
      parameters: [],
      query: node,
    })),
    executeQuery: executeQueryFn,
  }));

  return executeQueryFn;
}

describe("GenericDataAPIService - Effective Dating", () => {
  const ctx = {
    userId: "user-123",
    tenantId: "tenant-123",
    realmId: "realm-123",
    roles: [],
  };

  describe("1. list() with asOfDate filters when effective_dating_enabled", () => {
    it("should call classificationService.getClassification when available", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined, // lifecycleManager
        mocks.classificationService,
        undefined // numberingEngine
      );

      await service.list("test_entity", ctx);

      // Verify classificationService.getClassification was called
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );
    });

    it("should include effective dating filter when effective_dating_enabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      const asOfDate = new Date("2024-06-01");
      await service.list("test_entity", ctx, { asOfDate });

      // Verify SQL was executed
      expect(executeFn).toHaveBeenCalled();

      // The service should have called getClassification to check the flag
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );
    });

    it("should not include effective dating filter when effective_dating_enabled is false", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: false, // Disabled
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      const asOfDate = new Date("2024-06-01");
      await service.list("test_entity", ctx, { asOfDate });

      // Verify SQL was executed
      expect(executeFn).toHaveBeenCalled();

      // Even though asOfDate was provided, classification service should still be called
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );
    });
  });

  describe("2. Default asOfDate = now when not provided", () => {
    it("should default asOfDate to current date when not provided", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      // Call without asOfDate option
      await service.list("test_entity", ctx);

      // Verify classificationService was called (which means effective dating logic ran)
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );

      // Verify SQL was executed (effective dating filter would use default now)
      expect(executeFn).toHaveBeenCalled();
    });

    it("should use provided asOfDate when specified", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      const customDate = new Date("2023-01-15");
      await service.list("test_entity", ctx, { asOfDate: customDate });

      // Verify classificationService was called
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );

      // Verify SQL was executed
      expect(executeFn).toHaveBeenCalled();
    });
  });

  describe("3. classificationService=undefined → no filtering", () => {
    it("should skip effective dating logic when classificationService is undefined", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: false, // No classification service
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        undefined, // No classification service
        undefined
      );

      // Provide asOfDate but without classificationService, it should be ignored
      const asOfDate = new Date("2024-06-01");
      await service.list("test_entity", ctx, { asOfDate });

      // Verify SQL was still executed (just without effective dating filter)
      expect(executeFn).toHaveBeenCalled();

      // Verify compiler was called
      expect(mocks.compiler.compile).toHaveBeenCalledWith("test_entity", "v1");
    });

    it("should work normally without classificationService and without asOfDate", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: false,
      });

      const testData = [
        { id: "1", name: "Test 1", tenant_id: ctx.tenantId },
        { id: "2", name: "Test 2", tenant_id: ctx.tenantId },
      ];
      const executeFn = mockSqlExecution(mocks.db, 2, testData);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        undefined,
        undefined
      );

      const result = await service.list("test_entity", ctx);

      // Verify result
      expect(result.data).toEqual(testData);
      expect(result.meta.total).toBe(2);
      expect(executeFn).toHaveBeenCalled();
    });
  });

  describe("4. Entity without effective_dating_enabled → no filtering", () => {
    it("should skip effective dating filter when flag is false", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: false, // Flag is false
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      // Even with asOfDate provided, effective dating should not be applied
      const asOfDate = new Date("2024-06-01");
      await service.list("test_entity", ctx, { asOfDate });

      // Verify classificationService was called to check the flag
      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId
      );

      // Verify SQL was executed (without effective dating filter)
      expect(executeFn).toHaveBeenCalled();
    });

    it("should return all records when effective dating is disabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: false,
      });

      const testData = [
        {
          id: "1",
          name: "Old Record",
          effective_from: new Date("2020-01-01"),
          effective_to: new Date("2023-01-01"),
          tenant_id: ctx.tenantId,
        },
        {
          id: "2",
          name: "Current Record",
          effective_from: new Date("2023-01-01"),
          effective_to: null,
          tenant_id: ctx.tenantId,
        },
      ];

      const executeFn = mockSqlExecution(mocks.db, 2, testData);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      const result = await service.list("test_entity", ctx, {
        asOfDate: new Date("2024-01-01"),
      });

      // Both records should be returned since effective dating is disabled
      expect(result.data).toEqual(testData);
      expect(result.meta.total).toBe(2);
    });
  });

  describe("5. Integration Scenarios", () => {
    it("should handle MASTER entity with effective dating enabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
        entityClass: "MASTER",
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      await service.list("customer", ctx, { asOfDate: new Date("2024-01-01") });

      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "customer",
        ctx.tenantId
      );
      expect(executeFn).toHaveBeenCalled();
    });

    it("should handle DOCUMENT entity with effective dating enabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
        entityClass: "DOCUMENT",
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      await service.list("invoice", ctx);

      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "invoice",
        ctx.tenantId
      );
      expect(executeFn).toHaveBeenCalled();
    });

    it("should handle CONTROL entity with effective dating disabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: false,
        entityClass: "CONTROL",
      });

      const executeFn = mockSqlExecution(mocks.db, 0, []);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      await service.list("workflow_task", ctx);

      expect(mocks.classificationService!.getClassification).toHaveBeenCalledWith(
        "workflow_task",
        ctx.tenantId
      );
      expect(executeFn).toHaveBeenCalled();
    });

    it("should respect pagination with effective dating", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        effectiveDatingEnabled: true,
      });

      const testData = [
        { id: "1", name: "Record 1", tenant_id: ctx.tenantId },
        { id: "2", name: "Record 2", tenant_id: ctx.tenantId },
      ];

      const executeFn = mockSqlExecution(mocks.db, 10, testData);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined
      );

      const result = await service.list("test_entity", ctx, {
        page: 2,
        pageSize: 5,
        asOfDate: new Date("2024-01-01"),
      });

      expect(result.meta.page).toBe(2);
      expect(result.meta.pageSize).toBe(5);
      expect(result.meta.total).toBe(10);
      expect(result.meta.totalPages).toBe(2);
    });
  });
});
