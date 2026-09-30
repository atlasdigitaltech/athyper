import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  createRelayHandler,
  NEON_WORKFORCE_READ_RELAY_OPERATIONS,
  NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
  NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS,
} from "../../packages/platform/gateway/bff-relay/src/index";
import { notificationServiceWorkerSource } from "../../packages/platform/communications/notifications-client/src/service-worker";
import {
  entityApplicationPublicPath,
  resolveNeonEntityApplicationPublicRoute,
} from "../../apps/neon/lib/catalog-routes";

const root = new URL("../../", import.meta.url);
test("BP public aliases resolve to one governed Entity Framework surface", () => {
  for (const pathname of [
    "/mdg/business-partner",
    "/mdg/business-partner/partners",
    "/mdg/business-partner/business-partners",
  ]) {
    assert.deepEqual(resolveNeonEntityApplicationPublicRoute(pathname), {
      publicPath: "/mdg/business-partner/manage",
      publicAliases: [
        "/mdg/business-partner",
        "/mdg/business-partner/partners",
        "/mdg/business-partner/business-partners",
      ],
      internalPath: "/app/entity/business_partner/manage",
      workspaceCode: "mdg",
      moduleCode: "bp",
      entityCode: "business_partner",
      surfaceKey: "manage",
    });
  }
  assert.equal(
    entityApplicationPublicPath("business_partner", ["manage"]),
    "/mdg/business-partner/manage",
  );
  assert.equal(
    resolveNeonEntityApplicationPublicRoute(
      "/mdg/business-partner/business-partners/new",
    ),
    undefined,
  );
});

test("every workforce browser operation reaches the runtime with tenant and CSRF enforcement", async () => {
  const source = await readFile(
    new URL("apps/neon/lib/relay.ts", root),
    "utf8",
  );
  assert.match(source, /\.\.\.NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS/);
  let calls = 0;
  const handler = createRelayHandler({
    plane: "neon",
    runtimeApiUrl: "http://runtime:4000",
    appOrigin: "https://neon.example",
    operations: NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
    session: {
      resolve: async () => ({
        accessToken: "token",
        plane: "neon",
        realmKey: "realm",
        tenantId: "tenant",
        principalId: "principal",
        authEpoch: 1,
        csrfToken: "proof",
      }),
      refresh: async () => undefined,
      invalidate: async () => undefined,
    },
    fetch: async (_url, init) => {
      calls++;
      assert.equal(new Headers(init?.headers).get("x-tenant-id"), "tenant");
      return Response.json({ ok: true });
    },
  });
  assert.equal(NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS.length, 7);
  for (const operation of NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS) {
    const path = operation.path.replace(
      ":requestId",
      "11111111-1111-4111-8111-111111111111",
    );
    const context = {
      params: Promise.resolve({ path: path.slice(5).split("/") }),
    };
    const headers = {
      origin: "https://neon.example",
      "content-type": "application/json",
      "x-csrf-token": "proof",
      ...(operation.idempotency === "required"
        ? { "idempotency-key": "test-command" }
        : {}),
    };
    const request = (csrf = "proof") =>
      new Request(`https://neon.example/api/relay/${path.slice(5)}`, {
        method: operation.method,
        headers: { ...headers, "x-csrf-token": csrf },
        ...(operation.method === "POST" ? { body: "{}" } : {}),
      });
    assert.equal((await handler(request(), context)).status, 200, operation.id);
    if (operation.method === "POST")
      assert.equal((await handler(request("invalid"), context)).status, 403);
  }
  assert.equal(calls, 7);
});

test("employee directory and detail reads are admitted only through the tenant relay", async () => {
  const source = await readFile(
    new URL("apps/neon/lib/relay.ts", root),
    "utf8",
  );
  assert.match(source, /\.\.\.NEON_WORKFORCE_READ_RELAY_OPERATIONS/);
  const paths: string[] = [];
  const handler = createRelayHandler({
    plane: "neon",
    runtimeApiUrl: "http://runtime:4000",
    appOrigin: "https://neon.example",
    operations: NEON_WORKFORCE_READ_RELAY_OPERATIONS,
    session: {
      resolve: async () => ({
        accessToken: "token",
        plane: "neon",
        realmKey: "realm",
        tenantId: "tenant",
        principalId: "principal",
        authEpoch: 1,
        csrfToken: "proof",
      }),
      refresh: async () => undefined,
      invalidate: async () => undefined,
    },
    fetch: async (url, init) => {
      paths.push(String(url));
      assert.equal(new Headers(init?.headers).get("x-tenant-id"), "tenant");
      return Response.json([]);
    },
  });
  assert.equal(NEON_WORKFORCE_READ_RELAY_OPERATIONS.length, 3);
  for (const operation of NEON_WORKFORCE_READ_RELAY_OPERATIONS) {
    const path = operation.path
      .replace(":employeeId", "11111111-1111-4111-8111-111111111111")
      .replace(":section", "team");
    const response = await handler(
      new Request(`https://neon.example/api/relay/${path.slice(5)}`),
      { params: Promise.resolve({ path: path.slice(5).split("/") }) },
    );
    assert.equal(response.status, 200, operation.id);
  }
  assert.equal(paths.length, 3);
});

test("employee saved views use the authenticated platform preference authority", async () => {
  const source = await readFile(
    new URL("apps/neon/lib/relay.ts", root),
    "utf8",
  );
  assert.match(source, /\.\.\.NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS/);
  let calls = 0;
  const handler = createRelayHandler({
    plane: "neon",
    runtimeApiUrl: "http://runtime:4000",
    appOrigin: "https://neon.example",
    operations: NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS,
    session: {
      resolve: async () => ({
        accessToken: "token",
        plane: "neon",
        realmKey: "realm",
        tenantId: "tenant",
        principalId: "principal",
        authEpoch: 1,
        csrfToken: "proof",
      }),
      refresh: async () => undefined,
      invalidate: async () => undefined,
    },
    fetch: async (_url, init) => {
      calls++;
      assert.equal(new Headers(init?.headers).get("x-tenant-id"), "tenant");
      return Response.json([]);
    },
  });
  for (const operation of NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS) {
    const path = operation.path.replace(":entity", "employee"),
      response = await handler(
        new Request(`https://neon.example/api/relay/${path.slice(5)}`, {
          method: operation.method,
          headers:
            operation.method === "POST"
              ? {
                  "content-type": "application/json",
                  origin: "https://neon.example",
                  "x-csrf-token": "proof",
                }
              : undefined,
          body:
            operation.method === "POST"
              ? JSON.stringify({
                  name: "Active",
                  surfaceCode: "employee_directory",
                  state: { status: "employed" },
                })
              : undefined,
        }),
        { params: Promise.resolve({ path: path.slice(5).split("/") }) },
      );
    assert.equal(response.status, 200, operation.id);
  }
  assert.equal(calls, 2);
});

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const opened: string[] = [],
    notifications: any[] = [];
  runInNewContext(notificationServiceWorkerSource, {
    URL,
    self: {
      location: { origin: "https://neon.example" },
      addEventListener: (name: string, handler: (event: any) => void) => {
        handlers[name] = handler;
      },
      registration: {
        showNotification: async (title: string, options: unknown) => {
          notifications.push({ title, options });
        },
      },
      clients: {
        matchAll: async () => [],
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
    },
  });
  return { handlers, opened, notifications };
}

test("notification clicks cannot open external origins or throw on malformed URLs", async () => {
  for (const href of [
    "//evil.example/path",
    "/\\evil.example/path",
    "/\t/evil.example/path",
    "https://evil.example",
    "javascript:alert(1)",
    "http://[",
    null,
  ]) {
    const { handlers, opened } = worker();
    let pending: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: { close() {}, data: { href } },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    assert.deepEqual(
      opened,
      ["https://neon.example/notifications"],
      String(href),
    );
  }
  const { handlers, opened } = worker();
  let pending: Promise<unknown> | undefined;
  handlers.notificationclick({
    notification: { close() {}, data: { href: "/inbox?item=123#detail" } },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  assert.deepEqual(opened, ["https://neon.example/inbox?item=123#detail"]);
});

test("push handles null JSON and normalizes unsafe notification destinations", async () => {
  for (const payload of [null, { data: { href: "/\\evil.example" } }]) {
    const { handlers, notifications } = worker();
    let pending: Promise<unknown> | undefined;
    handlers.push({
      data: { json: () => payload },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    assert.equal(notifications[0].options.data.href, "/notifications");
  }
});
