/**
 * Resilient Audit Writer Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ResilientAuditWriter } from "../domain/resilient-audit-writer.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";
import type { AuditOutboxRepo } from "../persistence/AuditOutboxRepo.js";
import type { CircuitBreaker } from "@athyper/core";

function makeEvent(
  overrides: Partial<Omit<AuditEvent, "id">> = {},
): Omit<AuditEvent, "id"> {
  return {
    tenantId: "t-1",
    eventType: "workflow.created",
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
    timestamp: new Date(),
    ...overrides,
  } as Omit<AuditEvent, "id">;
}

function createMockOutboxRepo(): AuditOutboxRepo {
  return {
    enqueue: vi.fn().mockResolvedValue("mock-id"),
    pick: vi.fn().mockResolvedValue([]),
    markPersisted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markDead: vi.fn().mockResolvedValue(undefined),
    countPending: vi.fn().mockResolvedValue(0),
    countDead: vi.fn().mockResolvedValue(0),
    cleanup: vi.fn().mockResolvedValue(0),
  } as unknown as AuditOutboxRepo;
}

function createMockCircuitBreaker(open = false): CircuitBreaker {
  return {
    execute: open
      ? vi.fn().mockRejectedValue(new Error("Circuit breaker is OPEN"))
      : vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
    getMetrics: vi.fn().mockReturnValue({
      state: open ? "OPEN" : "CLOSED",
      failures: 0,
      successes: 0,
      totalCalls: 0,
    }),
    reset: vi.fn(),
  } as unknown as CircuitBreaker;
}

describe("ResilientAuditWriter", () => {
  let outbox: AuditOutboxRepo;
  let breaker: CircuitBreaker;
  let metrics: {
    eventIngested: ReturnType<typeof vi.fn>;
    eventDropped: ReturnType<typeof vi.fn>;
    eventBuffered: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    outbox = createMockOutboxRepo();
    breaker = createMockCircuitBreaker();
    metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };
  });

  it("should enqueue to outbox on happy path", async () => {
    const writer = new ResilientAuditWriter(outbox, breaker, { metrics });
    await writer.write("t-1", makeEvent());

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(metrics.eventIngested).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: "t-1",
        event_type: "workflow.created",
      }),
    );
    expect(writer.bufferDepth).toBe(0);
  });

  it("should never throw even when outbox fails", async () => {
    const failingBreaker = createMockCircuitBreaker(true);
    const writer = new ResilientAuditWriter(outbox, failingBreaker, {
      metrics,
    });

    // Should not throw
    await expect(writer.write("t-1", makeEvent())).resolves.not.toThrow();
    expect(metrics.eventBuffered).toHaveBeenCalled();
    expect(writer.bufferDepth).toBe(1);
  });

  it("should buffer events when circuit is open", async () => {
    const openBreaker = createMockCircuitBreaker(true);
    const writer = new ResilientAuditWriter(outbox, openBreaker, { metrics });

    await writer.write("t-1", makeEvent({ eventType: "workflow.created" }));
    await writer.write("t-1", makeEvent({ eventType: "workflow.started" }));

    expect(writer.bufferDepth).toBe(2);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("should drop oldest when buffer is full", async () => {
    const openBreaker = createMockCircuitBreaker(true);
    const writer = new ResilientAuditWriter(outbox, openBreaker, {
      metrics,
      maxBufferSize: 3,
    });

    // Fill buffer to capacity
    await writer.write("t-1", makeEvent({ eventType: "workflow.created" }));
    await writer.write("t-1", makeEvent({ eventType: "workflow.started" }));
    await writer.write("t-1", makeEvent({ eventType: "workflow.approved" }));
    expect(writer.bufferDepth).toBe(3);

    // This should drop the oldest
    await writer.write("t-1", makeEvent({ eventType: "workflow.rejected" }));
    expect(writer.bufferDepth).toBe(3);
    expect(metrics.eventDropped).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "buffer_overflow" }),
    );
  });

  describe("flushBuffer", () => {
    it("should flush buffer to outbox when available", async () => {
      const openBreaker = createMockCircuitBreaker(true);
      const writer = new ResilientAuditWriter(outbox, openBreaker, { metrics });

      await writer.write("t-1", makeEvent());
      await writer.write("t-1", makeEvent());
      expect(writer.bufferDepth).toBe(2);

      // Now flush (outbox is directly accessible, no breaker)
      const flushed = await writer.flushBuffer();
      expect(flushed).toBe(2);
      expect(writer.bufferDepth).toBe(0);
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    });

    it("should stop flushing if outbox fails mid-flush", async () => {
      const openBreaker = createMockCircuitBreaker(true);
      const writer = new ResilientAuditWriter(outbox, openBreaker, { metrics });

      await writer.write("t-1", makeEvent());
      await writer.write("t-1", makeEvent());
      await writer.write("t-1", makeEvent());

      // Make enqueue fail after first call
      let callCount = 0;
      (outbox.enqueue as ReturnType<typeof vi.fn>).mockImplementation(
        async () => {
          callCount++;
          if (callCount > 1) throw new Error("DB down");
          return "mock-id";
        },
      );

      const flushed = await writer.flushBuffer();
      expect(flushed).toBe(1);
      expect(writer.bufferDepth).toBe(2); // 2 remaining
    });
  });
});
