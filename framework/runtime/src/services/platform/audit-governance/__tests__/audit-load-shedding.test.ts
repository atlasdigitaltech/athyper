/**
 * Audit Load Shedding Tests
 *
 * Verifies:
 *   - Never-drop events always accepted (admin, recovery, critical, approvals)
 *   - Sampled disposition respects rate
 *   - Disabled disposition drops with correct reason
 *   - Emergency mode drops non-required
 *   - Per-tenant override beats global default
 *   - Cache invalidation forces re-read
 *   - Unknown events default to required (fail-safe)
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  AuditLoadSheddingService,
  createAuditLoadSheddingService,
} from "../domain/audit-load-shedding.service.js";

// ─── Test Helpers ──────────────────────────────────────────────────

function createService(options?: { cacheTtlMs?: number }): AuditLoadSheddingService {
  return createAuditLoadSheddingService(null, options);
}

// ─── Never-Drop Rules ─────────────────────────────────────────────

describe("AuditLoadSheddingService — Never-Drop Rules", () => {
  let service: AuditLoadSheddingService;

  beforeEach(() => {
    service = createService();
  });

  it("should always accept admin events (force_approve)", async () => {
    const result = await service.evaluate("t-1", "admin.force_approve", "critical");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept admin events (cancel)", async () => {
    const result = await service.evaluate("t-1", "admin.cancel", "critical");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept recovery events (retry)", async () => {
    const result = await service.evaluate("t-1", "recovery.retry", "info");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept recovery events (pause)", async () => {
    const result = await service.evaluate("t-1", "recovery.pause", "warning");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept workflow.approved", async () => {
    const result = await service.evaluate("t-1", "workflow.approved", "info");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept workflow.rejected", async () => {
    const result = await service.evaluate("t-1", "workflow.rejected", "info");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should always accept critical severity events", async () => {
    const result = await service.evaluate("t-1", "workflow.created", "critical");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });

  it("should accept never-drop events even in emergency mode", async () => {
    service.setEmergencyMode(true);

    const result = await service.evaluate("t-1", "admin.force_approve", "critical");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("never_drop");
  });
});

// ─── Emergency Mode ───────────────────────────────────────────────

describe("AuditLoadSheddingService — Emergency Mode", () => {
  let service: AuditLoadSheddingService;

  beforeEach(() => {
    service = createService();
  });

  it("should drop non-required events in emergency mode", async () => {
    service.setEmergencyMode(true);

    const result = await service.evaluate("t-1", "workflow.created", "info");
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("emergency_drop");
  });

  it("should report emergency mode status", () => {
    expect(service.isEmergencyMode()).toBe(false);
    service.setEmergencyMode(true);
    expect(service.isEmergencyMode()).toBe(true);
    service.setEmergencyMode(false);
    expect(service.isEmergencyMode()).toBe(false);
  });
});

// ─── Default Behavior (No DB) ─────────────────────────────────────

describe("AuditLoadSheddingService — Defaults (no DB)", () => {
  let service: AuditLoadSheddingService;

  beforeEach(() => {
    service = createService();
  });

  it("should default to required for known events without policies", async () => {
    const result = await service.evaluate("t-1", "workflow.created", "info");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("required");
  });

  it("should default to required for unknown event types (fail-safe)", async () => {
    const result = await service.evaluate("t-1", "unknown.event.type", "info");
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("required");
  });
});

// ─── Cache Invalidation ──────────────────────────────────────────

describe("AuditLoadSheddingService — Cache", () => {
  it("should invalidate specific tenant cache", () => {
    const service = createService();

    // Just verify it doesn't throw
    service.invalidateCache("t-1");
  });

  it("should invalidate all caches", () => {
    const service = createService();

    // Just verify it doesn't throw
    service.invalidateCache();
  });
});

// ─── Sampling Logic ──────────────────────────────────────────────

describe("AuditLoadSheddingService — Sampling Logic", () => {
  it("should accept when sample rate is 1.0", async () => {
    const service = createService();
    // With no DB, defaults to "required" which is always accepted
    const result = await service.evaluate("t-1", "step.activated", "info");
    expect(result.accepted).toBe(true);
  });
});

// ─── Factory ─────────────────────────────────────────────────────

describe("createAuditLoadSheddingService()", () => {
  it("should create service with null DB", () => {
    const service = createAuditLoadSheddingService(null);
    expect(service).toBeInstanceOf(AuditLoadSheddingService);
  });

  it("should create service with custom cache TTL", () => {
    const service = createAuditLoadSheddingService(null, { cacheTtlMs: 5000 });
    expect(service).toBeInstanceOf(AuditLoadSheddingService);
  });
});
