import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import { createRedisNotificationEventBus } from "../redis-notification-event-bus.js";

describe("Redis notification event bus", () => {
  it("fails closed when the optional subscriber cannot be established", async () => {
    const denied = new Error("NOPERM psubscribe");
    const subscriber = {
      status: "ready",
      psubscribe: vi.fn().mockRejectedValue(denied),
      punsubscribe: vi.fn().mockResolvedValue(0),
      disconnect: vi.fn(),
      on: vi.fn(),
    };
    const client = { duplicate: vi.fn().mockReturnValue(subscriber), publish: vi.fn() };

    const bus = createRedisNotificationEventBus(client as unknown as Redis);
    await Promise.resolve();
    await expect(bus.publish({
      type: "notification.created",
      tenantId: "tenant-1",
      principalId: "principal-1",
      notificationId: "notification-1",
      occurredAt: "2026-08-09T00:00:00.000Z",
    })).rejects.toBe(denied);
    await bus.close();
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
  });

  it("fans out only to the matching tenant and principal scope", async () => {
    let onMessage: ((pattern: string, channel: string, message: string) => void) | undefined;
    const subscriber = {
      status: "ready",
      psubscribe: vi.fn().mockResolvedValue(1),
      punsubscribe: vi.fn().mockResolvedValue(1),
      disconnect: vi.fn(),
      on: vi.fn((event: string, listener: typeof onMessage) => {
        if (event === "pmessage") onMessage = listener;
      }),
    };
    const client = {
      duplicate: vi.fn().mockReturnValue(subscriber),
      publish: vi.fn(async (channel: string, message: string) => {
        onMessage?.("athyper:notifications:*", channel, message);
        return 1;
      }),
    };
    const bus = createRedisNotificationEventBus(client as unknown as Redis);
    const matching = vi.fn();
    const otherPrincipal = vi.fn();
    bus.subscribe({ tenantId: "tenant-1", principalId: "principal-1" }, matching);
    bus.subscribe({ tenantId: "tenant-1", principalId: "principal-2" }, otherPrincipal);

    await bus.publish({
      type: "notification.delivery",
      tenantId: "tenant-1",
      principalId: "principal-1",
      deliveryId: "delivery-1",
      deliveryStatus: "delivered",
      occurredAt: "2026-08-09T00:00:00.000Z",
    });
    await Promise.resolve();

    expect(matching).toHaveBeenCalledOnce();
    expect(otherPrincipal).not.toHaveBeenCalled();
    expect(client.publish).toHaveBeenCalledWith(
      "athyper:notifications:tenant-1:principal-1",
      expect.any(String),
    );
    await bus.close();
    expect(subscriber.punsubscribe).toHaveBeenCalledWith("athyper:notifications:*");
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
  });
});
