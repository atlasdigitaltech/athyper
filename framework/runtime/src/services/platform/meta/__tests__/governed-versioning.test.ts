/**
 * Tests for Governed Versioning System
 *
 * Integration tests for:
 * - Version lifecycle: draft → submit → approve → activate → supersede
 * - Hook recursion protection
 * - Lifecycle cache invalidation
 * - Domain event emission from hooks
 * - Revision reason enforcement for governed entities
 * - Version hash computation
 * - DI fail-fast when VersionedDocumentService is not wired
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { LifecycleManagerService } from "../lifecycle/lifecycle-manager.service.js";
import { VersionedDocumentServiceImpl } from "../lifecycle/versioned-document.service.js";

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

// ============================================================================
// Mock DB Builder — Chainable Kysely-style Query Builder
// ============================================================================

function createMockDb() {
  const results = {
    execute: [] as unknown[],
    executeTakeFirst: undefined as unknown,
  };

  const mockExecute = vi.fn().mockImplementation(() => Promise.resolve(results.execute));
  const mockExecuteTakeFirst = vi.fn().mockImplementation(() => Promise.resolve(results.executeTakeFirst));

  const queryBuilder: any = {
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    distinct: vi.fn().mockReturnThis(),
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
  };

  const insertBuilder: any = {
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnValue({
      columns: vi.fn().mockReturnThis(),
      doUpdateSet: vi.fn().mockReturnValue({
        execute: mockExecute,
      }),
    }),
    execute: mockExecute,
  };

  const mutationBuilder: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: mockExecute,
  };

  const db: any = {
    selectFrom: vi.fn().mockReturnValue(queryBuilder),
    insertInto: vi.fn().mockReturnValue(insertBuilder),
    updateTable: vi.fn().mockReturnValue(mutationBuilder),
  };

  return {
    db,
    queryBuilder,
    insertBuilder,
    mutationBuilder,
    results,
    mockExecute,
    mockExecuteTakeFirst,
  };
}

// ============================================================================
// Mock Services
// ============================================================================

function createMockRouteCompiler() {
  return {
    resolveLifecycle: vi.fn(),
    compile: vi.fn(),
    recompile: vi.fn(),
    getCached: vi.fn(),
    invalidateCache: vi.fn(),
    precompileAll: vi.fn(),
    healthCheck: vi.fn(),
  };
}

function createMockPolicyGate() {
  return {
    authorize: vi.fn().mockResolvedValue({ allowed: true }),
  };
}

function createMockEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    onAny: vi.fn().mockReturnValue(() => {}),
  };
}

function createMockVersionedDocService() {
  return {
    reviseVersion: vi.fn().mockResolvedValue({
      success: true,
      newVersion: { id: "v2-id", versionNo: 2, status: "draft" },
    }),
    freezeVersion: vi.fn().mockResolvedValue(undefined),
    markApproved: vi.fn().mockResolvedValue(undefined),
    promoteToEffective: vi.fn().mockResolvedValue({
      success: true,
      effectiveVersionId: "v1-id",
    }),
    archivePreviousEffective: vi.fn().mockResolvedValue(undefined),
    updateVersionStatus: vi.fn().mockResolvedValue(undefined),
    isFrozen: vi.fn().mockResolvedValue(false),
    getEffectiveVersion: vi.fn().mockResolvedValue(undefined),
    getCurrentDraft: vi.fn().mockResolvedValue(undefined),
    computeVersionHash: vi.fn().mockResolvedValue("abc123hash"),
  };
}

// ============================================================================
// Test Constants
// ============================================================================

const testCtx: RequestContext = {
  userId: "user-123",
  tenantId: "tenant-456",
  realmId: "realm-789",
  roles: ["admin"],
};

/** Default governance columns for hook test data */
const HOOK_GOVERNANCE_DEFAULTS = {
  origin: "system",
  layer_rank: 10,
  contract_role: "extension",
  safety_level: "replaceable",
  overlay_id: null,
};

// ============================================================================
// Tests: Hook Execution & Event Emission
// ============================================================================

describe("LifecycleManagerService - Governed Versioning Hooks", () => {
  let service: LifecycleManagerService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockRouteCompiler: ReturnType<typeof createMockRouteCompiler>;
  let mockPolicyGate: ReturnType<typeof createMockPolicyGate>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockVersionedDocService: ReturnType<typeof createMockVersionedDocService>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockRouteCompiler = createMockRouteCompiler();
    mockPolicyGate = createMockPolicyGate();
    mockEventBus = createMockEventBus();
    mockVersionedDocService = createMockVersionedDocService();

    service = new LifecycleManagerService(
      mockDb.db,
      mockRouteCompiler as any,
      mockPolicyGate as any,
    );
    service.setVersionedDocumentService(mockVersionedDocService as any);
    service.setEventBus(mockEventBus as any);
  });

  describe("hook recursion protection", () => {
    it("should skip hooks when _hookExecution flag is set in context", async () => {
      // Access private method via casting
      const svc = service as any;

      // Call executeHooks with _hookExecution flag
      const hookCtx = {
        ...testCtx,
        metadata: { _hookExecution: true },
      };

      // Set up DB to return hooks (should never be queried)
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-1",
          transition_id: "trans-1",
          timing: "on_success",
          action: "freeze_version",
          config: null,
          sort_order: 10,
          is_active: true,
        },
      ]);

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        hookCtx,
      );

      // Hook query should NOT have been made — recursion guard skipped it
      expect(mockDb.db.selectFrom).not.toHaveBeenCalled();
      expect(mockVersionedDocService.freezeVersion).not.toHaveBeenCalled();
    });

    it("should execute hooks normally when _hookExecution flag is NOT set", async () => {
      const svc = service as any;

      // DB returns one hook + empty overrides
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-1",
          transition_id: "trans-1",
          timing: "on_success",
          action: "freeze_version",
          config: { reason: "submitted_for_review" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockVersionedDocService.freezeVersion).toHaveBeenCalledWith(
        "ver-1",
        "submitted_for_review",
        expect.objectContaining({
          metadata: expect.objectContaining({ _hookExecution: true }),
        }),
      );
    });
  });

  describe("emit_event hook action", () => {
    it("should emit version.approved event via MetaEventBus", async () => {
      const svc = service as any;

      // DB returns emit_event hook + empty overrides
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-2",
          transition_id: "trans-approve",
          timing: "on_success",
          action: "emit_event",
          config: { event_type: "version.approved" },
          sort_order: 30,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-approve",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "version.approved",
          entityName: "MetaEntityVersion",
          entityId: "ver-1",
          tenantId: "tenant-456",
        }),
      );
    });

    it("should emit version.effective event for version.activated", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-3",
          transition_id: "trans-activate",
          timing: "on_success",
          action: "emit_event",
          config: { event_type: "version.activated" },
          sort_order: 40,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-activate",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "version.effective",
        }),
      );
    });

    it("should fallback to lifecycle.transitioned for unknown event types", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-4",
          transition_id: "trans-custom",
          timing: "on_success",
          action: "emit_event",
          config: { event_type: "custom.event" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-custom",
        "on_success",
        { entityName: "SomeEntity", entityId: "ent-1" },
        testCtx,
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lifecycle.transitioned",
          operationCode: "custom.event",
        }),
      );
    });
  });

  describe("DI fail-fast guard", () => {
    it("should throw when version hook is called without VersionedDocumentService", async () => {
      // Create a service WITHOUT wiring the versioned doc service
      const unwiredService = new LifecycleManagerService(
        mockDb.db,
        mockRouteCompiler as any,
        mockPolicyGate as any,
      );

      const svc = unwiredService as any;

      // DB returns a version-related hook + empty overrides
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-5",
          transition_id: "trans-1",
          timing: "on_success",
          action: "freeze_version",
          config: null,
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      // executeHooks catches errors (best-effort), so it won't throw
      // But the inner executeHookAction WILL throw — check via spy
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      // The error should have been logged (caught by best-effort handler)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("lifecycle_hook_error"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("hook action delegation", () => {
    it("should delegate freeze_version to VersionedDocumentService", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-freeze",
          transition_id: "trans-submit",
          timing: "on_success",
          action: "freeze_version",
          config: { reason: "submitted_for_review" },
          sort_order: 20,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-submit",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockVersionedDocService.freezeVersion).toHaveBeenCalledWith(
        "ver-1",
        "submitted_for_review",
        expect.objectContaining({ userId: "user-123" }),
      );
    });

    it("should delegate mark_version_approved to VersionedDocumentService", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-approve",
          transition_id: "trans-approve",
          timing: "on_success",
          action: "mark_version_approved",
          config: null,
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-approve",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockVersionedDocService.markApproved).toHaveBeenCalledWith(
        "ver-1",
        expect.objectContaining({ userId: "user-123" }),
      );
    });

    it("should delegate update_version_status with target from config", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-status",
          transition_id: "trans-status",
          timing: "on_success",
          action: "update_version_status",
          config: { target_status: "in_review" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-status",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(mockVersionedDocService.updateVersionStatus).toHaveBeenCalledWith(
        "ver-1",
        "in_review",
        expect.objectContaining({ userId: "user-123" }),
      );
    });

    it("should execute multiple hooks in sort_order", async () => {
      const svc = service as any;
      const callOrder: string[] = [];

      mockVersionedDocService.updateVersionStatus.mockImplementation(async () => {
        callOrder.push("update_version_status");
      });
      mockVersionedDocService.freezeVersion.mockImplementation(async () => {
        callOrder.push("freeze_version");
      });

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-a",
          transition_id: "trans-submit",
          timing: "on_success",
          action: "update_version_status",
          config: { target_status: "in_review" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
        {
          id: "hook-b",
          transition_id: "trans-submit",
          timing: "on_success",
          action: "freeze_version",
          config: { reason: "submitted_for_review" },
          sort_order: 20,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      await svc.executeHooks(
        "trans-submit",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      expect(callOrder).toEqual(["update_version_status", "freeze_version"]);
    });
  });

  describe("spawn_next_draft hook", () => {
    it("should call reviseVersion with correct entity lineage", async () => {
      const svc = service as any;

      // DB returns the hook + empty overrides
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-revise",
          transition_id: "trans-revise",
          timing: "on_success",
          action: "spawn_next_draft",
          config: { copy_fields: true, copy_relations: true, copy_indexes: true },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

      // The hook queries meta.entity_version to get entity_id
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        entity_id: "entity-root-id",
        id: "ver-effective-id",
      });

      await svc.executeHooks(
        "trans-revise",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-effective-id" },
        testCtx,
      );

      expect(mockVersionedDocService.reviseVersion).toHaveBeenCalledWith({
        entityId: "entity-root-id",
        basedOnVersionId: "ver-effective-id",
        changeSummary: "Auto-created revision",
        ctx: expect.objectContaining({
          metadata: expect.objectContaining({ _hookExecution: true }),
        }),
      });
    });
  });
});

// ============================================================================
// Tests: VersionedDocumentServiceImpl
// ============================================================================

describe("VersionedDocumentServiceImpl", () => {
  let service: VersionedDocumentServiceImpl;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new VersionedDocumentServiceImpl(mockDb.db);
  });

  describe("reviseVersion — revision reason enforcement", () => {
    it("should reject revision without change_type for governed entities", async () => {
      // Source version exists and is effective
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        id: "v1-id",
        entity_id: "entity-1",
        tenant_id: "tenant-456",
        version_no: 1,
        status: "effective",
        behaviors: {},
      });

      // Entity has governed versioning policy
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        feature_flags: {
          versioning_policy: { mode: "governed" },
        },
      });

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-id",
        changeSummary: "This is a sufficiently long change summary for governance.",
        // changeType is missing!
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("change_type is required");
    });

    it("should reject revision with short change_summary for governed entities", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        id: "v1-id",
        entity_id: "entity-1",
        tenant_id: "tenant-456",
        version_no: 1,
        status: "effective",
        behaviors: {},
      });

      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        feature_flags: {
          versioning_policy: { mode: "governed" },
        },
      });

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-id",
        changeSummary: "too short",
        changeType: "major",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least 20 characters");
    });

    it("should allow revision without change_type for non-governed entities", async () => {
      // Source version
      mockDb.mockExecuteTakeFirst
        .mockResolvedValueOnce({
          id: "v1-id",
          entity_id: "entity-1",
          tenant_id: "tenant-456",
          version_no: 1,
          status: "effective",
          behaviors: {},
        })
        // Entity with simple versioning
        .mockResolvedValueOnce({
          feature_flags: {
            versioning_policy: { mode: "simple" },
          },
        })
        // No existing draft
        .mockResolvedValueOnce(undefined)
        // entity_publish_state
        .mockResolvedValueOnce({ latest_version_no: 1 });

      // Step 5: insertInto("meta.entity_version").execute()
      // Steps 6-8: selectFrom fields, relations, indexes
      // Step 9: updateTable entity_publish_state
      mockDb.mockExecute
        .mockResolvedValueOnce(undefined) // insert new version
        .mockResolvedValueOnce([])        // clone fields
        .mockResolvedValueOnce([])        // clone relations
        .mockResolvedValueOnce([])        // clone indexes
        .mockResolvedValueOnce(undefined); // update entity_publish_state

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-id",
        // No changeSummary or changeType
        ctx: testCtx,
      });

      expect(result.success).toBe(true);
      expect(result.newVersion).toBeDefined();
      expect(result.newVersion!.versionNo).toBe(2);
    });

    it("should accept valid governed revision with full reason", async () => {
      mockDb.mockExecuteTakeFirst
        .mockResolvedValueOnce({
          id: "v1-id",
          entity_id: "entity-1",
          tenant_id: "tenant-456",
          version_no: 1,
          status: "effective",
          behaviors: {},
        })
        .mockResolvedValueOnce({
          feature_flags: {
            versioning_policy: { mode: "governed" },
          },
        })
        .mockResolvedValueOnce(undefined) // no existing draft
        .mockResolvedValueOnce({ latest_version_no: 1 });

      mockDb.mockExecute.mockResolvedValue([]);

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-id",
        changeSummary: "Added new required field 'tax_id' for compliance requirements.",
        changeType: "major",
        ctx: testCtx,
      });

      expect(result.success).toBe(true);
      expect(result.newVersion).toBeDefined();
    });
  });

  describe("reviseVersion — source validation", () => {
    it("should reject revision of draft version", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        id: "v1-draft",
        entity_id: "entity-1",
        tenant_id: "tenant-456",
        version_no: 1,
        status: "draft",
        behaviors: {},
      });

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-draft",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot revise version in 'draft' status");
    });

    it("should reject when source version not found", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce(undefined);

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "nonexistent",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Source version not found");
    });

    it("should reject when active draft already exists", async () => {
      mockDb.mockExecuteTakeFirst
        .mockResolvedValueOnce({
          id: "v1-id",
          entity_id: "entity-1",
          tenant_id: "tenant-456",
          version_no: 1,
          status: "effective",
          behaviors: {},
        })
        // Entity (non-governed)
        .mockResolvedValueOnce({
          feature_flags: { versioning_policy: { mode: "simple" } },
        })
        // Existing draft found
        .mockResolvedValueOnce({ id: "v2-draft-id" });

      const result = await service.reviseVersion({
        entityId: "entity-1",
        basedOnVersionId: "v1-id",
        ctx: testCtx,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Active draft already exists");
    });
  });

  describe("promoteToEffective", () => {
    it("should supersede previous effective version", async () => {
      // Load version
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        id: "v2-id",
        entity_id: "entity-1",
        tenant_id: "tenant-456",
        version_no: 2,
        status: "approved",
      });

      // archivePreviousEffective: find current effective
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        id: "v1-id",
        version_no: 1,
      });

      // archivePreviousEffective: update old effective
      mockDb.mockExecute.mockResolvedValueOnce(undefined);
      // promoteToEffective: update new version
      mockDb.mockExecute.mockResolvedValueOnce(undefined);
      // update entity_publish_state
      mockDb.mockExecute.mockResolvedValueOnce(undefined);

      const result = await service.promoteToEffective("v2-id", testCtx);

      expect(result.success).toBe(true);
      expect(result.supersededVersionId).toBe("v1-id");
    });
  });

  describe("isFrozen", () => {
    it("should return true for non-draft versions", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({ status: "approved" });
      expect(await service.isFrozen("ver-1", "tenant-456")).toBe(true);
    });

    it("should return false for draft versions", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({ status: "draft" });
      expect(await service.isFrozen("ver-1", "tenant-456")).toBe(false);
    });

    it("should return true for nonexistent versions", async () => {
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce(undefined);
      expect(await service.isFrozen("nonexistent", "tenant-456")).toBe(true);
    });
  });

  describe("computeVersionHash", () => {
    it("should compute SHA-256 hash from fields + relations + indexes + behaviors", async () => {
      // version behaviors
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
        behaviors: { display_name_field: "name" },
      });

      // fields
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "f1",
          entity_version_id: "v1",
          name: "name",
          type: "string",
          sort_order: 1,
          created_at: new Date(),
          created_by: "system",
        },
      ]);
      // relations
      mockDb.mockExecute.mockResolvedValueOnce([]);
      // indexes
      mockDb.mockExecute.mockResolvedValueOnce([]);
      // update with hash
      mockDb.mockExecute.mockResolvedValueOnce(undefined);

      const hash = await service.computeVersionHash("v1-id", "tenant-456");

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64); // SHA-256 hex = 64 chars

      // DB should have been updated with the hash
      expect(mockDb.db.updateTable).toHaveBeenCalledWith("meta.entity_version");
    });

    it("should produce different hashes for different content", async () => {
      // First call
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({ behaviors: { a: 1 } });
      mockDb.mockExecute
        .mockResolvedValueOnce([{ id: "f1", name: "x", type: "string", sort_order: 1, created_at: new Date(), created_by: "s", entity_version_id: "v1" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined);

      const hash1 = await service.computeVersionHash("v1", "t1");

      // Second call with different content
      mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({ behaviors: { a: 2 } });
      mockDb.mockExecute
        .mockResolvedValueOnce([{ id: "f2", name: "y", type: "number", sort_order: 1, created_at: new Date(), created_by: "s", entity_version_id: "v2" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined);

      const hash2 = await service.computeVersionHash("v2", "t1");

      expect(hash1).not.toBe(hash2);
    });
  });
});

// ============================================================================
// Tests: Lifecycle Cache Invalidation
// ============================================================================

describe("LifecycleManagerService - Cache Invalidation", () => {
  let service: LifecycleManagerService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockRouteCompiler: ReturnType<typeof createMockRouteCompiler>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockRouteCompiler = createMockRouteCompiler();
    mockEventBus = createMockEventBus();

    service = new LifecycleManagerService(
      mockDb.db,
      mockRouteCompiler as any,
      createMockPolicyGate() as any,
    );
    service.setEventBus(mockEventBus as any);
  });

  describe("invalidateLifecycle", () => {
    it("should recompute hash and cascade to route compiler", async () => {
      // computeDefinitionHash: states, transitions, hooks, overrides
      mockDb.mockExecute
        .mockResolvedValueOnce([{ code: "DRAFT", name: "Draft", is_terminal: false, sort_order: 10 }]) // states
        .mockResolvedValueOnce([{ from_state_id: "s1", to_state_id: "s2", operation_code: "submit", is_active: true }]) // transitions
        .mockResolvedValueOnce([]) // hooks
        .mockResolvedValueOnce([]); // overrides

      // update meta.lifecycle with new hash
      mockDb.mockExecute.mockResolvedValueOnce(undefined);

      // entity bindings for cascade
      mockDb.mockExecute.mockResolvedValueOnce([
        { entity_name: "PurchaseOrder" },
        { entity_name: "Invoice" },
      ]);

      // recompile returns
      mockRouteCompiler.recompile.mockResolvedValue({
        entityName: "PurchaseOrder",
        rules: [],
        compiledHash: "abc",
        generatedAt: new Date(),
      });

      await service.invalidateLifecycle("lc-1", "tenant-456");

      // Should have recompiled routes for all bound entities
      expect(mockRouteCompiler.recompile).toHaveBeenCalledWith("PurchaseOrder", "tenant-456");
      expect(mockRouteCompiler.recompile).toHaveBeenCalledWith("Invoice", "tenant-456");
      expect(mockRouteCompiler.recompile).toHaveBeenCalledTimes(2);

      // Should emit lifecycle.definition_changed event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lifecycle.definition_changed",
          lifecycleId: "lc-1",
          tenantId: "tenant-456",
        }),
      );
    });

    it("should store updated hash in meta.lifecycle", async () => {
      mockDb.mockExecute
        .mockResolvedValueOnce([]) // states
        .mockResolvedValueOnce([]) // transitions
        .mockResolvedValueOnce([]) // hooks
        .mockResolvedValueOnce([]) // overrides
        .mockResolvedValueOnce(undefined) // update lifecycle
        .mockResolvedValueOnce([]); // no entity bindings

      await service.invalidateLifecycle("lc-1", "tenant-456");

      // Should have updated meta.lifecycle
      expect(mockDb.db.updateTable).toHaveBeenCalledWith("meta.lifecycle");
    });
  });
});

// ============================================================================
// Tests: Hook Override Resolution
// ============================================================================

describe("LifecycleManagerService - Hook Override Resolution", () => {
  let service: LifecycleManagerService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockVersionedDocService: ReturnType<typeof createMockVersionedDocService>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockEventBus = createMockEventBus();
    mockVersionedDocService = createMockVersionedDocService();

    service = new LifecycleManagerService(
      mockDb.db,
      createMockRouteCompiler() as any,
      createMockPolicyGate() as any,
    );
    service.setVersionedDocumentService(mockVersionedDocService as any);
    service.setEventBus(mockEventBus as any);
  });

  describe("suppress override", () => {
    it("should skip suppressed hooks", async () => {
      const svc = service as any;

      // Hooks query returns one hook
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-notify",
          transition_id: "trans-1",
          timing: "on_success",
          action: "notify",
          config: { channel: "email" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
          safety_level: "replaceable",
        },
      ]);

      // Overrides query returns suppress directive
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "ovr-1",
          tenant_id: "tenant-456",
          target_hook_id: "hook-notify",
          override_kind: "suppress",
          replacement_action: null,
          replacement_config: null,
          sort_order: 0,
          reason: "Not needed",
          is_active: true,
        },
      ]);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "TestEntity", entityId: "ent-1" },
        testCtx,
      );

      // The suppressed hook's action should NOT have been called
      // (notify is a log-only action, so check that no "lifecycle_hook_executed" was logged for it)
      const executedLogs = consoleSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes("lifecycle_hook_executed"));
      expect(executedLogs).toHaveLength(0);

      consoleSpy.mockRestore();
    });
  });

  describe("replace override", () => {
    it("should execute replacement action instead of original", async () => {
      const svc = service as any;

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-status",
          transition_id: "trans-1",
          timing: "on_success",
          action: "update_version_status",
          config: { target_status: "in_review" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
          safety_level: "replaceable",
        },
      ]);

      // Override: replace update_version_status with emit_event
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "ovr-2",
          tenant_id: "tenant-456",
          target_hook_id: "hook-status",
          override_kind: "replace",
          replacement_action: "emit_event",
          replacement_config: { event_type: "custom.status_changed" },
          sort_order: 0,
          reason: "Custom event instead",
          is_active: true,
        },
      ]);

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "TestEntity", entityId: "ent-1" },
        testCtx,
      );

      // Original action should NOT have been called
      expect(mockVersionedDocService.updateVersionStatus).not.toHaveBeenCalled();
      // Replacement action (emit_event) should have been called
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe("add_after override", () => {
    it("should execute injected action after original", async () => {
      const svc = service as any;
      const callOrder: string[] = [];

      mockVersionedDocService.freezeVersion.mockImplementation(async () => {
        callOrder.push("freeze_version");
      });

      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-freeze",
          transition_id: "trans-1",
          timing: "on_success",
          action: "freeze_version",
          config: { reason: "review" },
          sort_order: 10,
          is_active: true,
          ...HOOK_GOVERNANCE_DEFAULTS,
          contract_role: "contract",
        },
      ]);

      // Override: add_after with emit_event (valid for contract hooks via add_after on narrowable)
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "ovr-3",
          tenant_id: "tenant-456",
          target_hook_id: "hook-freeze",
          override_kind: "add_after",
          replacement_action: "emit_event",
          replacement_config: { event_type: "custom.frozen" },
          sort_order: 0,
          reason: "Notify after freeze",
          is_active: true,
        },
      ]);

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      // Freeze should have been called (original hook executes)
      expect(mockVersionedDocService.freezeVersion).toHaveBeenCalled();
      // Emit should also have been called (injected after)
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe("deterministic ordering", () => {
    it("should order hooks by layer_rank then sort_order", async () => {
      const svc = service as any;
      const callOrder: string[] = [];

      mockVersionedDocService.updateVersionStatus.mockImplementation(async () => {
        callOrder.push("update_version_status");
      });
      mockVersionedDocService.freezeVersion.mockImplementation(async () => {
        callOrder.push("freeze_version");
      });

      // Hooks returned with mixed layer_rank order — resolver should sort correctly
      mockDb.mockExecute.mockResolvedValueOnce([
        {
          id: "hook-system",
          transition_id: "trans-1",
          timing: "on_success",
          action: "freeze_version",
          config: { reason: "review" },
          sort_order: 10,
          is_active: true,
          origin: "system",
          layer_rank: 10,
          contract_role: "extension",
          safety_level: "replaceable",
          overlay_id: null,
        },
        {
          id: "hook-tenant",
          transition_id: "trans-1",
          timing: "on_success",
          action: "update_version_status",
          config: { target_status: "in_review" },
          sort_order: 1000,
          is_active: true,
          origin: "tenant",
          layer_rank: 20,
          contract_role: "extension",
          safety_level: "replaceable",
          overlay_id: null,
        },
      ]);
      mockDb.mockExecute.mockResolvedValueOnce([]); // no overrides

      await svc.executeHooks(
        "trans-1",
        "on_success",
        { entityName: "MetaEntityVersion", entityId: "ver-1" },
        testCtx,
      );

      // System hooks (layer_rank=10) should execute before tenant hooks (layer_rank=20)
      expect(callOrder).toEqual(["freeze_version", "update_version_status"]);
    });
  });
});

// ============================================================================
// Tests: Finance Hook Actions
// ============================================================================

describe("LifecycleManagerService - Finance Hook Actions", () => {
  let service: LifecycleManagerService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockEventBus = createMockEventBus();

    service = new LifecycleManagerService(
      mockDb.db,
      createMockRouteCompiler() as any,
      createMockPolicyGate() as any,
    );
    service.setVersionedDocumentService(createMockVersionedDocService() as any);
    service.setEventBus(mockEventBus as any);
  });

  it.each([
    ["lock_document", "document.locked"],
    ["unlock_document", "document.unlocked"],
    ["sync_document_registry", "document.registry_sync_requested"],
    ["create_journal_entry", "document.journal_entry_requested"],
    ["create_reversal_entry", "document.reversal_entry_requested"],
  ])("should emit %s domain event for %s action", async (action, expectedEvent) => {
    const svc = service as any;

    mockDb.mockExecute.mockResolvedValueOnce([
      {
        id: `hook-${action}`,
        transition_id: "trans-1",
        timing: "on_success",
        action,
        config: null,
        sort_order: 10,
        is_active: true,
        ...HOOK_GOVERNANCE_DEFAULTS,
      },
    ]);
    mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

    await svc.executeHooks(
      "trans-1",
      "on_success",
      { entityName: "PurchaseInvoice", entityId: "inv-1" },
      testCtx,
    );

    // Should emit via EventBus (fallback to lifecycle.transitioned for unknown event types)
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lifecycle.transitioned",
        operationCode: expectedEvent,
      }),
    );
  });

  it("should dispatch unregistered actions via registry lookup", async () => {
    const svc = service as any;

    // Hook with a custom action not in the switch/case
    mockDb.mockExecute.mockResolvedValueOnce([
      {
        id: "hook-custom",
        transition_id: "trans-1",
        timing: "on_success",
        action: "custom_tenant_action",
        config: null,
        sort_order: 10,
        is_active: true,
        ...HOOK_GOVERNANCE_DEFAULTS,
      },
    ]);
    mockDb.mockExecute.mockResolvedValueOnce([]); // overrides

    // Registry lookup returns an emit_event handler
    mockDb.mockExecuteTakeFirst.mockResolvedValueOnce({
      id: "reg-1",
      action_key: "custom_tenant_action",
      handler_type: "emit_event",
      handler_config: { event_type: "custom.action_fired" },
      is_active: true,
      origin: "tenant",
      tenant_id: "tenant-456",
    });

    await svc.executeHooks(
      "trans-1",
      "on_success",
      { entityName: "CustomEntity", entityId: "cust-1" },
      testCtx,
    );

    // Should have emitted via EventBus from registry dispatch
    expect(mockEventBus.emit).toHaveBeenCalled();
  });
});
