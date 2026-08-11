import { describe, expect, expectTypeOf, it } from "vitest";
import { buildDurableEventKey } from "../index.js";
import type { DomainEvent, EventPublisher, OutboxWriter } from "../index.js";

describe("events contract API", () => {
  it("builds stable encoded event identities", () => {
    expect(buildDurableEventKey({
      tenantId: "tenant/one",
      aggregateType: "invoice",
      aggregateId: "inv 1",
      version: 2,
      eventType: "invoice.updated",
    })).toBe("tenant%2Fone/invoice/inv%201/2/invoice.updated");
  });

  it("exposes publisher and outbox ports without a storage type", () => {
    expectTypeOf<EventPublisher>().toHaveProperty("publish");
    expectTypeOf<OutboxWriter>().toHaveProperty("append");
    expectTypeOf<DomainEvent>().toHaveProperty("payload");
  });
});
