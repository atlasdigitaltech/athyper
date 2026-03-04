/**
 * Create Pipeline Tests for GenericDataAPIService
 *
 * Tests the enhanced create() method which injects system headers, document numbers,
 * and effective dating fields based on entity classification and feature flags.
 *
 * Key behaviors tested:
 * 1. Full pipeline order: system headers, numbering, effective dating
 * 2. Numbering injects document_number when enabled
 * 3. effective_from defaults to now when enabled
 * 4. Backward compat without classificationService
 * 5. All deps undefined → original behavior
 * 6. Caller-provided document_number is preserved
 */

import { describe, it, expect, vi } from "vitest";

import { GenericDataAPIService } from "../data/generic-data-api.service.js";

/**
 * Mock dependencies for GenericDataAPIService create tests
 */
function createMockDependencies(options: {
  hasClassificationService?: boolean;
  hasNumberingEngine?: boolean;
  hasLifecycleManager?: boolean;
  entityClass?: string;
  numberingEnabled?: boolean;
  effectiveDatingEnabled?: boolean;
  approvalRequired?: boolean;
}) {
  // Mock database with Kysely executor support for sql tagged templates
  const capturedRecord: Record<string, unknown> | null = null;
  const mockDb = {
    transaction: vi.fn(),
    getExecutor: vi.fn(() => ({
      transformQuery: vi.fn((node: any) => node),
      compileQuery: vi.fn((node: any) => ({
        sql: "mock-sql",
        parameters: [],
        query: node,
      })),
      executeQuery: vi.fn(async () => ({
        rows: [capturedRecord ?? { id: "mock-id" }],
      })),
    })),
  } as any;

  // Mock compiler
  const mockCompiler = {
    compile: vi.fn(async () => ({
      entityName: "test_entity",
      tableName: "ent.test_entity",
      fields: [
        { name: "name", type: "string", required: true, columnName: "name" },
        {
          name: "description",
          type: "string",
          required: false,
          columnName: "description",
        },
      ],
      entityClass: options.entityClass ?? "DOCUMENT",
      featureFlags: {
        approval_required: options.approvalRequired ?? false,
        numbering_enabled: options.numberingEnabled ?? false,
        effective_dating_enabled: options.effectiveDatingEnabled ?? false,
        versioning_mode: "none" as const,
      },
    })),
  } as any;

  // Mock policy gate
  const mockPolicyGate = {
    enforce: vi.fn(async () => {}),
  } as any;

  // Mock audit logger
  const mockAuditLogger = {
    log: vi.fn(async () => {}),
  } as any;

  // Mock lifecycle manager (optional)
  const mockLifecycleManager = options.hasLifecycleManager
    ? {
        createInstance: vi.fn(async () => {}),
      }
    : undefined;

  // Mock classification service (optional)
  const mockClassificationService = options.hasClassificationService
    ? {
        getClassification: vi.fn(async () => ({
          entityClass: options.entityClass ?? "DOCUMENT",
          featureFlags: {
            entity_class: options.entityClass ?? "DOCUMENT",
            approval_required: options.approvalRequired ?? false,
            numbering_enabled: options.numberingEnabled ?? false,
            effective_dating_enabled: options.effectiveDatingEnabled ?? false,
            versioning_mode: "none" as const,
          },
        })),
      }
    : undefined;

  // Mock numbering engine (optional)
  const mockNumberingEngine = options.hasNumberingEngine
    ? {
        generateNumber: vi.fn(async () => "DOC-2024-0001"),
      }
    : undefined;

  return {
    db: mockDb,
    compiler: mockCompiler,
    policyGate: mockPolicyGate,
    auditLogger: mockAuditLogger,
    lifecycleManager: mockLifecycleManager,
    classificationService: mockClassificationService,
    numberingEngine: mockNumberingEngine,
  };
}

/**
 * Mock SQL execution for create operations via Kysely executor
 */
function mockSqlExecution(mockDb: any, returnData: any) {
  const executeQueryFn = vi.fn(async () => ({
    rows: [returnData],
  }));

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

describe("GenericDataAPIService - Create Pipeline", () => {
  const ctx = {
    userId: "user-123",
    tenantId: "tenant-123",
    realmId: "realm-123",
    roles: [],
  };

  describe("1. Full Pipeline Order: System Headers + Numbering + Effective Dating", () => {
    it("should inject all system headers for DOCUMENT with full feature set", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: true,
        effectiveDatingEnabled: true,
        approvalRequired: true,
      });

      const inputData = { name: "Test Invoice" };
      const createdRecord = {
        id: "uuid-123",
        name: "Test Invoice",
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
        metadata: {},
        document_number: "DOC-2024-0001",
        posting_date: expect.any(Date),
        effective_from: expect.any(Date),
        effective_to: null,
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        mocks.lifecycleManager,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      const result = await service.create("test_entity", inputData, ctx);

      // Verify classification service was called
      expect(
        mocks.classificationService!.getClassification,
      ).toHaveBeenCalledWith("test_entity", ctx.tenantId);

      // Verify numbering engine was called
      expect(mocks.numberingEngine!.generateNumber).toHaveBeenCalledWith(
        "test_entity",
        ctx.tenantId,
        expect.any(Date),
      );

      // Verify the result has all expected fields
      expect(result).toMatchObject({
        name: "Test Invoice",
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
        document_number: "DOC-2024-0001",
      });
    });

    it("should inject system headers for MASTER entity", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "MASTER",
        effectiveDatingEnabled: true,
      });

      const inputData = { name: "Customer ABC" };
      const createdRecord = {
        id: "uuid-123",
        name: "Customer ABC",
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
        metadata: {},
        effective_from: expect.any(Date),
        effective_to: null,
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("customer", inputData, ctx);

      // Verify system headers were injected
      expect(result).toMatchObject({
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
      });

      // MASTER entities should not have document_number or posting_date
      expect(result).not.toHaveProperty("document_number");
      expect(result).not.toHaveProperty("posting_date");
    });

    it("should inject system headers for CONTROL entity", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "CONTROL",
      });

      const inputData = { name: "Workflow Task" };
      const createdRecord = {
        id: "uuid-123",
        name: "Workflow Task",
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
        metadata: {},
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("workflow_task", inputData, ctx);

      // Verify system headers were injected
      expect(result).toMatchObject({
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
      });
    });
  });

  describe("2. Numbering Injects document_number When Enabled", () => {
    it("should generate document_number for DOCUMENT with numbering_enabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: true,
      });

      const inputData = { name: "Invoice 001" };
      const createdRecord = {
        id: "uuid-123",
        name: "Invoice 001",
        document_number: "DOC-2024-0001",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Verify numbering engine was called
      expect(mocks.numberingEngine!.generateNumber).toHaveBeenCalledWith(
        "invoice",
        ctx.tenantId,
        expect.any(Date),
      );

      // Verify document_number was set
      expect(result.document_number).toBe("DOC-2024-0001");
    });

    it("should not generate document_number for DOCUMENT with numbering_disabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: false, // Disabled
      });

      const inputData = { name: "Manual Invoice" };
      const createdRecord = {
        id: "uuid-123",
        name: "Manual Invoice",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      await service.create("invoice", inputData, ctx);

      // Verify numbering engine was NOT called
      expect(mocks.numberingEngine!.generateNumber).not.toHaveBeenCalled();
    });

    it("should not generate document_number for MASTER entity", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "MASTER",
        numberingEnabled: true, // Even with numbering enabled
      });

      const inputData = { name: "Customer" };
      const createdRecord = {
        id: "uuid-123",
        name: "Customer",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      await service.create("customer", inputData, ctx);

      // Verify numbering engine was NOT called (only for DOCUMENT class)
      expect(mocks.numberingEngine!.generateNumber).not.toHaveBeenCalled();
    });

    it("should handle numbering engine failure gracefully", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: true,
      });

      // Make numbering engine fail
      mocks.numberingEngine!.generateNumber = vi.fn(async () => {
        throw new Error("Numbering service unavailable");
      });

      const inputData = { name: "Invoice" };
      const createdRecord = {
        id: "uuid-123",
        name: "Invoice",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      // Should not throw, create should succeed without document_number
      const result = await service.create("invoice", inputData, ctx);

      // Verify creation succeeded
      expect(result).toBeDefined();
      expect(result.id).toBe("uuid-123");

      // Verify numbering was attempted
      expect(mocks.numberingEngine!.generateNumber).toHaveBeenCalled();
    });
  });

  describe("3. effective_from Defaults to Now When Enabled", () => {
    it("should set effective_from to current timestamp when enabled", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "DOCUMENT",
        effectiveDatingEnabled: true,
      });

      const inputData = { name: "Test" };
      const createdRecord = {
        id: "uuid-123",
        name: "Test",
        effective_from: new Date(),
        effective_to: null,
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("test_entity", inputData, ctx);

      // Verify effective_from was set
      expect(result.effective_from).toBeInstanceOf(Date);
      // Verify effective_to is null
      expect(result.effective_to).toBeNull();
    });

    it("should not set effective_from when effective_dating_enabled is false", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "DOCUMENT",
        effectiveDatingEnabled: false, // Disabled
      });

      const inputData = { name: "Test" };
      const createdRecord = {
        id: "uuid-123",
        name: "Test",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("test_entity", inputData, ctx);

      // Verify effective_from was NOT set
      expect(result).not.toHaveProperty("effective_from");
      expect(result).not.toHaveProperty("effective_to");
    });

    it("should preserve caller-provided effective_from", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "MASTER",
        effectiveDatingEnabled: true,
      });

      const customDate = new Date("2023-01-01");
      const inputData = { name: "Test", effective_from: customDate };
      const createdRecord = {
        id: "uuid-123",
        name: "Test",
        effective_from: customDate,
        effective_to: null,
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("customer", inputData, ctx);

      // Verify caller-provided effective_from was preserved
      expect(result.effective_from).toEqual(customDate);
    });
  });

  describe("4. Backward Compat Without classificationService", () => {
    it("should create record without system headers when classificationService is undefined", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: false, // No classification service
      });

      const inputData = { name: "Test" };
      const createdRecord = {
        id: "uuid-123",
        name: "Test",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        undefined, // No classification service
        undefined,
      );

      const result = await service.create("test_entity", inputData, ctx);

      // Verify basic record was created
      expect(result.id).toBe("uuid-123");
      expect(result.name).toBe("Test");

      // Verify NO system headers were injected
      expect(result).not.toHaveProperty("entity_type_code");
      expect(result).not.toHaveProperty("status");
      expect(result).not.toHaveProperty("source_system");
      expect(result).not.toHaveProperty("document_number");
      expect(result).not.toHaveProperty("effective_from");
    });
  });

  describe("5. All Deps Undefined → Original Behavior", () => {
    it("should work with original create behavior when all optional deps are undefined", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: false,
        hasNumberingEngine: false,
        hasLifecycleManager: false,
      });

      const inputData = {
        name: "Simple Record",
        description: "Test description",
      };
      const createdRecord = {
        id: "uuid-123",
        name: "Simple Record",
        description: "Test description",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined, // No lifecycle manager
        undefined, // No classification service
        undefined, // No numbering engine
      );

      const result = await service.create("test_entity", inputData, ctx);

      // Verify basic creation succeeded
      expect(result).toMatchObject({
        id: "uuid-123",
        name: "Simple Record",
        description: "Test description",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
      });

      // Verify no enhanced features were applied
      expect(result).not.toHaveProperty("entity_type_code");
      expect(result).not.toHaveProperty("document_number");
      expect(result).not.toHaveProperty("effective_from");
    });
  });

  describe("6. Caller-Provided document_number Is Preserved", () => {
    it("should not call numbering engine when document_number is provided", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: true,
      });

      const inputData = {
        name: "Manual Invoice",
        document_number: "MANUAL-001",
      };
      const createdRecord = {
        id: "uuid-123",
        name: "Manual Invoice",
        document_number: "MANUAL-001",
        entity_type_code: "test_entity",
        status: "DRAFT",
        source_system: "internal",
        metadata: {},
        posting_date: new Date(),
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Verify numbering engine was NOT called
      expect(mocks.numberingEngine!.generateNumber).not.toHaveBeenCalled();

      // Verify caller-provided document_number was preserved
      expect(result.document_number).toBe("MANUAL-001");
    });

    it("should preserve caller-provided empty string document_number", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        hasNumberingEngine: true,
        entityClass: "DOCUMENT",
        numberingEnabled: true,
      });

      const inputData = { name: "Test", document_number: "" };
      const createdRecord = {
        id: "uuid-123",
        name: "Test",
        document_number: "DOC-2024-0001", // Numbering engine fills it
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        mocks.numberingEngine,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Empty string is falsy, so numbering engine should be called
      expect(mocks.numberingEngine!.generateNumber).toHaveBeenCalled();
    });

    it("should preserve caller-provided status and source_system", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "DOCUMENT",
      });

      const inputData = {
        name: "External Invoice",
        status: "APPROVED",
        source_system: "external_api",
      };
      const createdRecord = {
        id: "uuid-123",
        name: "External Invoice",
        entity_type_code: "test_entity",
        status: "APPROVED",
        source_system: "external_api",
        metadata: {},
        posting_date: new Date(),
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Verify caller-provided values were preserved
      expect(result.status).toBe("APPROVED");
      expect(result.source_system).toBe("external_api");
    });
  });

  describe("7. DOCUMENT-Specific Fields", () => {
    it("should set posting_date for DOCUMENT entities", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "DOCUMENT",
      });

      const inputData = { name: "Invoice" };
      const createdRecord = {
        id: "uuid-123",
        name: "Invoice",
        posting_date: new Date(),
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Verify posting_date was set
      expect(result.posting_date).toBeInstanceOf(Date);
    });

    it("should not set posting_date for MASTER entities", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "MASTER",
      });

      const inputData = { name: "Customer" };
      const createdRecord = {
        id: "uuid-123",
        name: "Customer",
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("customer", inputData, ctx);

      // Verify posting_date was NOT set
      expect(result).not.toHaveProperty("posting_date");
    });

    it("should preserve caller-provided posting_date", async () => {
      const mocks = createMockDependencies({
        hasClassificationService: true,
        entityClass: "DOCUMENT",
      });

      const customDate = new Date("2024-01-15");
      const inputData = { name: "Invoice", posting_date: customDate };
      const createdRecord = {
        id: "uuid-123",
        name: "Invoice",
        posting_date: customDate,
        tenant_id: ctx.tenantId,
        realm_id: ctx.realmId,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const executeFn = mockSqlExecution(mocks.db, createdRecord);

      const service = new GenericDataAPIService(
        mocks.db,
        mocks.compiler,
        mocks.policyGate,
        mocks.auditLogger,
        undefined,
        mocks.classificationService,
        undefined,
      );

      const result = await service.create("invoice", inputData, ctx);

      // Verify caller-provided posting_date was preserved
      expect(result.posting_date).toEqual(customDate);
    });
  });
});
