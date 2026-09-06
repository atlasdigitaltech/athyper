import { createServer, type Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import express from "express";
import {
  createOpenApiDocument,
  createHttpApplication,
  HttpError,
  routeContracts,
} from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerNotificationRoutes } from "./notification-routes.js";

describe("notification route contracts", () => {
  it("publishes the four principal notification operations through OpenAPI contracts", () => {
    const application = express();
    registerNotificationRoutes(application, {
      authenticate: (_request, _response, next) => next(),
      readContext: vi.fn() as never,
      inbox: {
        list: vi.fn(),
        countUnread: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        dismiss: vi.fn(),
      } as never,
      push: {
        upsert: vi.fn(),
        listActive: vi.fn(),
        deactivate: vi.fn(),
      } as never,
      events: { publish: vi.fn(), subscribe: vi.fn() } as never,
    });
    expect(
      routeContracts(application).map(({ method, path, operationId }) => ({
        method,
        path,
        operationId,
      })),
    ).toEqual([
      {
        method: "get",
        path: "/api/notifications/push-configuration",
        operationId: "notifications.getPushConfiguration",
      },
      {
        method: "get",
        path: "/api/notifications/counts",
        operationId: "notifications.getCounts",
      },
      {
        method: "post",
        path: "/api/notifications/read-all",
        operationId: "notifications.markAllRead",
      },
      {
        method: "post",
        path: "/api/notifications/:id/dismiss",
        operationId: "notifications.dismiss",
      },
    ]);
    const document = createOpenApiDocument(application, {
      title: "Notifications",
      version: "1",
    }) as {
      readonly paths: Readonly<
        Record<
          string,
          Readonly<Record<string, { readonly operationId: string }>>
        >
      >;
    };
    expect(
      document.paths["/api/notifications/{id}/dismiss"]?.post,
    ).toMatchObject({
      operationId: "notifications.dismiss",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            format: "uuid",
            pattern: expect.any(String),
          },
        },
      ],
      responses: {
        204: expect.any(Object),
        400: expect.any(Object),
        401: expect.any(Object),
        404: expect.any(Object),
      },
    });
  });
});

const notificationId = "11111111-1111-4111-8111-111111111111";
const scope = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  principalId: "33333333-3333-4333-8333-333333333333",
  planeKey: "neon" as const,
};
const endpoints = [
  ["GET", "/api/notifications/push-configuration"],
  ["GET", "/api/notifications/counts"],
  ["POST", "/api/notifications/read-all"],
  ["POST", `/api/notifications/${notificationId}/dismiss`],
] as const;

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

async function fixture(
  configuration: {
    webPushPublicKey?: string;
    webPushAvailable?: boolean;
  } = {},
) {
  const inbox = {
    create: vi.fn(),
    list: vi.fn(),
    countUnread: vi.fn().mockResolvedValue(3),
    markRead: vi.fn().mockResolvedValue(true),
    markAllRead: vi.fn().mockResolvedValue(3),
    dismiss: vi.fn().mockResolvedValue(true),
  };
  const events = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
  const readContext = vi.fn(() => scope as VerifiedRequestContext);
  const application = createHttpApplication({
    openApi: { title: "Notifications", version: "1", enforceResponses: true },
    configure(app) {
      registerNotificationRoutes(app, {
        authenticate: (request, _response, next) =>
          next(
            request.header("authorization") === "Bearer test"
              ? undefined
              : new HttpError(
                  401,
                  "AUTHENTICATION_REQUIRED",
                  "Authentication required",
                ),
          ),
        readContext,
        inbox,
        events,
        push: { upsert: vi.fn(), listActive: vi.fn(), deactivate: vi.fn() },
        ...configuration,
      });
    },
  });
  const server = createServer(application);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No server address");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    inbox,
    events,
    readContext,
    request: (
      method: string,
      path: string,
      authenticated = true,
      signal?: AbortSignal,
    ) =>
      fetch(`${url}${path}`, {
        method,
        signal,
        headers: authenticated ? { authorization: "Bearer test" } : {},
      }),
  };
}

describe("notification HTTP behavior", () => {
  it.each(endpoints)(
    "requires authentication for %s %s",
    async (method, path) => {
      const f = await fixture();
      expect((await f.request(method, path, false)).status).toBe(401);
      expect(f.readContext).not.toHaveBeenCalled();
      expect(f.inbox.countUnread).not.toHaveBeenCalled();
      expect(f.inbox.markAllRead).not.toHaveBeenCalled();
      expect(f.inbox.dismiss).not.toHaveBeenCalled();
      expect(f.events.publish).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{}, { available: false }],
    [{ webPushPublicKey: "key" }, { available: false }],
    [
      { webPushPublicKey: "key", webPushAvailable: false },
      { available: false },
    ],
    [{ webPushPublicKey: "  ", webPushAvailable: true }, { available: false }],
    [
      { webPushPublicKey: " key ", webPushAvailable: true },
      { available: true, publicKey: "key" },
    ],
  ])(
    "reports configured browser push capability: %j",
    async (config, expected) => {
      const f = await fixture(config);
      const response = await f.request(
        "GET",
        "/api/notifications/push-configuration",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ webPush: expected });
    },
  );

  it.each([0, 3])(
    "returns unread count %s using only the verified scope",
    async (unread) => {
      const f = await fixture();
      f.inbox.countUnread.mockResolvedValue(unread);
      const response = await f.request(
        "GET",
        "/api/notifications/counts?tenantId=other&principalId=other&planeKey=mesh",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ unread });
      expect(f.inbox.countUnread).toHaveBeenCalledExactlyOnceWith(scope);
    },
  );

  it.each([0, 3])(
    "returns the committed read-all result (%s rows) and publishes its scope",
    async (updated) => {
      const f = await fixture();
      f.inbox.markAllRead.mockResolvedValue(updated);
      const response = await f.request(
        "POST",
        "/api/notifications/read-all?principalId=other&planeKey=mesh",
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ updated, readAt: expect.any(String) });
      expect(new Date(body.readAt).toISOString()).toBe(body.readAt);
      expect(f.inbox.markAllRead).toHaveBeenCalledExactlyOnceWith({
        ...scope,
        readAt: body.readAt,
      });
      expect(f.events.publish).toHaveBeenCalledExactlyOnceWith({
        type: "notification.refresh",
        tenantId: scope.tenantId,
        principalId: scope.principalId,
        occurredAt: body.readAt,
      });
    },
  );

  it("dismisses only for the verified scope and returns an empty 204", async () => {
    const f = await fixture();
    const response = await f.request(
      "POST",
      `/api/notifications/${notificationId}/dismiss?principalId=other`,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(f.inbox.dismiss).toHaveBeenCalledExactlyOnceWith({
      ...scope,
      notificationId,
      dismissedAt: expect.any(String),
    });
    expect(f.events.publish).toHaveBeenCalledExactlyOnceWith({
      type: "notification.refresh",
      tenantId: scope.tenantId,
      principalId: scope.principalId,
      notificationId,
      occurredAt: f.inbox.dismiss.mock.calls[0]![0].dismissedAt,
    });
  });

  it("returns 404 for a missing or foreign notification without publishing", async () => {
    const f = await fixture();
    f.inbox.dismiss.mockResolvedValue(false);
    const response = await f.request(
      "POST",
      `/api/notifications/${notificationId}/dismiss`,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOTIFICATION_NOT_FOUND" });
    expect(f.events.publish).not.toHaveBeenCalled();
  });

  it.each([
    "not-a-uuid",
    "11111111-1111-0111-8111-111111111111",
    "11111111-1111-4111-7111-111111111111",
  ])("rejects invalid dismiss ID %s as 400", async (id) => {
    const f = await fixture();
    const response = await f.request(
      "POST",
      `/api/notifications/${id}/dismiss`,
    );
    expect(response.status).toBe(400);
    expect(f.inbox.dismiss).not.toHaveBeenCalled();
    expect(f.events.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/notifications/read-all", 200],
    [`/api/notifications/${notificationId}/dismiss`, 204],
    [`/api/notifications/${notificationId}/read`, 204],
  ])(
    "preserves committed success when broadcasting fails: %s",
    async (path, status) => {
      const f = await fixture();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      f.events.publish.mockRejectedValue(new Error("Redis unavailable"));
      const response = await f.request("POST", path);
      expect(response.status).toBe(status);
      expect(f.events.publish).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["/api/notifications/read-all", 200, "markAllRead"],
    [`/api/notifications/${notificationId}/dismiss`, 204, "dismiss"],
    [`/api/notifications/${notificationId}/read`, 204, "markRead"],
  ] as const)(
    "responds after commit without waiting for a stalled publisher: %s",
    async (path, status, operation) => {
      const f = await fixture();
      let finishPublishing!: () => void;
      f.events.publish.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishPublishing = resolve;
          }),
      );
      try {
        const response = await f.request(
          "POST",
          path,
          true,
          AbortSignal.timeout(1000),
        );
        expect(response.status).toBe(status);
        expect(f.inbox[operation]).toHaveBeenCalledOnce();
        expect(f.events.publish).toHaveBeenCalledOnce();
        if (status === 200)
          expect(await response.json()).toEqual({
            updated: 3,
            readAt: expect.any(String),
          });
        else expect(await response.text()).toBe("");
      } finally {
        finishPublishing?.();
      }
    },
  );

  it("handles a broadcast rejection after the committed response has been sent", async () => {
    const f = await fixture();
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    let failPublishing!: (error: Error) => void;
    f.events.publish.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          failPublishing = reject;
        }),
    );
    try {
      const response = await f.request(
        "POST",
        "/api/notifications/read-all",
        true,
        AbortSignal.timeout(1000),
      );
      expect(response.status).toBe(200);
    } finally {
      failPublishing?.(new Error("Redis disconnected after commit"));
    }
    await vi.waitFor(() =>
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        "[notifications] inbox_event_publish_failed type=notification.refresh",
      ),
    );
  });

  it.each([
    ["/api/notifications/read-all", 200, "markAllRead", 3],
    [`/api/notifications/${notificationId}/dismiss`, 204, "dismiss", true],
  ] as const)(
    "waits for persistence before responding or broadcasting: %s",
    async (path, status, operation, result) => {
      const f = await fixture();
      let commit!: (value: number | boolean) => void;
      f.inbox[operation].mockImplementation(
        () =>
          new Promise((resolve) => {
            commit = resolve;
          }),
      );
      let responded = false;
      const response = f
        .request("POST", path, true, AbortSignal.timeout(1000))
        .then((value) => {
          responded = true;
          return value;
        });
      try {
        await vi.waitFor(() =>
          expect(f.inbox[operation]).toHaveBeenCalledOnce(),
        );
        expect(responded).toBe(false);
        expect(f.events.publish).not.toHaveBeenCalled();
      } finally {
        commit?.(result);
      }
      expect((await response).status).toBe(status);
      expect(f.events.publish).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["GET", "/api/notifications/counts", "countUnread"],
    ["POST", "/api/notifications/read-all", "markAllRead"],
    ["POST", `/api/notifications/${notificationId}/dismiss`, "dismiss"],
  ] as const)(
    "reports persistence failures for %s %s",
    async (method, path, operation) => {
      const f = await fixture();
      f.inbox[operation].mockRejectedValue(new Error("Database unavailable"));
      expect((await f.request(method, path)).status).toBe(500);
      expect(f.events.publish).not.toHaveBeenCalled();
    },
  );
});
