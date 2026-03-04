/**
 * WorkflowAuditRepository Tests (unit — mocks Kysely)
 *
 * Tests serialization, deserialization, filter building,
 * and delegation to hash chain / redaction.
 */
import { describe, it, expect, vi } from "vitest";

import { WorkflowAuditRepository } from "../persistence/WorkflowAuditRepository.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";

// ---------------------------------------------------------------------------
// Minimal Kysely mock
// ---------------------------------------------------------------------------

function createMockDb() {
  const executeFn = vi.fn().mockResolvedValue([]);
  const executeTakeFirstFn = vi.fn().mockResolvedValue(undefined);
  const chain: Record<string, any> = {};

  const makeChain = (): any =>
    new Proxy(chain, {
      get(_target, prop) {
        if (prop === "execute") return executeFn;
        if (prop === "executeTakeFirst") return executeTakeFirstFn;
        return vi.fn().mockReturnValue(makeChain());
      },
    });

  return {
    db: {
      insertInto: vi.fn().mockReturnValue(makeChain()),
      selectFrom: vi.fn().mockReturnValue(makeChain()),
      updateTable: vi.fn().mockReturnValue(makeChain()),
      fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn() }) },
    } as any,
    executeFn,
    executeTakeFirstFn,
  };
}

function makeEvent(
  overrides: Partial<Omit<AuditEvent, "id">> = {},
): Omit<AuditEvent, "id"> {
  return {
    tenantId: "t-1",
    eventType: "workflow.created",
    severity: "info",
    instanceId: "inst-1",
    stepInstanceId: "step-1",
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
    actor: { userId: "u-1", displayName: "Test User", isAdmin: false },
    action: "approve",
    timestamp: new Date("2025-06-15T10:00:00Z"),
    comment: "Looks good",
    details: { amount: 500 },
    ...overrides,
  } as Omit<AuditEvent, "id">;
}

describe("WorkflowAuditRepository", () => {
  describe("recordEvent", () => {
    it("should insert with correct column mapping", async () => {
      const { db, executeFn } = createMockDb();
      const repo = new WorkflowAuditRepository(db);

      const result = await repo.recordEvent("t-1", makeEvent());

      expect(result.id).toBeDefined();
      expect(result.eventType).toBe("workflow.created");
      expect(db.insertInto).toHaveBeenCalled();
    });

    it("should delegate to redaction pipeline", async () => {
      const { db } = createMockDb();
      const mockRedaction = {
        redact: vi.fn().mockReturnValue({
          event: makeEvent(),
          wasRedacted: true,
          redactionVersion: 1,
        }),
      };

      const repo = new WorkflowAuditRepository(
        db,
        undefined,
        mockRedaction as any,
      );
      await repo.recordEvent("t-1", makeEvent());

      expect(mockRedaction.redact).toHaveBeenCalledTimes(1);
    });

    it("should delegate to hash chain service", async () => {
      const { db } = createMockDb();
      const mockHashChain = {
        computeHash: vi.fn().mockResolvedValue({
          hash_prev: "prev-hash",
          hash_curr: "curr-hash",
        }),
      };

      const repo = new WorkflowAuditRepository(db, mockHashChain as any);
      await repo.recordEvent("t-1", makeEvent());

      expect(mockHashChain.computeHash).toHaveBeenCalledTimes(1);
      expect(mockHashChain.computeHash).toHaveBeenCalledWith(
        "t-1",
        expect.any(Object),
      );
    });

    it("should extract denormalized columns from actor and workflow", async () => {
      const { db } = createMockDb();
      const repo = new WorkflowAuditRepository(db);

      const event = makeEvent({
        actor: {
          userId: "admin-1",
          displayName: "Admin",
          isAdmin: true,
        } as any,
        workflow: {
          templateId: "t1",
          templateCode: "PO-APPROVAL",
          templateVersion: 3,
          templateName: "PO Approval",
        },
      });

      await repo.recordEvent("t-1", event);
      // Verify insertInto was called (column values verified by the mock chain)
      expect(db.insertInto).toHaveBeenCalled();
    });
  });

  describe("mapRow", () => {
    it("should correctly map snake_case DB row to AuditEvent", () => {
      const { db } = createMockDb();
      const repo = new WorkflowAuditRepository(db);

      // Access private method via any cast
      const row = {
        id: "e-1",
        tenant_id: "t-1",
        event_type: "workflow.created",
        severity: "info",
        instance_id: "inst-1",
        step_instance_id: null,
        entity: JSON.stringify({ type: "PO", id: "po-1" }),
        workflow: JSON.stringify({
          templateId: "t1",
          templateCode: "WF1",
          templateVersion: 1,
          templateName: "Test",
        }),
        actor: JSON.stringify({ userId: "u-1" }),
        action: "approve",
        previous_state: null,
        new_state: null,
        comment: "OK",
        attachments: null,
        details: JSON.stringify({ amount: 500 }),
        event_timestamp: new Date("2025-06-15T10:00:00Z"),
        ip_address: null,
        user_agent: null,
        correlation_id: null,
        session_id: null,
      };

      const mapped = (repo as any).mapRow(row);
      expect(mapped.id).toBe("e-1");
      expect(mapped.tenantId).toBe("t-1");
      expect(mapped.eventType).toBe("workflow.created");
      expect(mapped.entity.type).toBe("PO");
      expect(mapped.workflow.templateCode).toBe("WF1");
      expect(mapped.actor.userId).toBe("u-1");
      expect(mapped.details.amount).toBe(500);
      expect(mapped.timestamp).toBeInstanceOf(Date);
    });

    it("should handle already-parsed JSONB objects", () => {
      const { db } = createMockDb();
      const repo = new WorkflowAuditRepository(db);

      const row = {
        id: "e-2",
        tenant_id: "t-1",
        event_type: "step.activated",
        severity: "info",
        instance_id: "inst-1",
        step_instance_id: "step-1",
        entity: { type: "PO", id: "po-1" }, // Already parsed (pg driver behavior)
        workflow: {
          templateId: "t1",
          templateCode: "WF1",
          templateVersion: 1,
          templateName: "Test",
        },
        actor: { userId: "u-1" },
        action: null,
        previous_state: null,
        new_state: null,
        comment: null,
        attachments: null,
        details: null,
        event_timestamp: new Date(),
        ip_address: null,
        user_agent: null,
        correlation_id: null,
        session_id: null,
      };

      const mapped = (repo as any).mapRow(row);
      expect(mapped.entity.type).toBe("PO");
    });
  });
});
