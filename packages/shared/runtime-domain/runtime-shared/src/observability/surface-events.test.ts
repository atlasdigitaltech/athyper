import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitSurfaceEvent,
  setSurfaceEventSink,
  type SurfaceEvent,
} from "./surface-events";

afterEach(() => setSurfaceEventSink(undefined));

describe("surface events", () => {
  it("emits canonical fields without query or identifier data", () => {
    const events: SurfaceEvent[] = [];
    setSurfaceEventSink((event) => {
      events.push(event);
    });
    const event = emitSurfaceEvent({
      name: "surface_opened",
      plane: "mesh",
      scopeType: "network_account",
      scopeId: "buyer-42",
      surfaceCode: "content.hub",
      route: "/content/550e8400-e29b-41d4-a716-446655440000?token=secret",
      durationMs: 12.345,
      result: "success",
      correlationId: "corr-1",
    });
    expect(events).toEqual([event]);
    expect(event.route).toBe("/content/:id");
    expect(event.durationMs).toBe(12.35);
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("does not let collector failure break an interaction", () => {
    setSurfaceEventSink(vi.fn(() => {
      throw new Error("collector unavailable");
    }));
    expect(() => emitSurfaceEvent({
      name: "document_actioned",
      plane: "neon",
      scopeType: "tenant",
      surfaceCode: "document",
      route: "/app/purchase_invoice/1",
      durationMs: 5,
      result: "failure",
    })).not.toThrow();
  });
});
