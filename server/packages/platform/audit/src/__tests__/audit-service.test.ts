import { describe, expect, it } from "vitest";
import { createAuditService, createInMemoryAuditSink, createStructuredLogAuditSink } from "../index.js";

describe("audit service", () => {
  it("stamps and persists a canonical immutable event", async () => {
    const sink = createInMemoryAuditSink();
    const service = createAuditService({ sink, createId: () => "audit-1", now: () => new Date("2026-08-09T00:00:00.000Z") });
    const event = await service.record({
      eventCode: "iam.authentication.succeeded", action: "authenticate", outcome: "success",
      actor: { kind: "user", principalId: "principal-1" }, tenantId: "tenant-1",
    });
    expect(event).toMatchObject({ id: "audit-1", severity: "info" });
    expect(Object.isFrozen(event)).toBe(true);
    expect(sink.events).toEqual([event]);
  });

  it("rejects malformed events before calling the sink", async () => {
    const sink = createInMemoryAuditSink();
    const service = createAuditService({ sink, maxMetadataBytes: 8 });
    await expect(service.record({ eventCode: "bad", action: "authenticate", outcome: "success", actor: { kind: "system" } })).rejects.toThrow("event code");
    await expect(service.record({ eventCode: "iam.authentication.failed", action: "authenticate", outcome: "failure", actor: { kind: "system" }, metadata: { value: "too-large" } })).rejects.toThrow("size limit");
    expect(sink.events).toHaveLength(0);
  });

  it("redacts PII from structured logs", async () => {
    let fields: Readonly<Record<string, unknown>> | undefined;
    const sink = createStructuredLogAuditSink({ info: (_event, value) => { fields = value; } });
    await sink.append({ id: "1", occurredAt: "2026-08-10T00:00:00Z", eventCode: "master.contact.created", action: "create", outcome: "success", severity: "info", actor: { kind: "system" }, metadata: { email: "person@example.com", safe: "kept" } });
    expect(fields).toMatchObject({ metadata: { email: "[REDACTED]", safe: "kept" } });
  });
});
