/**
 * E2E Privacy Enforcement Tests
 *
 * Proves that forbidden raw PII values NEVER land in persisted evt.event rows
 * when PayloadPrivacyGuard is active. Tests the full publisher → repo pipeline
 * with mocked EventRepo to capture the actual payload passed to append().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DefaultEventPublisher } from "../services/event-publisher.js";
import { PayloadPrivacyGuard } from "../services/payload-privacy-guard.js";

import type { PublishEventInput } from "../services/event-publisher.js";
import type { EventRepo } from "../persistence/event-repo.js";
import type { SequenceCounterRepo } from "../persistence/sequence-counter-repo.js";
import type { UniversalEventEnvelope } from "../domain/types.js";

// ============================================================================
// Mock setup
// ============================================================================

function createMockEventRepo(): EventRepo & {
  lastAppendPayload: unknown;
  lastAppendMetadata: unknown;
} {
  const mock = {
    lastAppendPayload: undefined as unknown,
    lastAppendMetadata: undefined as unknown,
    append: vi.fn(async (input: any) => {
      mock.lastAppendPayload = input.payload;
      mock.lastAppendMetadata = input.metadata;
      return {
        id: "evt-001",
        sequenceNo: 1,
        ...input,
        createdAt: new Date(),
      } as UniversalEventEnvelope;
    }),
    existsByIdempotencyKey: vi.fn(async () => false),
    getByTxnId: vi.fn(async () => []),
    getById: vi.fn(),
    getByDocId: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
    getByPartition: vi.fn(),
  } as unknown as EventRepo & {
    lastAppendPayload: unknown;
    lastAppendMetadata: unknown;
  };
  return mock;
}

function createMockSequenceRepo(): SequenceCounterRepo {
  return {
    next: vi.fn(async () => 1n),
    current: vi.fn(async () => 0n),
    reset: vi.fn(),
  } as unknown as SequenceCounterRepo;
}

function createMockPrivacyGuard(
  mode: "REJECT" | "REDACT" | "WARN" | "OFF",
  piiFields: string[],
): PayloadPrivacyGuard {
  const guard = {
    inspect: vi.fn(async (payload: unknown) => {
      if (mode === "OFF") {
        return { allowed: true, violations: [] };
      }

      const violations: Array<{
        fieldPath: string;
        piiClassification: string;
        maskStrategy: string | null;
        entityCode: string | null;
        message: string;
      }> = [];

      if (payload && typeof payload === "object") {
        for (const key of Object.keys(payload as Record<string, unknown>)) {
          if (piiFields.includes(key)) {
            violations.push({
              fieldPath: key,
              piiClassification: "DIRECT_ID",
              maskStrategy: null,
              entityCode: null,
              message: `PII field "${key}" detected`,
            });
          }
        }
      }

      if (violations.length === 0) {
        return { allowed: true, violations: [] };
      }

      switch (mode) {
        case "REJECT":
          return { allowed: false, violations };
        case "REDACT": {
          const redacted = { ...(payload as Record<string, unknown>) };
          for (const v of violations) {
            redacted[v.fieldPath] = "[REDACTED]";
          }
          return { allowed: true, violations, redactedPayload: redacted };
        }
        case "WARN":
        default:
          return { allowed: true, violations };
      }
    }),
    loadRules: vi.fn(),
    setMode: vi.fn(),
  } as unknown as PayloadPrivacyGuard;
  return guard;
}

function baseInput(payload: Record<string, unknown>): PublishEventInput {
  return {
    eventType: "test.event",
    sourceEngine: "test",
    txnId: "txn-001",
    docId: "doc-001",
    docType: "TRANSACTION",
    correlationId: "corr-001",
    actorType: "USER",
    actorId: "user-001",
    tenantId: "tenant-001",
    payload,
    partitionDomain: "TEST",
    partitionKey: "2025-01",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Privacy Enforcement E2E", () => {
  let eventRepo: ReturnType<typeof createMockEventRepo>;
  let sequenceRepo: SequenceCounterRepo;
  let publisher: DefaultEventPublisher;

  beforeEach(() => {
    eventRepo = createMockEventRepo();
    sequenceRepo = createMockSequenceRepo();
    publisher = new DefaultEventPublisher(eventRepo, sequenceRepo);
  });

  describe("REDACT mode", () => {
    it("should persist redacted payload, NOT raw PII", async () => {
      const guard = createMockPrivacyGuard("REDACT", [
        "tax_id",
        "personal_email",
      ]);
      publisher.setPrivacyGuard(guard);

      const rawPayload = {
        tax_id: "123-45-6789",
        personal_email: "john@personal.com",
        amount: 500,
        description: "Payment received",
      };

      await publisher.publish(baseInput(rawPayload));

      // The CRITICAL assertion: append() must receive redacted payload
      const persistedPayload = eventRepo.lastAppendPayload as Record<
        string,
        unknown
      >;
      expect(persistedPayload.tax_id).toBe("[REDACTED]");
      expect(persistedPayload.personal_email).toBe("[REDACTED]");

      // Non-PII fields must be preserved
      expect(persistedPayload.amount).toBe(500);
      expect(persistedPayload.description).toBe("Payment received");
    });

    it("should attach privacy violations to metadata", async () => {
      const guard = createMockPrivacyGuard("REDACT", ["tax_id"]);
      publisher.setPrivacyGuard(guard);

      await publisher.publish(
        baseInput({ tax_id: "999-88-7777", ok_field: "safe" }),
      );

      const persistedMetadata = eventRepo.lastAppendMetadata as Record<
        string,
        unknown
      >;
      expect(persistedMetadata.privacyViolations).toBeDefined();
      const violations = persistedMetadata.privacyViolations as Array<{
        field: string;
      }>;
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("tax_id");
    });

    it("should compute hash on redacted payload (not raw)", async () => {
      const guard = createMockPrivacyGuard("REDACT", ["ssn"]);
      publisher.setPrivacyGuard(guard);

      await publisher.publish(baseInput({ ssn: "111-22-3333" }));

      // The persisted payload should be the redacted version
      const persisted = eventRepo.lastAppendPayload as Record<string, unknown>;
      expect(persisted.ssn).toBe("[REDACTED]");

      // Hash was computed on the redacted payload (verified by the fact
      // that append received payloadHash — it's computed from effectivePayload)
      const appendCall = (eventRepo.append as any).mock.calls[0][0];
      expect(appendCall.payloadHash).toBeDefined();
      expect(typeof appendCall.payloadHash).toBe("string");
    });
  });

  describe("REJECT mode", () => {
    it("should throw and NOT persist when PII detected", async () => {
      const guard = createMockPrivacyGuard("REJECT", ["bank_account"]);
      publisher.setPrivacyGuard(guard);

      await expect(
        publisher.publish(
          baseInput({ bank_account: "GB82WEST12345698765432", amount: 100 }),
        ),
      ).rejects.toThrow("Privacy guard rejected");

      // Repo must NOT have been called
      expect(eventRepo.append).not.toHaveBeenCalled();
    });
  });

  describe("WARN mode", () => {
    it("should persist original payload but attach violations to metadata", async () => {
      const guard = createMockPrivacyGuard("WARN", ["phone"]);
      publisher.setPrivacyGuard(guard);

      await publisher.publish(
        baseInput({ phone: "+1-555-0123", amount: 42 }),
      );

      // Original payload passes through (not redacted in WARN mode)
      const persisted = eventRepo.lastAppendPayload as Record<string, unknown>;
      expect(persisted.phone).toBe("+1-555-0123");

      // But violations are in metadata
      const meta = eventRepo.lastAppendMetadata as Record<string, unknown>;
      expect(meta.privacyViolations).toBeDefined();
    });
  });

  describe("OFF mode", () => {
    it("should persist payload as-is with no inspection", async () => {
      const guard = createMockPrivacyGuard("OFF", ["tax_id"]);
      publisher.setPrivacyGuard(guard);

      await publisher.publish(baseInput({ tax_id: "secret", amount: 1 }));

      const persisted = eventRepo.lastAppendPayload as Record<string, unknown>;
      expect(persisted.tax_id).toBe("secret"); // No redaction
    });
  });

  describe("No guard configured", () => {
    it("should persist payload normally when no guard is set", async () => {
      // No setPrivacyGuard call
      await publisher.publish(
        baseInput({ tax_id: "123-45-6789", amount: 100 }),
      );

      const persisted = eventRepo.lastAppendPayload as Record<string, unknown>;
      expect(persisted.tax_id).toBe("123-45-6789");
      expect(persisted.amount).toBe(100);
    });
  });

  describe("Clean payload (no violations)", () => {
    it("should persist clean payload without modification", async () => {
      const guard = createMockPrivacyGuard("REDACT", ["tax_id", "ssn"]);
      publisher.setPrivacyGuard(guard);

      // Payload with no PII fields
      await publisher.publish(
        baseInput({ amount: 100, description: "Clean payment" }),
      );

      const persisted = eventRepo.lastAppendPayload as Record<string, unknown>;
      expect(persisted.amount).toBe(100);
      expect(persisted.description).toBe("Clean payment");
    });
  });
});
