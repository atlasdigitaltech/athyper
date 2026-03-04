/**
 * Generic Data API — CRUD Operations Tests
 *
 * Tests list, get, count, create, update, delete, and restore.
 * Uses the ordered-SQL-results pattern from cascade-delete.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

import { GenericDataAPIService } from "../data/generic-data-api.service.js";

import type { CompiledModel, RequestContext } from "@athyper/core/meta";

// ============================================================================
// Test Helpers
// ============================================================================

const ctx: RequestContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  realmId: "realm-1",
  roles: [],
};

function makeCompiledModel(name = "test_entity"): CompiledModel {
  return {
    entityName: name,
    version: "v1",
    tableName: `ent_${name}`,
    fields: [
      { name: "id", columnName: "id", type: "uuid", required: true, selectAs: '"id" as "id"' },
      { name: "tenant_id", columnName: "tenant_id", type: "uuid", required: true, selectAs: '"tenant_id"' },
      { name: "realm_id", columnName: "realm_id", type: "string", required: true, selectAs: '"realm_id"' },
      { name: "title", columnName: "title", type: "string", required: true, selectAs: '"title" as "title"' },
      { name: "amount", columnName: "amount", type: "number", required: false, selectAs: '"amount" as "amount"' },
      { name: "version", columnName: "version", type: "number", required: true, selectAs: '"version" as "version"' },
      { name: "created_at", columnName: "created_at", type: "datetime", required: true, selectAs: '"created_at"' },
      { name: "created_by", columnName: "created_by", type: "string", required: true, selectAs: '"created_by"' },
      { name: "updated_at", columnName: "updated_at", type: "datetime", required: true, selectAs: '"updated_at"' },
      { name: "updated_by", columnName: "updated_by", type: "string", required: true, selectAs: '"updated_by"' },
      { name: "deleted_at", columnName: "deleted_at", type: "datetime", required: false, selectAs: '"deleted_at"' },
      { name: "deleted_by", columnName: "deleted_by", type: "string", required: false, selectAs: '"deleted_by"' },
    ],
    policies: [],
    selectFragment: '"id","title","amount"',
    fromFragment: '"ent_test_entity"',
    tenantFilterFragment: "tenant_id = $tenant_id",
    indexes: [],
    compiledAt: new Date(),
    compiledBy: "system",
    hash: "abc123",
  } as any;
}

function buildService(sqlResults: Array<{ rows: any[] }>) {
  let callIndex = 0;

  const executeQueryFn = vi.fn(async () => {
    const result = sqlResults[callIndex] ?? { rows: [] };
    callIndex++;
    return result;
  });

  const db = {
    getExecutor: vi.fn(() => ({
      transformQuery: vi.fn((node: any) => node),
      compileQuery: vi.fn((node: any) => ({
        sql: "mock-sql",
        parameters: [],
        query: node,
      })),
      executeQuery: executeQueryFn,
    })),
    transaction: vi.fn(),
  } as any;

  const compiler = {
    compile: vi.fn(async () => makeCompiledModel()),
    healthCheck: vi.fn(async () => ({ healthy: true, message: "ok" })),
  } as any;

  const policyGate = {
    enforce: vi.fn(async () => {}),
    authorizeMany: vi.fn(async () => new Map()),
  } as any;

  const auditLogger = {
    log: vi.fn(async () => {}),
  } as any;

  const service = new GenericDataAPIService(
    db, compiler, policyGate, auditLogger,
  );

  return {
    service,
    db,
    compiler,
    policyGate,
    auditLogger,
    executeQueryFn,
    getCallIndex: () => callIndex,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("GenericDataAPIService", () => {
  // --------------------------------------------------------------------------
  // list()
  // --------------------------------------------------------------------------

  describe("list()", () => {
    it("should return paginated results", async () => {
      const { service, policyGate, auditLogger, executeQueryFn } = buildService([
        // Count query
        { rows: [{ count: "3" }] },
        // Data query
        {
          rows: [
            { id: "r1", title: "Alpha", amount: 10 },
            { id: "r2", title: "Beta", amount: 20 },
            { id: "r3", title: "Gamma", amount: 30 },
          ],
        },
      ]);

      const result = await service.list("test_entity", ctx);

      expect(result.data.length).toBe(3);
      expect(result.meta.total).toBe(3);
      expect(result.meta.page).toBe(1);
      expect(result.meta.hasNext).toBe(false);
      expect(policyGate.enforce).toHaveBeenCalledWith("read", "test_entity", ctx);
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.read",
          action: "list",
          result: "success",
        }),
      );
    });

    it("should enforce policy before querying", async () => {
      const { service, policyGate } = buildService([]);
      policyGate.enforce.mockRejectedValue(new Error("Access denied"));

      await expect(service.list("test_entity", ctx)).rejects.toThrow("Access denied");
    });

    it("should handle empty results", async () => {
      const { service } = buildService([
        { rows: [{ count: "0" }] },
        { rows: [] },
      ]);

      const result = await service.list("test_entity", ctx);

      expect(result.data.length).toBe(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it("should log audit on failure", async () => {
      const { service, compiler, auditLogger } = buildService([]);
      compiler.compile.mockRejectedValue(new Error("compile failed"));

      await expect(service.list("test_entity", ctx)).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.read",
          action: "list",
          result: "failure",
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // get()
  // --------------------------------------------------------------------------

  describe("get()", () => {
    it("should return a single record by id", async () => {
      const { service, policyGate } = buildService([
        { rows: [{ id: "r1", title: "Alpha", amount: 10 }] },
      ]);

      const result = await service.get("test_entity", "r1", ctx);

      expect(result).toBeDefined();
      expect((result as any).id).toBe("r1");
      expect(policyGate.enforce).toHaveBeenCalledWith("read", "test_entity", ctx);
    });

    it("should return undefined when record not found", async () => {
      const { service } = buildService([{ rows: [] }]);

      const result = await service.get("test_entity", "missing", ctx);

      expect(result).toBeUndefined();
    });

    it("should log audit with found status", async () => {
      const { service, auditLogger } = buildService([
        { rows: [{ id: "r1" }] },
      ]);

      await service.get("test_entity", "r1", ctx);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "get",
          details: expect.objectContaining({ id: "r1", found: true }),
          result: "success",
        }),
      );
    });

    it("should log audit on failure", async () => {
      const { service, compiler, auditLogger } = buildService([]);
      compiler.compile.mockRejectedValue(new Error("oops"));

      await expect(service.get("test_entity", "r1", ctx)).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "get",
          result: "failure",
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // count()
  // --------------------------------------------------------------------------

  describe("count()", () => {
    it("should return the record count", async () => {
      const { service } = buildService([
        { rows: [{ count: "42" }] },
      ]);

      const count = await service.count("test_entity", ctx);

      expect(count).toBe(42);
    });

    it("should enforce read policy", async () => {
      const { service, policyGate } = buildService([]);
      policyGate.enforce.mockRejectedValue(new Error("Denied"));

      await expect(service.count("test_entity", ctx)).rejects.toThrow("Denied");
    });

    it("should return 0 for empty results", async () => {
      const { service } = buildService([{ rows: [{ count: "0" }] }]);

      const count = await service.count("test_entity", ctx);

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // create()
  // --------------------------------------------------------------------------

  describe("create()", () => {
    it("should insert a record and return it", async () => {
      const { service, auditLogger } = buildService([
        // Insert result
        { rows: [{ id: "new-1", title: "New Record", amount: 100, version: 1 }] },
      ]);

      const result = await service.create(
        "test_entity",
        { title: "New Record", amount: 100 },
        ctx,
      );

      expect(result).toBeDefined();
      expect((result as any).id).toBe("new-1");
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.write",
          action: "create",
          result: "success",
        }),
      );
    });

    it("should enforce create policy", async () => {
      const { service, policyGate } = buildService([]);
      policyGate.enforce.mockRejectedValue(new Error("Create denied"));

      await expect(
        service.create("test_entity", { title: "X" }, ctx),
      ).rejects.toThrow("Create denied");
    });

    it("should log audit on failure", async () => {
      const { service, compiler, auditLogger } = buildService([]);
      compiler.compile.mockRejectedValue(new Error("compile failed"));

      await expect(
        service.create("test_entity", { title: "X" }, ctx),
      ).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "create",
          result: "failure",
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // update()
  // --------------------------------------------------------------------------

  describe("update()", () => {
    it("should update a record", async () => {
      const { service, auditLogger } = buildService([
        // Fetch existing record
        { rows: [{ id: "r1", title: "Old", amount: 10, version: 1 }] },
        // Update result
        { rows: [{ id: "r1", title: "Updated", amount: 20, version: 2 }] },
      ]);

      const result = await service.update(
        "test_entity",
        "r1",
        { title: "Updated", amount: 20, version: 1 },
        ctx,
      );

      expect(result).toBeDefined();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.write",
          action: "update",
          result: "success",
        }),
      );
    });

    it("should enforce update policy", async () => {
      const { service, policyGate } = buildService([]);
      policyGate.enforce.mockRejectedValue(new Error("Update denied"));

      await expect(
        service.update("test_entity", "r1", { title: "X" }, ctx),
      ).rejects.toThrow("Update denied");
    });
  });

  // --------------------------------------------------------------------------
  // delete()
  // --------------------------------------------------------------------------

  describe("delete()", () => {
    it("should soft-delete a record", async () => {
      const { service, auditLogger } = buildService([
        // Verify record exists
        { rows: [{ id: "r1", title: "To delete" }] },
        // Soft delete result
        { rows: [{ id: "r1" }] },
      ]);

      await service.delete("test_entity", "r1", ctx);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.write",
          action: "delete",
          result: "success",
        }),
      );
    });

    it("should enforce delete policy", async () => {
      const { service, policyGate } = buildService([]);
      policyGate.enforce.mockRejectedValue(new Error("Delete denied"));

      await expect(
        service.delete("test_entity", "r1", ctx),
      ).rejects.toThrow("Delete denied");
    });
  });

  // --------------------------------------------------------------------------
  // restore()
  // --------------------------------------------------------------------------

  describe("restore()", () => {
    it("should restore a soft-deleted record", async () => {
      const { service, auditLogger } = buildService([
        // Restore result
        { rows: [{ id: "r1", title: "Restored", deleted_at: null }] },
      ]);

      await service.restore("test_entity", "r1", ctx);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "data.write",
          action: "restore",
          result: "success",
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // healthCheck()
  // --------------------------------------------------------------------------

  describe("healthCheck()", () => {
    it("should aggregate db + compiler health", async () => {
      const { service } = buildService([
        // DB health query
        { rows: [{ ok: 1 }] },
      ]);

      const result = await service.healthCheck();

      expect(result.healthy).toBe(true);
    });
  });
});
