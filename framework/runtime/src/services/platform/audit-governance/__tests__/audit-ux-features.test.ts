/**
 * Audit UX Features — Test Suite
 *
 * Tests for AuditExplainabilityService, AuditAccessReportService,
 * AuditDsarService, and their API handlers.
 *
 * Service-level tests use a proper Kysely mock that supports sql template tags.
 */

import { describe, it, expect, vi } from "vitest";

import {
  ExplainEventHandler,
  WhoSawWhatHandler,
  DsarHandler,
} from "../api/handlers/audit-ux.handler.js";
import { AuditAccessReportService } from "../domain/audit-access-report.service.js";
import { AuditDsarService } from "../domain/audit-dsar.service.js";
import { AuditExplainabilityService } from "../domain/audit-explainability.service.js";

// ============================================================================
// Kysely mock that works with sql template tags
// ============================================================================

function createKyselyMockDb(executeImpl: (...args: any[]) => Promise<any>) {
  const mockExecutor = {
    transformQuery: (node: any) => node,
    compileQuery: () => ({ sql: "", parameters: [] }),
    executeQuery: executeImpl,
    withConnectionProvider: () => mockExecutor,
    withPlugin: () => mockExecutor,
    withPluginAtFront: () => mockExecutor,
    withoutPlugins: () => mockExecutor,
  };

  return {
    getExecutor: () => mockExecutor,
  } as any;
}

// ============================================================================
// AuditExplainabilityService
// ============================================================================

describe("AuditExplainabilityService", () => {
  const TENANT = "00000000-0000-0000-0000-000000000001";

  it("should return empty events for unknown correlation_id", async () => {
    const db = createKyselyMockDb(async () => ({ rows: [] }));
    const service = new AuditExplainabilityService(db);

    const result = await service.explain(TENANT, "unknown-correlation");

    expect(result.correlationId).toBe("unknown-correlation");
    expect(result.events).toHaveLength(0);
    expect(result.workflowInstance).toBeUndefined();
    expect(result.traceUrl).toBeUndefined();
  });

  it("should resolve events and build trace URL", async () => {
    const events = [
      {
        id: "evt-1",
        event_type: "workflow.started",
        severity: "info",
        actor_user_id: "user-1",
        event_timestamp: "2025-01-01T00:00:00Z",
        comment: "Started",
        instance_id: "inst-1",
        trace_id: "trace-abc",
      },
      {
        id: "evt-2",
        event_type: "workflow.approved",
        severity: "info",
        actor_user_id: "user-2",
        event_timestamp: "2025-01-01T01:00:00Z",
        comment: "Approved",
        instance_id: "inst-1",
        trace_id: null,
      },
    ];

    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) return { rows: events };
      return { rows: [{ id: "inst-1", status: "completed" }] };
    });

    const service = new AuditExplainabilityService(db, {
      traceBaseUrl: "https://jaeger.example.com",
    });

    const result = await service.explain(TENANT, "corr-1");

    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventType).toBe("workflow.started");
    expect(result.events[1].eventType).toBe("workflow.approved");
    expect(result.workflowInstance?.instanceId).toBe("inst-1");
    expect(result.workflowInstance?.status).toBe("completed");
    expect(result.traceUrl).toBe("https://jaeger.example.com/trace/trace-abc");
  });

  it("should handle missing trace config gracefully", async () => {
    const events = [
      {
        id: "evt-1",
        event_type: "workflow.started",
        severity: "info",
        actor_user_id: null,
        event_timestamp: "2025-01-01T00:00:00Z",
        comment: null,
        instance_id: null,
        trace_id: "trace-abc",
      },
    ];

    const db = createKyselyMockDb(async () => ({ rows: events }));
    const service = new AuditExplainabilityService(db);

    const result = await service.explain(TENANT, "corr-1");

    expect(result.traceUrl).toBeUndefined();
    expect(result.events[0].traceId).toBe("trace-abc");
  });
});

// ============================================================================
// AuditAccessReportService
// ============================================================================

describe("AuditAccessReportService", () => {
  const TENANT = "00000000-0000-0000-0000-000000000001";

  it("should return empty report for entity with no accesses", async () => {
    const db = createKyselyMockDb(async () => ({ rows: [] }));
    const service = new AuditAccessReportService(db);

    const report = await service.generateWhoSawWhat(TENANT, "PO", "po-123");

    expect(report.entityType).toBe("PO");
    expect(report.entityId).toBe("po-123");
    expect(report.principals).toHaveLength(0);
    expect(report.totalAccessCount).toBe(0);
  });

  it("should merge field_access and permission_decision by principal", async () => {
    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          rows: [
            {
              principal_id: "user-1",
              access_type: "read",
              count: "5",
              last_accessed_at: "2025-01-15T10:00:00Z",
            },
          ],
        };
      }
      return {
        rows: [
          {
            principal_id: "user-1",
            count: "3",
            last_decided_at: "2025-01-15T12:00:00Z",
          },
          {
            principal_id: "user-2",
            count: "1",
            last_decided_at: "2025-01-14T08:00:00Z",
          },
        ],
      };
    });

    const service = new AuditAccessReportService(db);
    const report = await service.generateWhoSawWhat(TENANT, "PO", "po-123");

    expect(report.principals).toHaveLength(2);

    const user1 = report.principals.find((p) => p.principalId === "user-1");
    expect(user1).toBeDefined();
    expect(user1!.fieldAccesses).toBe(5);
    expect(user1!.permissionDecisions).toBe(3);
    expect(user1!.accessCount).toBe(8);

    const user2 = report.principals.find((p) => p.principalId === "user-2");
    expect(user2).toBeDefined();
    expect(user2!.permissionDecisions).toBe(1);
    expect(user2!.fieldAccesses).toBe(0);
  });

  it("should sort principals by most recent access", async () => {
    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          rows: [
            { principal_id: "old-user", access_type: "read", count: "10", last_accessed_at: "2025-01-01T00:00:00Z" },
            { principal_id: "new-user", access_type: "read", count: "1", last_accessed_at: "2025-01-20T00:00:00Z" },
          ],
        };
      }
      return { rows: [] };
    });

    const service = new AuditAccessReportService(db);
    const report = await service.generateWhoSawWhat(TENANT, "PO", "po-123");

    expect(report.principals[0].principalId).toBe("new-user");
    expect(report.principals[1].principalId).toBe("old-user");
  });
});

// ============================================================================
// AuditDsarService
// ============================================================================

describe("AuditDsarService", () => {
  const TENANT = "00000000-0000-0000-0000-000000000001";

  it("should count events across 5 tables", async () => {
    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      // Return different counts for different tables
      // 1=wae, 2=encrypted, 3=redacted, 4=pdl, 5=fal, 6=se, 7=al, 8=security_event_log
      const counts: Record<number, any> = {
        1: { count: "10", oldest: "2025-01-01T00:00:00Z", newest: "2025-01-15T00:00:00Z" },
        2: { count: "2" },
        3: { count: "1" },
        4: { count: "5", oldest: "2025-01-02T00:00:00Z", newest: "2025-01-14T00:00:00Z" },
        5: { count: "3", oldest: "2025-01-03T00:00:00Z", newest: "2025-01-13T00:00:00Z" },
        6: { count: "8", oldest: "2025-01-04T00:00:00Z", newest: "2025-01-12T00:00:00Z" },
        7: { count: "1", oldest: "2025-01-05T00:00:00Z", newest: "2025-01-11T00:00:00Z" },
      };
      return { rows: [counts[callCount] ?? { count: "0", oldest: null, newest: null }] };
    });

    const service = new AuditDsarService(db);
    const result = await service.generateDataSubjectReport(TENANT, "user-123");

    expect(result.tenantId).toBe(TENANT);
    expect(result.subjectUserId).toBe("user-123");
    expect(result.tables).toHaveLength(5);
    expect(result.totalEvents).toBe(10 + 5 + 3 + 8 + 1); // 27
    expect(result.encryptedCount).toBe(2);
    expect(result.redactedCount).toBe(1);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it("should note encrypted and redacted counts", async () => {
    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) return { rows: [{ count: "100", oldest: "2025-01-01", newest: "2025-01-31" }] };
      if (callCount === 2) return { rows: [{ count: "25" }] };
      if (callCount === 3) return { rows: [{ count: "10" }] };
      return { rows: [{ count: "0", oldest: null, newest: null }] };
    });

    const service = new AuditDsarService(db);
    const result = await service.generateDataSubjectReport(TENANT, "user-123");

    expect(result.encryptedCount).toBe(25);
    expect(result.redactedCount).toBe(10);
  });

  it("should handle DB errors gracefully for individual tables", async () => {
    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) return { rows: [{ count: "50", oldest: "2025-01-01", newest: "2025-01-31" }] };
      if (callCount === 2) return { rows: [{ count: "5" }] };
      if (callCount === 3) return { rows: [{ count: "2" }] };
      return { rows: [{ count: "0", oldest: null, newest: null }] };
    });

    const service = new AuditDsarService(db);
    const result = await service.generateDataSubjectReport(TENANT, "user-123");

    expect(result.tables).toHaveLength(5);
    expect(result.tables[0].eventCount).toBe(50);
  });
});

// ============================================================================
// API Handlers
// ============================================================================

describe("Audit UX Handlers", () => {
  const adminContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    userId: "admin-user",
    roles: ["security_admin"],
  };

  const viewerContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    userId: "viewer-user",
    roles: ["view_tenant_events"],
  };

  const regularContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    userId: "regular-user",
    roles: ["basic"],
  };

  describe("ExplainEventHandler", () => {
    it("should reject unauthorized callers", async () => {
      const deps = {
        explainability: { explain: vi.fn() },
        accessReport: {} as any,
        dsar: {} as any,
      } as any;
      const handler = new ExplainEventHandler(deps);

      const result = await handler.handle(regularContext, { correlationId: "corr-1" });
      expect(result.status).toBe(403);
    });

    it("should allow viewers with view_tenant_events", async () => {
      const mockExplanation = { correlationId: "corr-1", events: [] };
      const deps = {
        explainability: { explain: vi.fn().mockResolvedValue(mockExplanation) },
        accessReport: {} as any,
        dsar: {} as any,
      } as any;
      const handler = new ExplainEventHandler(deps);

      const result = await handler.handle(viewerContext, { correlationId: "corr-1" });
      expect(result.status).toBe(200);
      expect(result.body).toBe(mockExplanation);
    });

    it("should require correlationId", async () => {
      const deps = {
        explainability: { explain: vi.fn() },
        accessReport: {} as any,
        dsar: {} as any,
      } as any;
      const handler = new ExplainEventHandler(deps);

      const result = await handler.handle(viewerContext, { correlationId: "" });
      expect(result.status).toBe(400);
    });
  });

  describe("WhoSawWhatHandler", () => {
    it("should reject non-admin callers", async () => {
      const deps = {
        explainability: {} as any,
        accessReport: { generateWhoSawWhat: vi.fn() },
        dsar: {} as any,
      } as any;
      const handler = new WhoSawWhatHandler(deps);

      const result = await handler.handle(viewerContext, {
        entityType: "PO",
        entityId: "po-1",
      });
      expect(result.status).toBe(403);
    });

    it("should return report for admin", async () => {
      const mockReport = { entityType: "PO", principals: [] };
      const deps = {
        explainability: {} as any,
        accessReport: { generateWhoSawWhat: vi.fn().mockResolvedValue(mockReport) },
        dsar: {} as any,
      } as any;
      const handler = new WhoSawWhatHandler(deps);

      const result = await handler.handle(adminContext, {
        entityType: "PO",
        entityId: "po-1",
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe(mockReport);
    });
  });

  describe("DsarHandler", () => {
    it("should reject non-admin callers", async () => {
      const deps = {
        explainability: {} as any,
        accessReport: {} as any,
        dsar: { generateDataSubjectReport: vi.fn() },
      } as any;
      const handler = new DsarHandler(deps);

      const result = await handler.handle(viewerContext, { subjectUserId: "user-1" });
      expect(result.status).toBe(403);
    });

    it("should return DSAR report for admin", async () => {
      const mockResult = { totalEvents: 42, tables: [] };
      const deps = {
        explainability: {} as any,
        accessReport: {} as any,
        dsar: { generateDataSubjectReport: vi.fn().mockResolvedValue(mockResult) },
      } as any;
      const handler = new DsarHandler(deps);

      const result = await handler.handle(adminContext, { subjectUserId: "user-1" });
      expect(result.status).toBe(200);
      expect(result.body).toBe(mockResult);
    });

    it("should require subjectUserId", async () => {
      const deps = {
        explainability: {} as any,
        accessReport: {} as any,
        dsar: { generateDataSubjectReport: vi.fn() },
      } as any;
      const handler = new DsarHandler(deps);

      const result = await handler.handle(adminContext, { subjectUserId: "" });
      expect(result.status).toBe(400);
    });
  });
});
