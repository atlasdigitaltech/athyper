/**
 * Audit Metrics + Health Check Tests
 */
import { describe, it, expect, vi } from "vitest";

import {
  AuditMetrics,
  createAuditHealthChecker,
} from "../observability/metrics.js";

import type { ResilientAuditWriter } from "../domain/resilient-audit-writer.js";
import type { AuditOutboxRepo } from "../persistence/AuditOutboxRepo.js";

function createMockRegistry() {
  return {
    incrementCounter: vi.fn(),
    setGauge: vi.fn(),
    recordHistogram: vi.fn(),
  } as any;
}

function createMockOutboxRepo(pending = 0, dead = 0): AuditOutboxRepo {
  return {
    countPending: vi.fn().mockResolvedValue(pending),
    countDead: vi.fn().mockResolvedValue(dead),
  } as unknown as AuditOutboxRepo;
}

function createMockWriter(bufferDepth = 0): ResilientAuditWriter {
  return {
    bufferDepth,
  } as unknown as ResilientAuditWriter;
}

describe("AuditMetrics", () => {
  it("should increment eventIngested counter", () => {
    const registry = createMockRegistry();
    const metrics = new AuditMetrics(registry);

    metrics.eventIngested({
      tenant: "t-1",
      event_type: "workflow.created",
      severity: "info",
    });
    expect(registry.incrementCounter).toHaveBeenCalledWith(
      "audit_events_ingested_total",
      1,
      { tenant: "t-1", event_type: "workflow.created", severity: "info" },
    );
  });

  it("should set outboxLag gauge", () => {
    const registry = createMockRegistry();
    const metrics = new AuditMetrics(registry);

    metrics.outboxLag(42);
    expect(registry.setGauge).toHaveBeenCalledWith("audit_outbox_lag", 42);
  });

  it("should record insertLatency histogram", () => {
    const registry = createMockRegistry();
    const metrics = new AuditMetrics(registry);

    metrics.insertLatency(15.5, { table: "workflow_event_log" });
    expect(registry.recordHistogram).toHaveBeenCalledWith(
      "audit_insert_latency_ms",
      15.5,
      { table: "workflow_event_log" },
    );
  });
});

describe("createAuditHealthChecker", () => {
  it("should return healthy when lag is low", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(100, 0),
      createMockWriter(0),
    );
    const result = await checker();
    expect(result.status).toBe("healthy");
  });

  it("should return degraded when lag >= 10000", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(15_000, 0),
      createMockWriter(0),
    );
    const result = await checker();
    expect(result.status).toBe("degraded");
  });

  it("should return unhealthy when lag >= 50000", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(60_000, 0),
      createMockWriter(0),
    );
    const result = await checker();
    expect(result.status).toBe("unhealthy");
  });

  it("should return degraded when memory buffer has items", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(0, 0),
      createMockWriter(5),
    );
    const result = await checker();
    expect(result.status).toBe("degraded");
  });

  it("should return degraded when dead items > 100", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(50, 150),
      createMockWriter(0),
    );
    const result = await checker();
    expect(result.status).toBe("degraded");
  });

  it("should return unhealthy on repo failure", async () => {
    const failingRepo = {
      countPending: vi.fn().mockRejectedValue(new Error("DB down")),
      countDead: vi.fn().mockRejectedValue(new Error("DB down")),
    } as unknown as AuditOutboxRepo;

    const checker = createAuditHealthChecker(failingRepo);
    const result = await checker();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("DB down");
  });

  it("should include details in result", async () => {
    const checker = createAuditHealthChecker(
      createMockOutboxRepo(500, 10),
      createMockWriter(2),
    );
    const result = await checker();
    expect(result.details?.outboxPending).toBe(500);
    expect(result.details?.outboxDead).toBe(10);
    expect(result.details?.memoryBuffer).toBe(2);
  });
});
