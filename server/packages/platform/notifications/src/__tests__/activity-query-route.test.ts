import express from "express";
import { it, expect, vi } from "vitest";
import { registerNotificationRoutes } from "../notification-routes.js";
import type {
  InAppNotification,
  InAppNotificationRepository,
  PushSubscriptionRepository,
  NotificationEventPublisher,
  NotificationEventSubscriber,
} from "@athyper/server-contract-notifications";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
it("searches all repository pages after authorized presentation and retains global unread count", async () => {
  const context = {
    tenantId: "t",
    principalId: "p",
    planeKey: "neon",
  } as VerifiedRequestContext;
  const rows = Array.from(
    { length: 120 },
    (_, i) =>
      ({
        id: String(i),
        createdAt: "2026-09-20T00:00:00Z",
        title: i === 110 ? "Stale secret" : "Update",
        payload: {},
        eventCode: "comment.mentioned",
      }) as InAppNotification,
  );
  const list = vi.fn(
    async (input: Parameters<InAppNotificationRepository["list"]>[0]) =>
      input.cursor ? rows.slice(100) : rows.slice(0, 100),
  );
  const inbox = {
    list,
    countUnread: async () => 8,
  } as unknown as InAppNotificationRepository;
  const app = express();
  registerNotificationRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    readContext: () => context,
    inbox,
    push: {} as PushSubscriptionRepository,
    events: {} as NotificationEventPublisher & NotificationEventSubscriber,
    presentInbox: async (_ctx, items) =>
      items.map((row, i) => ({
        ...row,
        title: i === 110 ? "Record unavailable" : row.title,
        recordLabel: i === 115 ? "Needle supplier" : undefined,
      })),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  try {
    const get = async (search: string) => {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/notifications/inbox?limit=1&activityQuery=${encodeURIComponent(JSON.stringify({ search }))}`,
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    const result = await get("Needle");
    expect(result.notifications.map((r: InAppNotification) => r.id)).toEqual([
      "115",
    ]);
    expect(result.matchingCount).toBe(1);
    expect(result.unreadCount).toBe(8);
    expect(list).toHaveBeenCalledTimes(2);
    expect((await get("Stale secret")).matchingCount).toBe(0);
    for (const [input] of list.mock.calls)
      expect(input).toMatchObject({
        tenantId: "t",
        principalId: "p",
        planeKey: "neon",
      });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
