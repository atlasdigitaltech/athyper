import express from "express";
import { createOpenApiDocument, routeContracts } from "@athyper/server-runtime-http";
import { describe, expect, it, vi } from "vitest";
import { registerNotificationRoutes } from "./notification-routes.js";

describe("notification route contracts", () => {
  it("publishes the four principal notification operations through OpenAPI contracts", () => {
    const application = express();
    registerNotificationRoutes(application, {
      authenticate: (_request, _response, next) => next(),
      readContext: vi.fn() as never,
      inbox: { list: vi.fn(), countUnread: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), dismiss: vi.fn() } as never,
      push: { upsert: vi.fn(), listActive: vi.fn(), deactivate: vi.fn() } as never,
      events: { publish: vi.fn(), subscribe: vi.fn() } as never,
    });
    expect(routeContracts(application).map(({ method, path, operationId }) => ({ method, path, operationId }))).toEqual([
      { method: "get", path: "/api/notifications/push-configuration", operationId: "notifications.getPushConfiguration" },
      { method: "get", path: "/api/notifications/counts", operationId: "notifications.getCounts" },
      { method: "post", path: "/api/notifications/read-all", operationId: "notifications.markAllRead" },
      { method: "post", path: "/api/notifications/:id/dismiss", operationId: "notifications.dismiss" },
    ]);
    const document = createOpenApiDocument(application, { title: "Notifications", version: "1" }) as { readonly paths: Readonly<Record<string, Readonly<Record<string, { readonly operationId: string }>>>> };
    expect(document.paths["/api/notifications/{id}/dismiss"]?.post?.operationId).toBe("notifications.dismiss");
  });
});
