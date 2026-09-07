import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createRelayHandler, NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS } from "../../packages/platform/gateway/bff-relay/src/index";
import { notificationServiceWorkerSource } from "../../packages/platform/communications/notifications-client/src/service-worker";

const root = new URL("../../", import.meta.url);
const app = new URL("apps/neon/app/", root);
const require = createRequire(new URL("apps/neon/package.json", root));
const { getSortedRoutes } = require("next/dist/shared/lib/router/utils/sorted-routes");
const { getRouteRegex } = require("next/dist/shared/lib/router/utils/route-regex");

async function pageRoutes(directory = app, segments: string[] = []): Promise<string[]> {
  const routes: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) routes.push(...await pageRoutes(new URL(`${entry.name}/`, directory), entry.name.startsWith("(") ? segments : [...segments, entry.name]));
    else if (entry.name === "page.tsx") routes.push(`/${segments.join("/")}`);
  }
  return routes;
}

test("Next route precedence sends BP catalogue URLs to the governed page aliases", async () => {
  const routes = getSortedRoutes(await pageRoutes());
  const id = "11111111-1111-4111-8111-111111111111";
  for (const [suffix, expected] of [
    ["business-partners", "business-partners"],
    ["business-partners/new", "business-partners/new"],
    [`business-partners/${id}`, "business-partners/[recordId]"],
    ["requests/new", "requests/new"],
    [`requests/${id}`, "requests/[requestId]"],
  ]) {
    const path = `/mdg/business-partner/${suffix}`;
    assert.equal(routes.find((route: string) => getRouteRegex(route).re.test(path)), `/mdg/business-partner/${expected}`);
  }
});

test("BP aliases redirect to governed workflows and reject malformed record IDs", async () => {
  for (const [page, target] of [
    ["business-partners/page.tsx", "/mdg/business-partner/partners"],
    ["business-partners/new/page.tsx", "/mdg/business-partner/new"],
    ["requests/new/page.tsx", "/mdg/business-partner/new"],
    ["business-partners/[recordId]/page.tsx", "/mdg/business-partner/11111111-1111-4111-8111-111111111111"],
  ]) {
    const result = await build({ entryPoints: [new URL(`(shell)/mdg/business-partner/${page}`, app).pathname], bundle: true, jsx: "automatic", platform: "node", format: "cjs", write: false, external: ["next/navigation"] });
    const module = { exports: {} as { default: (input: unknown) => unknown } };
    runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }) });
    await assert.rejects(async () => module.exports.default({ params: Promise.resolve({ recordId: "11111111-1111-4111-8111-111111111111" }) }), { message: `redirect:${target}` });
    if (page.includes("[recordId]")) await assert.rejects(async () => module.exports.default({ params: Promise.resolve({ recordId: "invalid" }) }), { message: "not-found" });
  }
});

test("every workforce browser operation reaches the runtime with tenant and CSRF enforcement", async () => {
  const source = await readFile(new URL("apps/neon/lib/relay.ts", root), "utf8");
  assert.match(source, /\.\.\.NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS/);
  let calls = 0;
  const handler = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://runtime:4000", appOrigin: "https://neon.example", operations: NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
    session: { resolve: async () => ({ accessToken: "token", plane: "neon", realmKey: "realm", tenantId: "tenant", principalId: "principal", authEpoch: 1, csrfToken: "proof" }), refresh: async () => undefined, invalidate: async () => undefined },
    fetch: async (_url, init) => { calls++; assert.equal(new Headers(init?.headers).get("x-tenant-id"), "tenant"); return Response.json({ ok: true }); },
  });
  assert.equal(NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS.length, 7);
  for (const operation of NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS) {
    const path = operation.path.replace(":requestId", "11111111-1111-4111-8111-111111111111");
    const context = { params: Promise.resolve({ path: path.slice(5).split("/") }) };
    const headers = { origin: "https://neon.example", "content-type": "application/json", "x-csrf-token": "proof", ...(operation.idempotency === "required" ? { "idempotency-key": "test-command" } : {}) };
    const request = (csrf = "proof") => new Request(`https://neon.example/api/relay/${path.slice(5)}`, { method: operation.method, headers: { ...headers, "x-csrf-token": csrf }, ...(operation.method === "POST" ? { body: "{}" } : {}) });
    assert.equal((await handler(request(), context)).status, 200, operation.id);
    if (operation.method === "POST") assert.equal((await handler(request("invalid"), context)).status, 403);
  }
  assert.equal(calls, 7);
});

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const opened: string[] = [], notifications: any[] = [];
  runInNewContext(notificationServiceWorkerSource, { URL, self: {
    location: { origin: "https://neon.example" }, addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; },
    registration: { showNotification: async (title: string, options: unknown) => { notifications.push({ title, options }); } },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  } });
  return { handlers, opened, notifications };
}

test("notification clicks cannot open external origins or throw on malformed URLs", async () => {
  for (const href of ["//evil.example/path", "/\\evil.example/path", "/\t/evil.example/path", "https://evil.example", "javascript:alert(1)", "http://[", null]) {
    const { handlers, opened } = worker(); let pending: Promise<unknown> | undefined;
    handlers.notificationclick({ notification: { close() {}, data: { href } }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    assert.deepEqual(opened, ["https://neon.example/notifications"], String(href));
  }
  const { handlers, opened } = worker(); let pending: Promise<unknown> | undefined;
  handlers.notificationclick({ notification: { close() {}, data: { href: "/inbox?item=123#detail" } }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending; assert.deepEqual(opened, ["https://neon.example/inbox?item=123#detail"]);
});

test("push handles null JSON and normalizes unsafe notification destinations", async () => {
  for (const payload of [null, { data: { href: "/\\evil.example" } }]) {
    const { handlers, notifications } = worker(); let pending: Promise<unknown> | undefined;
    handlers.push({ data: { json: () => payload }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending; assert.equal(notifications[0].options.data.href, "/notifications");
  }
});

test("supplier controls reject invalid route IDs before rendering the client", async () => {
  const result = await build({ entryPoints: [new URL("(shell)/mdg/business-partner/[recordId]/supplier/page.tsx", app).pathname], bundle: true, jsx: "automatic", platform: "node", format: "cjs", write: false, external: ["next/navigation", "@athyper/product-neon-business-partner", "react/jsx-runtime"] });
  const module = { exports: {} as { default: (input: unknown) => Promise<any> } };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: (name: string) => {
    if (name === "next/navigation") return { notFound: () => { throw new Error("not-found"); } };
    if (name === "@athyper/product-neon-business-partner") return { SupplierControls: () => null };
    return require(name);
  } });
  await assert.rejects(() => module.exports.default({ params: Promise.resolve({ recordId: "not-a-record" }) }), { message: "not-found" });
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal((await module.exports.default({ params: Promise.resolve({ recordId: id }) })).props.businessPartnerId, id);
});
