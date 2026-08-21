import { describe, expect, it, vi } from "vitest";

import { createEntityMutationOutboxHandler } from "../entity-mutation-outbox.handler.js";

describe("entity mutation durable fan-out", () => {
  it("invalidates list generations, publishes realtime, and delegates search", async () => {
    const incr = vi.fn(async () => 2);
    const publish = vi.fn(async () => 1);
    const search = { handle: vi.fn(async () => undefined) };
    const handler = createEntityMutationOutboxHandler({ redis: { incr, publish }, search });
    const event = {
      id: "event-1", tenant_id: "tenant-1", topic: "entity_mutation",
      event_type: "supplier.updated", event_key: "stable-key", entity_type: "supplier",
      entity_id: "record-1", aggregate_id: null, payload: {}, actor_id: "principal-1",
      attempts: 0, max_attempts: 8, created_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    await handler.handle(event);

    expect(incr).toHaveBeenCalledWith("listver:tenant-1:supplier");
    expect(publish).toHaveBeenCalledWith("record:tenant-1:supplier:record-1", expect.stringContaining('"outboxEventKey":"stable-key"'));
    expect(search.handle).toHaveBeenCalledWith({ ...event, topic: "search" });
  });

  it("does not fan out a stable event twice after a successful retry", async () => {
    const seen = new Set<string>();
    const incr = vi.fn(async () => 2);
    const publish = vi.fn(async () => 1);
    const handler = createEntityMutationOutboxHandler({
      redis: {
        incr,
        publish,
        isProcessed: async (key) => seen.has(key),
        markProcessed: async (key) => { seen.add(key); },
      },
    });
    const event = {
      id: "event-2", tenant_id: "tenant-1", topic: "entity_mutation",
      event_type: "supplier.updated", event_key: "stable-retry-key", entity_type: "supplier",
      entity_id: "record-1", aggregate_id: null, payload: {}, actor_id: "principal-1",
      attempts: 2, max_attempts: 8, created_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    await handler.handle(event);
    await handler.handle(event);

    expect(incr).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
