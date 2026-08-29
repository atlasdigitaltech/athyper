import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ATLAS_ANSWER_RELAY_OPERATIONS, ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS, createRelayHandler, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, IAM_ME_OPERATION, RECORD_TRANSFER_RELAY_OPERATIONS, type RelayDiagnostic, type RelayOperation, type RelaySessionAuthority, type RelaySessionContext } from "../../packages/platform/gateway/bff-relay/src/index";

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const session = (plane = "neon", tenantId = "tenant-1", token = "server-token"): RelaySessionContext => ({ accessToken: token, plane, realmKey: "athyper", tenantId, principalId: "principal-1", authEpoch: 7, csrfToken: "csrf-proof" });
function authority(current = session()): RelaySessionAuthority & { invalidated: number; refreshed: number } { return { invalidated: 0, refreshed: 0, resolve: async () => current, refresh: async function () { this.refreshed++; return { ...current, accessToken: "refreshed-token" }; }, invalidate: async function () { this.invalidated++; } }; }
function relay(input: { plane?: string; operation?: RelayOperation; authority?: RelaySessionAuthority; fetch?: typeof fetch; diagnostics?: RelayDiagnostic[]; timeout?: number } = {}) { return createRelayHandler({ plane: input.plane ?? "neon", runtimeApiUrl: "http://platform-host:4000/api", appOrigin: "https://neon.example", operations: [input.operation ?? IAM_ME_OPERATION], session: input.authority ?? authority(), fetch: input.fetch ?? (async () => new Response("{}", { headers: { "content-type": "application/json" } })), timeouts: input.timeout ? { json: input.timeout, stream: input.timeout, upload: input.timeout, download: input.timeout } : undefined, onDiagnostic: (value) => input.diagnostics?.push(value) }); }

describe("Phase 4 hardened BFF relay", () => {
  it("registers governed Atlas confirmation, cancellation, and audit history in every plane", async () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /ATLAS_ANSWER_RELAY_OPERATIONS/);
      assert.match(source, /operations:\s*\[[^\]]*\.\.\.ATLAS_ANSWER_RELAY_OPERATIONS/s);
    }
    const handler = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://platform:4000", appOrigin: "https://neon.example", operations: ATLAS_ANSWER_RELAY_OPERATIONS, session: authority(), fetch: async () => new Response('{"proposalId":"10000000-0000-4000-8000-000000000001","outcome":"completed"}', { headers: { "content-type": "application/json" } }) });
    assert.equal((await handler(new Request("https://neon.example/api/relay/atlas/tools/history"), context("atlas", "tools", "history"))).status, 200);
    assert.equal((await handler(new Request("https://neon.example/api/relay/atlas/tools/10000000-0000-4000-8000-000000000001/run", { method: "POST", headers: { origin: "https://neon.example", "x-csrf-token": "csrf-proof", "content-type": "application/json" }, body: "{}" }), context("atlas", "tools", "10000000-0000-4000-8000-000000000001", "run"))).status, 428);
  });
  it("exposes published experience reads to every plane and Studio-only authoring relays",async()=>{assert.ok(ATLAS_ANSWER_RELAY_OPERATIONS.some((item)=>item.path==="/api/atlas/experience"));const studio=readFileSync(new URL("../../apps/studio/lib/relay.ts",import.meta.url),"utf8");assert.match(studio,/ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS/);assert.equal(ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS.filter((item)=>item.method!=="GET").every((item)=>item.idempotency==="required"),true);for(const plane of ["neon","mesh"]){const source=readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`,import.meta.url),"utf8");assert.doesNotMatch(source,/ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS/);}});
  it("registers descriptor and list reads in every plane that hosts the shared List View", () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /ENTITY_LIST_DESCRIPTOR_OPERATION/);
      assert.match(source, /ENTITY_LIST_QUERY_OPERATION/);
      assert.match(source, /operations:\s*\[[^\]]*ENTITY_LIST_DESCRIPTOR_OPERATION[^\]]*ENTITY_LIST_QUERY_OPERATION/s);
    }
  });

  it("registers the bounded transfer workspace and governed import relay operations in every plane", async () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /RECORD_TRANSFER_RELAY_OPERATIONS/);
      assert.match(source, /operations:\s*\[[^\]]*\.\.\.RECORD_TRANSFER_RELAY_OPERATIONS/s);
    }
    let upstream = "";
    const handler = createRelayHandler({
      plane: "neon",
      runtimeApiUrl: "http://platform-host:4000/api",
      appOrigin: "https://neon.example",
      operations: RECORD_TRANSFER_RELAY_OPERATIONS,
      session: authority(),
      fetch: async (url) => { upstream = String(url); return new Response('{"items":[]}', { headers: { "content-type": "application/json" } }); },
    });
    const list = await handler(new Request("https://neon.example/api/relay/records/transfers?limit=50"), context("records", "transfers"));
    assert.equal(list.status, 200);
    assert.equal(upstream, "http://platform-host:4000/api/records/transfers?limit=50");
    const unsafeWithoutCsrf = await handler(new Request("https://neon.example/api/relay/records/business_partner/imports", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "import-1" },
      body: "{}",
    }), context("records", "business_partner", "imports"));
    assert.equal(unsafeWithoutCsrf.status, 403);
  });

  it("allowlists only the declared entity-list read paths and preserves bounded query parameters", async () => {
    let upstream = "";
    const handler = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://platform-host:4000/api", appOrigin: "https://neon.example", operations: [ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION], session: authority(), fetch: async (url) => { upstream = String(url); return new Response("{}", { headers: { "content-type": "application/json" } }); } });
    assert.equal((await handler(new Request("https://neon.example/api/relay/entity-runtime/invoice/list?limit=25"), context("entity-runtime", "invoice", "list"))).status, 200);
    assert.equal(upstream, "http://platform-host:4000/api/entity-runtime/invoice/list?limit=25");
    assert.equal((await handler(new Request("https://neon.example/api/relay/records/invoice"), context("records", "invoice"))).status, 404);
  });

  it("injects verified identity for /api/iam/me in every plane without exposing it to the browser", async () => {
    for (const plane of ["neon", "mesh", "studio"]) { let upstreamHeaders = new Headers(); let upstreamUrl = ""; const handler = relay({ plane, authority: authority(session(plane)), fetch: async (url, init) => { upstreamUrl = String(url); upstreamHeaders = new Headers(init?.headers); return new Response(JSON.stringify({ principal: "safe" }), { headers: { "content-type": "application/json", "x-request-id": "request-1", "set-cookie": "fixation=bad", "x-plane": plane, authorization: "Bearer leak" } }); } });
      const response = await handler(new Request(`https://${plane}.example/api/relay/iam/me`, { headers: { authorization: "Bearer attacker", "x-plane": "mesh", "x-tenant-id": "attacker", "x-principal-id": "attacker", "x-realm": "evil", "x-org": "evil", forwarded: "for=evil", "x-real-ip": "127.0.0.1" } }), context("iam", "me"));
      assert.equal(response.status, 200); assert.equal(upstreamUrl, "http://platform-host:4000/api/iam/me"); assert.equal(upstreamHeaders.get("authorization"), "Bearer server-token"); assert.equal(upstreamHeaders.get("x-plane"), plane); assert.equal(upstreamHeaders.get("x-tenant-id"), "tenant-1"); assert.equal(upstreamHeaders.get("x-principal-id"), "principal-1"); assert.equal(upstreamHeaders.get("forwarded"), null); assert.equal(upstreamHeaders.get("x-real-ip"), null); assert.equal(upstreamHeaders.get("x-org"), null); assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("authorization"), null); assert.equal(response.headers.get("x-plane"), null);
    }
  });

  it("rejects SSRF, traversal, encoded slash/dot segments, and non-allowlisted methods", async () => {
    const handler = relay(); const attacks: Array<[string, string[]]> = [["https://neon.example/api/relay/https:/evil.example", ["https:", "evil.example"]], ["https://neon.example/api/relay/../iam/me", ["..", "iam", "me"]], ["https://neon.example/api/relay/%2fiam/me", ["/iam", "me"]], ["https://neon.example/api/relay/%252e%252e/iam/me", ["%2e%2e", "iam", "me"]]];
    for (const [url, path] of attacks) assert.ok((await handler(new Request(url), context(...path))).status >= 400);
    assert.equal((await handler(new Request("https://neon.example/api/relay/iam/me", { method: "POST" }), context("iam", "me"))).status, 404);
  });

  it("enforces same-origin CSRF and tenant/plane binding for unsafe operations", async () => {
    const operation: RelayOperation = { id: "tenant.item", method: "POST", path: "/api/tenants/:tenantId/items", tenantParam: "tenantId", idempotency: "required" }; const handler = relay({ operation });
    const request = (headers: HeadersInit = {}, tenant = "tenant-1") => new Request(`https://neon.example/api/relay/tenants/${tenant}/items`, { method: "POST", headers: { origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-proof", "idempotency-key": "create-1", "content-type": "application/json", ...headers }, body: "{}" });
    assert.equal((await handler(request(), context("tenants", "tenant-1", "items"))).status, 200); assert.equal((await handler(request({ origin: "https://evil.example" }), context("tenants", "tenant-1", "items"))).status, 403); assert.equal((await handler(request({ "x-csrf-token": "wrong" }), context("tenants", "tenant-1", "items"))).status, 403); assert.equal((await handler(request({}, "tenant-2"), context("tenants", "tenant-2", "items"))).status, 403);
    const rotating = { ...session(), csrfToken: "csrf-current", acceptedCsrfTokens: ["csrf-current", "csrf-previous"] }; assert.equal((await relay({ operation, authority: authority(rotating) })(request({ "x-csrf-token": "csrf-previous" }), context("tenants", "tenant-1", "items"))).status, 200);
    assert.equal((await relay({ operation, authority: authority(session("mesh")) })(request(), context("tenants", "tenant-1", "items"))).status, 403);
  });

  it("enforces header/body limits and rejects compressed request ambiguity", async () => {
    const operation: RelayOperation = { id: "write", method: "POST", path: "/api/write", maxBodyBytes: 8, idempotency: "optional" }; const handler = relay({ operation }); const base = { method: "POST", headers: { origin: "https://neon.example", "x-csrf-token": "csrf-proof", "idempotency-key": "write-1", "content-type": "application/json" }, body: "123456789" } satisfies RequestInit;
    assert.equal((await handler(new Request("https://neon.example/api/relay/write", base), context("write"))).status, 413);
    assert.equal((await handler(new Request("https://neon.example/api/relay/write", { ...base, body: "{}", headers: { ...base.headers, "content-encoding": "gzip" } }), context("write"))).status, 415);
    const headers = new Headers(base.headers); headers.set("x-padding", "x".repeat(256)); const smallHeaderRelay = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://platform:4000", appOrigin: "https://neon.example", operations: [operation], session: authority(), maxHeaderBytes: 64 }); assert.equal((await smallHeaderRelay(new Request("https://neon.example/api/relay/write", { method: "POST", headers, body: "{}" }), context("write"))).status, 431);
  });

  it("streams without pre-reading, strips unsafe response headers, and cancels on disconnect", async () => {
    let pulls = 0; let cancelled = false; const client = new AbortController(); const operation: RelayOperation = { id: "events", method: "GET", path: "/api/events", requestClass: "stream" }; const handler = relay({ operation, fetch: async () => new Response(new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode("event: ready\n\n")); }, cancel() { cancelled = true; } }), { headers: { "content-type": "text/event-stream", etag: "v1", "set-cookie": "bad=1", connection: "keep-alive" } }) });
    const response = await handler(new Request("https://neon.example/api/relay/events", { signal: client.signal }), context("events")); assert.ok(pulls <= 2); assert.equal(response.headers.get("etag"), "v1"); assert.equal(response.headers.get("set-cookie"), null); const reader = response.body!.getReader(); await reader.read(); client.abort(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(cancelled, true); await reader.cancel();
  });

  it("propagates connection timeout and caller cancellation", async () => {
    const waitingFetch: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => { if (init?.signal?.aborted) reject(init.signal.reason); else init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); }); const timeout = await relay({ fetch: waitingFetch, timeout: 10 })(new Request("https://neon.example/api/relay/iam/me"), context("iam", "me")); assert.equal(timeout.status, 504);
    const client = new AbortController(); const pending = relay({ fetch: waitingFetch, timeout: 1000 })(new Request("https://neon.example/api/relay/iam/me", { signal: client.signal }), context("iam", "me")); client.abort(); assert.equal((await pending).status, 499);
  });

  it("delegates eligible 401 refresh to the session authority and retries only once", async () => {
    let refreshCalls = 0; let active = session(); const sharedAuthority: RelaySessionAuthority = { resolve: async () => active, refresh: async () => { refreshCalls++; await new Promise((resolve) => setTimeout(resolve, 20)); active = { ...active, accessToken: "refreshed-token" }; return active; }, invalidate: async () => undefined };
    let upstreamCalls = 0; const handler = relay({ authority: sharedAuthority, fetch: async (_url, init) => { upstreamCalls++; return new Headers(init?.headers).get("authorization") === "Bearer refreshed-token" ? new Response("{}") : new Response("", { status: 401 }); } }); const request = () => handler(new Request("https://neon.example/api/relay/iam/me"), context("iam", "me")); const [first, second] = await Promise.all([request(), request()]); assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(refreshCalls, 2); assert.equal(upstreamCalls, 4);
  });

  it("never shares refreshed authority between concurrent browser sessions", async () => {
    const sessions = new Map<string, RelaySessionContext>([
      ["a", { ...session("neon", "tenant-1", "expired-a"), principalId: "principal-a" }],
      ["b", { ...session("neon", "tenant-1", "expired-b"), principalId: "principal-b" }],
    ]);
    const sessionId = (request: Request) => request.headers.get("cookie")?.match(/sid=([^;]+)/)?.[1] ?? "";
    const isolatedAuthority: RelaySessionAuthority = {
      resolve: async (request) => sessions.get(sessionId(request)),
      refresh: async (request) => {
        const id = sessionId(request); const current = sessions.get(id); if (!current) return undefined;
        await new Promise((resolve) => setTimeout(resolve, id === "a" ? 20 : 5));
        const refreshed = { ...current, accessToken: `token-${id}` }; sessions.set(id, refreshed); return refreshed;
      },
      invalidate: async () => undefined,
    };
    const handler = relay({ authority: isolatedAuthority, fetch: async (_url, init) => {
      const authorization = new Headers(init?.headers).get("authorization")!;
      return authorization.startsWith("Bearer token-") ? new Response(authorization) : new Response("", { status: 401 });
    } });
    const call = (id: string) => handler(new Request("https://neon.example/api/relay/iam/me", { headers: { cookie: `sid=${id}` } }), context("iam", "me"));
    const [a, b] = await Promise.all([call("a"), call("b")]);
    assert.equal(await a.text(), "Bearer token-a"); assert.equal(await b.text(), "Bearer token-b");
  });

  it("does not retry non-idempotent mutations without an idempotency key", async () => {
    let upstreamCalls = 0; const auth = authority(); const operation: RelayOperation = { id: "command", method: "POST", path: "/api/command", idempotency: "optional" }; const handler = relay({ operation, authority: auth, fetch: async () => { upstreamCalls++; return new Response("", { status: 401 }); } });
    const response = await handler(new Request("https://neon.example/api/relay/command", { method: "POST", headers: { origin: "https://neon.example", "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-proof", "content-type": "application/json" }, body: "{}" }), context("command")); assert.equal(response.status, 401); assert.equal(upstreamCalls, 1); assert.equal(auth.refreshed, 0);
  });

  it("invalidates context mismatch without refresh loops and keeps diagnostics redacted", async () => {
    const auth = authority(); const diagnostics: RelayDiagnostic[] = []; const handler = relay({ authority: auth, diagnostics, fetch: async () => new Response(JSON.stringify({ code: "AUTH_CONTEXT_MISMATCH", detail: "secret-body" }), { status: 403, headers: { "content-type": "application/problem+json", "x-request-id": "request-7" } }) }); const response = await handler(new Request("https://neon.example/api/relay/iam/me", { headers: { cookie: "secret-cookie", authorization: "Bearer browser-secret" } }), context("iam", "me")); assert.equal(response.status, 409); assert.equal(response.headers.get("x-athyper-session-action"), "select_context"); assert.equal(auth.invalidated, 1); assert.equal(auth.refreshed, 0); const serialized = JSON.stringify(diagnostics); assert.doesNotMatch(serialized, /server-token|secret-cookie|browser-secret|secret-body/);
  });
});
