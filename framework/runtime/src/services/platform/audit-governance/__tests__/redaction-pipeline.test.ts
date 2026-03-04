/**
 * Redaction Pipeline Tests
 */
import { describe, it, expect } from "vitest";

import {
  AuditRedactionPipeline,
  REDACTION_VERSION,
} from "../domain/redaction-pipeline.js";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";

// Stub MaskingService
const stubMasking = {
  mask: (value: unknown, strategy: string, opts?: any) => {
    if (strategy === "partial" && typeof value === "string") {
      const visible = opts?.visibleChars ?? 3;
      return value.substring(0, visible) + "***";
    }
    return "[MASKED]";
  },
} as any;

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

describe("AuditRedactionPipeline", () => {
  const pipeline = new AuditRedactionPipeline(stubMasking);

  it("should strip denylist keys from details", () => {
    const event = makeEvent({
      details: {
        token: "secret123",
        password: "hunter2",
        api_key: "key-abc",
        normalField: "visible",
      },
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    expect(result.event.details?.token).toBe("[REDACTED]");
    expect(result.event.details?.password).toBe("[REDACTED]");
    expect(result.event.details?.api_key).toBe("[REDACTED]");
    expect(result.event.details?.normalField).toBe("visible");
  });

  it("should mask email patterns in details", () => {
    const event = makeEvent({
      details: {
        submittedBy: "john.doe@example.com",
      },
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    // Email should be partially masked
    expect(result.event.details?.submittedBy).not.toBe("john.doe@example.com");
    expect(result.event.details?.submittedBy).toContain("***@");
  });

  it("should mask phone patterns in details", () => {
    const event = makeEvent({
      details: {
        contactPhone: "+12025551234",
      },
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    const masked = result.event.details?.contactPhone as string;
    // Last 4 digits should be visible
    expect(masked).toContain("1234");
    expect(masked).toContain("*");
  });

  it("should mask PII in comment field", () => {
    const event = makeEvent({
      comment: "Contact user at john@example.com for details",
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    expect(result.event.comment).not.toContain("john@example.com");
    expect(result.event.comment).toContain("***@");
  });

  it("should handle nested objects in details", () => {
    const event = makeEvent({
      details: {
        nested: {
          secret: "hidden",
          visible: "ok",
        },
      },
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    const nested = result.event.details?.nested as Record<string, unknown>;
    expect(nested.secret).toBe("[REDACTED]");
    expect(nested.visible).toBe("ok");
  });

  it("should not mutate the original event", () => {
    const event = makeEvent({
      details: { password: "secret" },
    });

    const original = JSON.parse(JSON.stringify(event));
    pipeline.redact(event);

    expect(event.details?.password).toBe("secret");
    expect(JSON.stringify(event)).toBe(JSON.stringify(original));
  });

  it("should set redaction version", () => {
    const event = makeEvent({ details: { password: "secret" } });
    const result = pipeline.redact(event);
    expect(result.redactionVersion).toBe(REDACTION_VERSION);
  });

  it("should not flag wasRedacted when no redaction needed", () => {
    const event = makeEvent({
      details: { amount: 100, status: "approved" },
    });

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(false);
  });

  it("should mask actor email", () => {
    const event = makeEvent();
    (event.actor as any).email = "alice@example.com";

    const result = pipeline.redact(event);
    expect(result.wasRedacted).toBe(true);
    expect((result.event.actor as any).email).toContain("***@");
  });
});
