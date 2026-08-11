import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuditEvent, AuditEventSink, AuditRecorder } from "../index.js";

describe("audit contract API", () => {
  it("remains transport and persistence independent", () => {
    const event = {
      id: "audit-1",
      occurredAt: "2026-08-09T00:00:00.000Z",
      eventCode: "iam.authentication.succeeded",
      action: "authenticate",
      outcome: "success",
      severity: "info",
      actor: { kind: "user", principalId: "principal-1" },
      tenantId: "tenant-1",
    } as const satisfies AuditEvent;
    expect(event.eventCode).toBe("iam.authentication.succeeded");
    expectTypeOf<AuditRecorder>().toHaveProperty("record");
    expectTypeOf<AuditEventSink>().toHaveProperty("append");
  });
});
