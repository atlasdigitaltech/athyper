/**
 * Hash Chain Service Tests
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  AuditHashChainService,
  GENESIS_HASH,
} from "../domain/hash-chain.service.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";

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
    timestamp: new Date("2025-06-15T10:00:00Z"),
    ...overrides,
  } as Omit<AuditEvent, "id">;
}

describe("AuditHashChainService", () => {
  let svc: AuditHashChainService;

  beforeEach(() => {
    svc = new AuditHashChainService();
  });

  describe("computeHash", () => {
    it("should return GENESIS as hash_prev for first event", async () => {
      const result = await svc.computeHash("t-1", makeEvent());
      expect(result.hash_prev).toBe(GENESIS_HASH);
      expect(result.hash_curr).toBeDefined();
      expect(result.hash_curr.length).toBe(64); // SHA-256 hex
    });

    it("should chain hashes for subsequent events", async () => {
      const first = await svc.computeHash("t-1", makeEvent());
      const second = await svc.computeHash(
        "t-1",
        makeEvent({
          eventType: "workflow.started",
          timestamp: new Date("2025-06-15T10:01:00Z"),
        }),
      );

      expect(second.hash_prev).toBe(first.hash_curr);
      expect(second.hash_curr).not.toBe(first.hash_curr);
    });

    it("should maintain separate chains per tenant", async () => {
      const t1 = await svc.computeHash("tenant-a", makeEvent());
      const t2 = await svc.computeHash("tenant-b", makeEvent());

      // Both should start from genesis
      expect(t1.hash_prev).toBe(GENESIS_HASH);
      expect(t2.hash_prev).toBe(GENESIS_HASH);

      // But their hashes differ due to different tenant IDs
      expect(t1.hash_curr).not.toBe(t2.hash_curr);
    });

    it("should produce deterministic hashes for same input", async () => {
      const event = makeEvent();
      const svc2 = new AuditHashChainService();

      const result1 = await svc.computeHash("t-1", event);
      const result2 = await svc2.computeHash("t-1", event);

      expect(result1.hash_curr).toBe(result2.hash_curr);
    });
  });

  describe("verifyChain", () => {
    it("should verify a valid chain", async () => {
      const events: any[] = [];

      for (let i = 0; i < 5; i++) {
        const event = makeEvent({
          eventType: i % 2 === 0 ? "workflow.created" : "workflow.started",
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
      expect(verification.brokenAtEventId).toBeUndefined();
    });

    it("should detect a tampered event", async () => {
      const events: any[] = [];

      for (let i = 0; i < 3; i++) {
        const event = makeEvent({
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

      // Tamper with the second event's hash_curr
      events[1].hash_curr = "tampered-hash";

      const svc2 = new AuditHashChainService();
      const verification = svc2.verifyChain("t-1", events);
      expect(verification.valid).toBe(false);
    });

    it("should return valid for empty events", () => {
      const verification = svc.verifyChain("t-1", []);
      expect(verification.valid).toBe(true);
    });
  });
});
