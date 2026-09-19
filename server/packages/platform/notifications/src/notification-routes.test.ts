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
import { createNotificationPreferenceService } from "./notification-preferences.js";
import { createNotificationOperations, NotificationOperationsError } from "./notification-operations.js";
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
    operations?: ReturnType<typeof createNotificationOperations>;
    recordEmailConsent?: (context: VerifiedRequestContext, consented: boolean) => Promise<unknown>;
    webPushPublicKey?: string;
    webPushAvailable?: boolean;
  } = {},
) {
  const inbox = {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(3),
    markRead: vi.fn().mockResolvedValue(true),
    markAllRead: vi.fn().mockResolvedValue(3),
    dismiss: vi.fn().mockResolvedValue(true),
  };
  const events = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => vi.fn()),
  };
  const push = { upsert: vi.fn().mockResolvedValue({ id: notificationId }), listActive: vi.fn(), deactivate: vi.fn() };
  const store = { get: vi.fn().mockResolvedValue({ preferences: [], version: 2 }), replace: vi.fn().mockResolvedValue(undefined) };
  const timeline = vi.fn().mockResolvedValue(null);
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
        push,
        preferences: createNotificationPreferenceService({ store, capabilities: { supports: async () => true, hasConsent: async () => true }, events: { publish: vi.fn() } }),
        operations: createNotificationOperations({ repository: { timeline, replay: vi.fn() }, authorizer: { authorize: vi.fn() } }),
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
    push,
    store,
    timeline,
    url,
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
  it("records email consent only for the authenticated principal and rejects subject overrides", async () => {
    const recordEmailConsent=vi.fn().mockResolvedValue({consented:true});
    const f=await fixture({recordEmailConsent});
    const endpoint=`${f.url}/api/notifications/preferences/email-consent`;
    const send=(body:unknown,authenticated=true)=>fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",...(authenticated?{authorization:"Bearer test"}:{})},body:JSON.stringify(body)});
    expect((await send({consented:true},false)).status).toBe(401);
    expect((await send({consented:true,subjectId:notificationId})).status).toBe(400);
    expect((await send({consented:"true"})).status).toBe(400);
    expect(recordEmailConsent).not.toHaveBeenCalled();
    expect((await send({consented:true})).status).toBe(200);
    expect(recordEmailConsent).toHaveBeenCalledWith(scope,true);
  });
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


describe("raw notification API regression coverage", () => {
  it.each([
    ["POST", `/api/notifications/${notificationId}/read`],
    ["GET", `/api/notifications/deliveries/${notificationId}/timeline`],
    ["GET", "/api/notifications/inbox"],
    ["GET", "/api/notifications/preferences"],
    ["PATCH", "/api/notifications/preferences"],
    ["POST", "/api/notifications/preferences/preview"],
    ["POST", "/api/notifications/push-subscriptions"],
    ["DELETE", `/api/notifications/push-subscriptions/${notificationId}`],
    ["GET", "/api/notifications/stream"],
  ])("authenticates %s %s", async (method, path) => {
    const f = await fixture();
    expect((await f.request(method!, path!, false)).status).toBe(401);
    expect(f.readContext).not.toHaveBeenCalled();
  });

  it("accepts valid cursor and web push keys without taking scope from the body", async () => {
    const f = await fixture();
    const cursor = Buffer.from(JSON.stringify({ id: notificationId, createdAt: "2026-09-06T00:00:00.000Z" })).toString("base64url");
    expect((await f.request("GET", `/api/notifications/inbox?cursor=${cursor}`)).status).toBe(200);
    expect(f.inbox.list).toHaveBeenCalledWith({ ...scope, limit: 50, unreadOnly: false, cursor });
    const response = await fetch(`${f.url}/api/notifications/push-subscriptions`, { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify({ platform: "web", device_id: "browser", endpoint: "https://push.example.test", p256dh_key: "key", auth_key: "auth", principalId: "other", tenantId: "other", planeKey: "mesh" }) });
    expect(response.status).toBe(201);
    expect(f.push.upsert).toHaveBeenCalledWith(expect.objectContaining({ ...scope, platform: "web", deviceId: "browser", p256dhKey: "key", authKey: "auth" }));
  });

  it("does not misclassify internal TypeErrors as client errors", async () => {
    const f = await fixture();
    f.inbox.list.mockRejectedValue(new TypeError("internal failure"));
    expect((await f.request("GET", "/api/notifications/inbox")).status).toBe(500);
  });

  it.each([
    ["POST", "/api/notifications/invalid/read"],
    ["GET", "/api/notifications/deliveries/invalid/timeline"],
    ["DELETE", "/api/notifications/push-subscriptions/invalid"],
    ["GET", "/api/notifications/inbox?limit=1&limit=2"],
    ["GET", "/api/notifications/inbox?limit=1e1"],
    ["GET", "/api/notifications/inbox?unread=maybe"],
    ["GET", "/api/notifications/inbox?cursor=garbage"],
    ["GET", "/api/notifications/inbox?cursor=a&cursor=b"],
    ...[{ id: notificationId, createdAt: "2026-02-30T00:00:00Z" }, { id: "bad", createdAt: "2026-09-06T00:00:00Z" }].map(value => ["GET", `/api/notifications/inbox?cursor=${Buffer.from(JSON.stringify(value)).toString("base64url")}`]),
  ])("rejects invalid input with 400: %s %s", async (method, path) => {
    const f = await fixture();
    expect((await f.request(method!, path!)).status).toBe(400);
    expect(f.inbox.list).not.toHaveBeenCalled();
    expect(f.inbox.markRead).not.toHaveBeenCalled();
    expect(f.push.deactivate).not.toHaveBeenCalled();
    expect(f.timeline).not.toHaveBeenCalled();
  });

  it.each([undefined, 'W/"2"', '"2', '2"', '9007199254740992'])("rejects invalid If-Match %s", async version => {
    const f = await fixture();
    const response = await fetch(`${f.url}/api/notifications/preferences`, { method: "PATCH", headers: { authorization: "Bearer test", "content-type": "application/json", ...(version ? { "if-match": version } : {}) }, body: JSON.stringify({ preferences: [] }) });
    expect(response.status).toBe(400);
    expect(f.store.replace).not.toHaveBeenCalled();
  });

  it("returns a precondition failure for stale preferences and an ETag on GET", async () => {
    const f = await fixture();
    const get = await f.request("GET", "/api/notifications/preferences");
    expect(get.headers.get("etag")).toBe('"2"');
    expect(f.store.get).toHaveBeenCalledWith(scope);
    const patch = await fetch(`${f.url}/api/notifications/preferences`, { method: "PATCH", headers: { authorization: "Bearer test", "content-type": "application/json", "if-match": '"1"' }, body: JSON.stringify({ preferences: [] }) });
    expect(patch.status).toBe(412);
    expect(f.store.replace).toHaveBeenCalledWith(scope, [], 1);
  });

  it.each([
    ["preferences/preview", { preferences: [{ eventCode: "invoice.approved", channels: ["email", "email"] }] }],
    ["preferences/preview", { preferences: "bad" }],
    ["push-subscriptions", { platform: "web", deviceId: "browser", endpoint: "https://push.example.test" }],
    ["push-subscriptions", { platform: "ios", deviceId: "phone", endpoint: "mobile" }],
    ["push-subscriptions", { platform: "web", deviceId: "browser", endpoint: "https://push.example.test", p256dhKey: {}, authKey: "key" }],
  ])("validates %s payloads before persistence", async (path, body) => {
    const f = await fixture();
    const response = await fetch(`${f.url}/api/notifications/${path}`, { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status).toBe(400);
    expect(f.push.upsert).not.toHaveBeenCalled();
    expect(f.store.replace).not.toHaveBeenCalled();
  });

  it("passes verified scope for inbox, timeline and push deletion", async () => {
    const f = await fixture();
    expect((await f.request("GET", "/api/notifications/inbox?limit=5&unread=true&principalId=other")).status).toBe(200);
    expect(f.inbox.list).toHaveBeenCalledWith({ ...scope, limit: 5, unreadOnly: true, cursor: undefined });
    expect((await f.request("GET", `/api/notifications/deliveries/${notificationId}/timeline`)).status).toBe(404);
    expect(f.timeline).toHaveBeenCalledWith({ context: scope, deliveryId: notificationId, recipientId: scope.principalId });
    expect((await f.request("DELETE", `/api/notifications/push-subscriptions/${notificationId}`)).status).toBe(204);
    expect(f.push.deactivate).toHaveBeenCalledWith({ ...scope, subscriptionId: notificationId, reason: "user_unsubscribed" });
  });

  it("keeps SSE subscribed until the response disconnects", async () => {
    const f = await fixture();
    const controller = new AbortController();
    const response = await f.request("GET", "/api/notifications/stream", true, controller.signal);
    const reader = response.body!.getReader();
    await reader.read();
    const unsubscribe = f.events.subscribe.mock.results[0]!.value;
    expect(unsubscribe).not.toHaveBeenCalled();
    controller.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });
});

describe("notification operations HTTP behavior", () => {
  const base = `/api/operations/notifications/deliveries/${notificationId}`;
  function operations(allowed = true) {
    const repository = {
      timeline: vi.fn().mockResolvedValue(null),
      replay: vi.fn().mockResolvedValue({
        deliveryId: notificationId, replayKey: "incident", replayed: false, status: "pending",
      }),
    };
    return { repository, operations: createNotificationOperations({
      repository, authorizer: { authorize: vi.fn().mockResolvedValue({ allowed }) },
    }) };
  }
  it.each([["GET", "timeline"], ["POST", "replay"]])("authenticates %s %s", async (method, suffix) => {
    const service = operations();
    const f = await fixture(service);
    expect((await f.request(method, `${base}/${suffix}`, false)).status).toBe(401);
    expect(service.repository.timeline).not.toHaveBeenCalled();
    expect(service.repository.replay).not.toHaveBeenCalled();
  });
  it("accepts a header-only replay and returns 202 then 200 for a duplicate", async () => {
    const service = operations();
    const f = await fixture(service);
    const request = () => fetch(`${f.url}${base}/replay`, {
      method: "POST", headers: { authorization: "Bearer test", "idempotency-key": "incident" },
    });
    expect((await request()).status).toBe(202);
    service.repository.replay.mockResolvedValue({
      deliveryId: notificationId, replayKey: "incident", replayed: true, status: "pending",
    });
    expect((await request()).status).toBe(200);
  });
  it("returns permission denials as 403", async () => {
    const service = operations(false);
    const f = await fixture(service);
    expect((await f.request("GET", `${base}/timeline`)).status).toBe(403);
    expect((await fetch(`${f.url}${base}/replay`, {
      method: "POST", headers: { authorization: "Bearer test", "idempotency-key": "incident" },
    })).status).toBe(403);
    expect(service.repository.timeline).not.toHaveBeenCalled();
    expect(service.repository.replay).not.toHaveBeenCalled();
  });
  it.each([404, 409] as const)("preserves replay error %s", async (status) => {
    const service = operations();
    service.repository.replay.mockRejectedValue(new NotificationOperationsError(status, "REPLAY_ERROR", "Replay failed"));
    const f = await fixture(service);
    expect((await fetch(`${f.url}${base}/replay`, {
      method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ replayKey: "incident" }),
    })).status).toBe(status);
  });
  it("returns 404 for an invisible timeline", async () => {
    const f = await fixture(operations());
    expect((await f.request("GET", `${base}/timeline`)).status).toBe(404);
  });
  it("rejects invalid IDs and missing replay keys with 400", async () => {
    const service = operations();
    const f = await fixture(service);
    expect((await f.request("GET", "/api/operations/notifications/deliveries/invalid/timeline")).status).toBe(400);
    expect((await f.request("POST", `${base}/replay`)).status).toBe(400);
    expect(service.repository.timeline).not.toHaveBeenCalled();
    expect(service.repository.replay).not.toHaveBeenCalled();
  });
  it("rejects an oversized replay key with 400", async () => {
    const service = operations();
    const f = await fixture(service);
    expect((await fetch(`${f.url}${base}/replay`, {
      method: "POST", headers: { authorization: "Bearer test", "idempotency-key": "x".repeat(201) },
    })).status).toBe(400);
    expect(service.repository.replay).not.toHaveBeenCalled();
  });
  it("keeps unexpected repository errors as 500", async () => {
    const service = operations();
    service.repository.timeline.mockRejectedValue(new TypeError("internal bug"));
    const f = await fixture(service);
    expect((await f.request("GET", `${base}/timeline`)).status).toBe(500);
  });
});
