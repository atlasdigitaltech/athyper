/**
 * Audit Export Service Tests
 *
 * Verifies:
 *   - NDJSON serialization format
 *   - SHA-256 integrity hash computation
 *   - Object storage upload (mock)
 *   - Manifest generation
 *   - Security event logging (audit-of-audit)
 *   - Empty export handling
 *   - Handler auth checks
 */
import { createHash } from "crypto";

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ExportAuditHandler,
  ListAuditExportsHandler,
} from "../api/handlers/audit-export.handler.js";
import { AuditExportService } from "../domain/audit-export.service.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";

// ─── Test Helpers ──────────────────────────────────────────────────

function makeEvent(id: string, eventType = "workflow.created"): AuditEvent {
  return {
    id,
    tenantId: "t-1",
    eventType: eventType as any,
    severity: "info",
    instanceId: "inst-1",
    entity: {
      type: "PO",
      id: "po-1",
      referenceCode: "PO-001",
      displayName: "Test PO",
    },
    workflow: {
      templateId: "t1",
      templateCode: "WF1",
      templateVersion: 1,
      templateName: "Test",
    },
    actor: { userId: "u-1", displayName: "Test User" },
    timestamp: new Date("2025-06-15T10:00:00Z"),
  } as AuditEvent;
}

function createMockAuditRepo(events: AuditEvent[] = []) {
  return {
    getEvents: vi.fn().mockResolvedValue(events),
    recordEvent: vi.fn(),
    getInstanceAuditTrail: vi.fn(),
    getStepAuditSummary: vi.fn(),
    countEvents: vi.fn(),
    getEventsByCorrelationId: vi.fn(),
    aggregateForReport: vi.fn(),
  } as any;
}

function createMockObjectStorage() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  };
}

function createMockDb() {
  return {
    insertInto: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as any;
}

// ─── AuditExportService ────────────────────────────────────────────

describe("AuditExportService", () => {
  let repo: ReturnType<typeof createMockAuditRepo>;
  let storage: ReturnType<typeof createMockObjectStorage>;
  let db: ReturnType<typeof createMockDb>;
  let service: AuditExportService;

  beforeEach(() => {
    repo = createMockAuditRepo([
      makeEvent("e1"),
      makeEvent("e2", "workflow.started"),
    ]);
    storage = createMockObjectStorage();
    db = createMockDb();
    service = new AuditExportService(repo, storage, db);
  });

  it("should export events as NDJSON to object storage", async () => {
    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    // Object storage called for NDJSON and manifest
    expect(storage.put).toHaveBeenCalledTimes(2);

    // First call: NDJSON
    const ndjsonCall = storage.put.mock.calls[0];
    expect(ndjsonCall[0]).toContain("audit-exports/t-1/");
    expect(ndjsonCall[0]).toMatch(/\.ndjson$/);
    expect(ndjsonCall[2]?.contentType).toBe("application/x-ndjson");

    // Second call: manifest
    const manifestCall = storage.put.mock.calls[1];
    expect(manifestCall[0]).toMatch(/\.manifest\.json$/);
    expect(manifestCall[2]?.contentType).toBe("application/json");
  });

  it("should produce correct NDJSON format", async () => {
    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    const ndjsonBody = storage.put.mock.calls[0][1] as string;
    const lines = ndjsonBody.trim().split("\n");

    expect(lines).toHaveLength(2);
    // Each line is valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("should compute SHA-256 hash of the NDJSON content", async () => {
    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    const ndjsonBody = storage.put.mock.calls[0][1] as string;
    const expectedHash = createHash("sha256")
      .update(ndjsonBody, "utf8")
      .digest("hex");

    expect(result.manifest.sha256).toBe(expectedHash);
    expect(result.manifest.sha256).toHaveLength(64);
  });

  it("should generate correct manifest", async () => {
    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    expect(result.manifest.tenantId).toBe("t-1");
    expect(result.manifest.eventCount).toBe(2);
    expect(result.manifest.exportedBy).toBe("admin-user");
    expect(result.manifest.exportId).toBeDefined();
    expect(result.manifest.ndjsonKey).toContain("t-1");
    expect(result.manifest.manifestKey).toContain("t-1");
  });

  it("should log AUDIT_EXPORTED to security_event", async () => {
    await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    expect(db.insertInto).toHaveBeenCalledWith("sec.security_event");
  });

  it("should handle empty export", async () => {
    repo = createMockAuditRepo([]);
    service = new AuditExportService(repo, storage, db);

    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    expect(result.manifest.eventCount).toBe(0);
    // Still uploads (empty NDJSON is valid)
    expect(storage.put).toHaveBeenCalledTimes(2);
  });

  it("should work without object storage (no upload)", async () => {
    service = new AuditExportService(repo, null, db);

    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    expect(result.manifest.eventCount).toBe(2);
    // No storage calls
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("should work without DB (no audit-of-audit logging)", async () => {
    service = new AuditExportService(repo, storage);

    const result = await service.export({
      tenantId: "t-1",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      exportedBy: "admin-user",
    });

    expect(result.manifest.eventCount).toBe(2);
    // Storage called, but no DB call
    expect(storage.put).toHaveBeenCalledTimes(2);
  });
});

// ─── ExportAuditHandler ────────────────────────────────────────────

describe("ExportAuditHandler", () => {
  it("should reject non-security_admin callers", async () => {
    const exportService = new AuditExportService(createMockAuditRepo(), null);
    const handler = new ExportAuditHandler(exportService);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler.handle(
      { body: { startDate: "2025-06-01", endDate: "2025-06-30" } },
      res as any,
      {
        container: {} as any,
        tenant: { id: "t-1" },
        auth: { userId: "u-1", roles: ["view_tenant_events"] },
      },
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("should require startDate and endDate", async () => {
    const exportService = new AuditExportService(createMockAuditRepo(), null);
    const handler = new ExportAuditHandler(exportService);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler.handle({ body: {} }, res as any, {
      container: {} as any,
      tenant: { id: "t-1" },
      auth: { userId: "u-1", roles: ["security_admin"] },
    });

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── ListAuditExportsHandler ───────────────────────────────────────

describe("ListAuditExportsHandler", () => {
  it("should reject non-security_admin callers", async () => {
    const handler = new ListAuditExportsHandler(createMockObjectStorage());

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler.handle({ query: {} }, res as any, {
      container: {} as any,
      tenant: { id: "t-1" },
      auth: { userId: "u-1", roles: [] },
    });

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("should return 503 when object storage not configured", async () => {
    const handler = new ListAuditExportsHandler(null);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler.handle({ query: {} }, res as any, {
      container: {} as any,
      tenant: { id: "t-1" },
      auth: { userId: "u-1", roles: ["security_admin"] },
    });

    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("should filter manifests from listed objects", async () => {
    const storage = createMockObjectStorage();
    storage.list.mockResolvedValue([
      {
        key: "audit-exports/t-1/2025-06-15/abc.ndjson",
        size: 1024,
        lastModified: new Date(),
      },
      {
        key: "audit-exports/t-1/2025-06-15/abc.manifest.json",
        size: 256,
        lastModified: new Date(),
      },
      {
        key: "audit-exports/t-1/2025-06-15/def.ndjson",
        size: 2048,
        lastModified: new Date(),
      },
      {
        key: "audit-exports/t-1/2025-06-15/def.manifest.json",
        size: 512,
        lastModified: new Date(),
      },
    ]);

    const handler = new ListAuditExportsHandler(storage);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await handler.handle({ query: {} }, res as any, {
      container: {} as any,
      tenant: { id: "t-1" },
      auth: { userId: "u-1", roles: ["security_admin"] },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.total).toBe(2);
    expect(
      responseData.exports.every((e: any) => e.key.endsWith(".manifest.json")),
    ).toBe(true);
  });
});
