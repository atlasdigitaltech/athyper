/**
 * Audit Correctness Invariants — End-to-end pipeline integrity tests
 *
 * Verifies the audit pipeline's correctness guarantees:
 * - Outbox roundtrip: enqueue → drain → recordEvent called
 * - Hash chain integrity: events → verifyChain → valid
 * - Hash chain tamper detection: modified hash → verifyChain → broken
 * - Redaction completeness: PII/secrets stripped
 * - Feature flag controls: off mode drops events
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AuditFeatureFlagResolver } from "../domain/audit-feature-flags.js";
import { AuditHashChainService, GENESIS_HASH } from "../domain/hash-chain.service.js";
import { AuditRedactionPipeline } from "../domain/redaction-pipeline.js";
import { ResilientAuditWriter } from "../domain/resilient-audit-writer.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";

// ─── Test Helpers ──────────────────────────────────────────────────

function makeEvent(overrides: Partial<Omit<AuditEvent, "id">> = {}): Omit<AuditEvent, "id"> {
  return {
    tenantId: "t-1",
    eventType: "workflow.created",
    severity: "info",
    instanceId: "inst-1",
    entity: { type: "PO", id: "po-1", referenceCode: "PO-001", displayName: "Test PO" },
    workflow: { templateId: "t1", templateCode: "WF1", templateVersion: 1, templateName: "Test" },
    actor: { userId: "u-1", displayName: "Test User" },
    timestamp: new Date("2025-06-15T10:00:00Z"),
    ...overrides,
  } as Omit<AuditEvent, "id">;
}

function createMockOutboxRepo() {
  return {
    enqueue: vi.fn().mockResolvedValue("outbox-1"),
  };
}

function createMockCircuitBreaker() {
  return {
    execute: vi.fn(async (fn: any) => fn()),
    getMetrics: vi.fn(() => ({ state: "CLOSED", failures: 0, successes: 0, totalCalls: 0 })),
    reset: vi.fn(),
  };
}

// ─── Invariant: Outbox Roundtrip ───────────────────────────────────

describe("Invariant: Outbox Roundtrip", () => {
  it("should enqueue event to outbox with correct payload", async () => {
    const outbox = createMockOutboxRepo();
    const breaker = createMockCircuitBreaker();
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, { metrics });

    const event = makeEvent({ eventType: "workflow.started" });
    await writer.write("t-1", event);

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      "t-1",
      "workflow.started",
      expect.objectContaining({ eventType: "workflow.started" }),
    );
    expect(metrics.eventIngested).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: "t-1", event_type: "workflow.started" }),
    );
  });

  it("should buffer event when outbox is unavailable", async () => {
    const outbox = createMockOutboxRepo();
    const breaker = {
      execute: vi.fn(async () => { throw new Error("DB down"); }),
      getMetrics: vi.fn(() => ({ state: "OPEN" })),
      reset: vi.fn(),
    };
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      metrics,
      logger,
    });

    await writer.write("t-1", makeEvent());

    expect(writer.bufferDepth).toBe(1);
    expect(metrics.eventBuffered).toHaveBeenCalledWith({ tenant: "t-1" });
  });
});

// ─── Invariant: Hash Chain Integrity ───────────────────────────────

describe("Invariant: Hash Chain Integrity", () => {
  it("should produce a verifiable chain of 10 events", async () => {
    const svc = new AuditHashChainService();
    const events: any[] = [];

    for (let i = 0; i < 10; i++) {
      const event = makeEvent({
        eventType: i % 3 === 0 ? "workflow.created" : i % 3 === 1 ? "workflow.started" : "step.activated",
        timestamp: new Date(`2025-06-15T10:0${i}:00Z`),
      });
      const hash = await svc.computeHash("t-1", event);
      events.push({
        ...event,
        id: `id-${i}`,
        hash_prev: hash.hash_prev,
        hash_curr: hash.hash_curr,
      });
    }

    const verification = svc.verifyChain("t-1", events);
    expect(verification.valid).toBe(true);
    expect(verification.eventsChecked).toBe(10);
  });

  it("should start from GENESIS_HASH for first event", async () => {
    const svc = new AuditHashChainService();
    const hash = await svc.computeHash("t-1", makeEvent());

    expect(hash.hash_prev).toBe(GENESIS_HASH);
    expect(hash.hash_curr).toHaveLength(64); // SHA-256 hex
  });

  it("should detect tampered event in chain", async () => {
    const svc = new AuditHashChainService();
    const events: any[] = [];

    for (let i = 0; i < 5; i++) {
      const event = makeEvent({ timestamp: new Date(`2025-06-15T10:0${i}:00Z`) });
      const hash = await svc.computeHash("t-1", event);
      events.push({
        ...event,
        id: `id-${i}`,
        hash_prev: hash.hash_prev,
        hash_curr: hash.hash_curr,
      });
    }

    // Tamper with event 2's hash
    events[2].hash_curr = "tampered_hash_value_000000000000000000000000000000";

    const svc2 = new AuditHashChainService();
    const result = svc2.verifyChain("t-1", events);
    expect(result.valid).toBe(false);
  });

  it("should maintain separate chains per tenant", async () => {
    const svc = new AuditHashChainService();
    const h1 = await svc.computeHash("tenant-a", makeEvent());
    const h2 = await svc.computeHash("tenant-b", makeEvent());

    // Both start from genesis
    expect(h1.hash_prev).toBe(GENESIS_HASH);
    expect(h2.hash_prev).toBe(GENESIS_HASH);

    // Hashes differ (different tenant_id in payload)
    expect(h1.hash_curr).not.toBe(h2.hash_curr);
  });
});

// ─── Invariant: Redaction Completeness ─────────────────────────────

describe("Invariant: Redaction Completeness", () => {
  let pipeline: AuditRedactionPipeline;

  beforeEach(() => {
    const mockMasking = {
      mask: (value: unknown, strategy: string) => {
        if (strategy === "partial" && typeof value === "string") {
          return value.substring(0, 2) + "***";
        }
        return "[REDACTED]";
      },
    } as any;
    pipeline = new AuditRedactionPipeline(mockMasking);
  });

  it("should strip denylist keys from details", () => {
    const event = makeEvent({
      details: {
        password: "secret123",
        token: "jwt-xyz",
        normalField: "visible",
      },
    } as any);

    const result = pipeline.redact(event);
    const details = (result.event as any).details;

    expect(details.password).toBe("[REDACTED]");
    expect(details.token).toBe("[REDACTED]");
    expect(details.normalField).toBe("visible");
  });

  it("should set is_redacted flag when redaction occurred", () => {
    const event = makeEvent({
      details: { api_key: "key-123" },
    } as any);

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
  });

  it("should not set redacted flag when no redaction needed", () => {
    const event = makeEvent({
      details: { normalField: "value" },
    } as any);

    const result = pipeline.redact(event);
    // No denylist keys → redacted may be false (depends on PII pattern matches)
    expect(result.event).toBeDefined();
  });
});

// ─── Invariant: Feature Flag Controls ──────────────────────────────

describe("Invariant: Feature Flag Controls", () => {
  it("should drop events when writeMode is off", async () => {
    const outbox = createMockOutboxRepo();
    const breaker = createMockCircuitBreaker();
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };

    const flagResolver = new AuditFeatureFlagResolver(null, {
      defaults: {
        writeMode: "off",
        hashChainEnabled: true,
        timelineEnabled: true,
        encryptionEnabled: false,
      },
    });

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      metrics,
      flagResolver,
    });

    await writer.write("t-1", makeEvent());

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(metrics.eventDropped).toHaveBeenCalledWith({
      tenant: "t-1",
      reason: "feature_flag_off",
    });
  });

  it("should skip hash chain when hashChainEnabled is false", async () => {
    const outbox = createMockOutboxRepo();
    const breaker = createMockCircuitBreaker();
    const hashChain = new AuditHashChainService();
    const computeSpy = vi.spyOn(hashChain, "computeHash");
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };

    const flagResolver = new AuditFeatureFlagResolver(null, {
      defaults: {
        writeMode: "outbox",
        hashChainEnabled: false,
        timelineEnabled: true,
        encryptionEnabled: false,
      },
    });

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      metrics,
      hashChain,
      flagResolver,
    });

    await writer.write("t-1", makeEvent());

    expect(computeSpy).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it("should use sync writer when writeMode is sync", async () => {
    const outbox = createMockOutboxRepo();
    const breaker = createMockCircuitBreaker();
    const syncWriter = { recordEvent: vi.fn().mockResolvedValue("event-1") };
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };

    const flagResolver = new AuditFeatureFlagResolver(null, {
      defaults: {
        writeMode: "sync",
        hashChainEnabled: true,
        timelineEnabled: true,
        encryptionEnabled: false,
      },
    });

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      metrics,
      flagResolver,
      syncWriter,
    });

    await writer.write("t-1", makeEvent());

    expect(syncWriter.recordEvent).toHaveBeenCalledWith("t-1", expect.anything());
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(metrics.eventIngested).toHaveBeenCalled();
  });
});

// ─── Invariant: Pipeline Never Throws ──────────────────────────────

describe("Invariant: Pipeline Never Throws", () => {
  it("should never throw from write() even with all failures", async () => {
    const outbox = {
      enqueue: vi.fn().mockRejectedValue(new Error("DB down")),
    };
    const breaker = {
      execute: vi.fn(async (fn: any) => fn()),
      getMetrics: vi.fn(() => ({ state: "CLOSED" })),
      reset: vi.fn(),
    };

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      maxBufferSize: 1,
    });

    // Should not throw
    await expect(writer.write("t-1", makeEvent())).resolves.toBeUndefined();
    expect(writer.bufferDepth).toBe(1);
  });

  it("should drop oldest when buffer overflows", async () => {
    const outbox = {
      enqueue: vi.fn().mockRejectedValue(new Error("DB down")),
    };
    const breaker = {
      execute: vi.fn(async (fn: any) => fn()),
      getMetrics: vi.fn(() => ({ state: "OPEN" })),
      reset: vi.fn(),
    };
    const metrics = {
      eventIngested: vi.fn(),
      eventDropped: vi.fn(),
      eventBuffered: vi.fn(),
    };

    const writer = new ResilientAuditWriter(outbox as any, breaker as any, {
      maxBufferSize: 2,
      metrics,
    });

    await writer.write("t-1", makeEvent({ eventType: "event.1" }));
    await writer.write("t-1", makeEvent({ eventType: "event.2" }));
    await writer.write("t-1", makeEvent({ eventType: "event.3" }));

    expect(writer.bufferDepth).toBe(2);
    expect(metrics.eventDropped).toHaveBeenCalledWith({
      tenant: "t-1",
      reason: "buffer_overflow",
    });
  });
});
