import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { clearedAuthSessionCookies } from "../../packages/platform/iam/auth-bff/src/index";
import { describe, it } from "node:test";
import ts from "typescript";
import { ATLAS_ANSWER_RELAY_OPERATIONS, ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS, createRelayHandler, ENTITY_APPLICATION_DESCRIPTOR_OPERATION, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, IAM_ME_OPERATION, NEON_BP_INVITATION_CREATE_OPERATION, RECORD_TRANSFER_RELAY_OPERATIONS, type RelayDiagnostic, type RelayOperation, type RelaySessionAuthority, type RelaySessionContext } from "../../packages/platform/gateway/bff-relay/src/index";

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
// Inspect the actual relay configuration. Conditional pilot arrays can contain
// their own closing brackets; imports and conditional branches do not prove
// that a required operation is always registered.
function registeredOperations(source: string): ReadonlySet<string> {
  const file = ts.createSourceFile("relay.ts", source, ts.ScriptTarget.Latest, true);
  const registered = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createRelayHandler") {
      const options = node.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const property = options.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(file) === "operations");
        if (property && ts.isPropertyAssignment(property) && ts.isArrayLiteralExpression(property.initializer)) {
          for (const element of property.initializer.elements) {
            if (ts.isIdentifier(element)) registered.add(element.text);
            else if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) registered.add(element.expression.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return registered;
}
const session = (plane = "neon", tenantId = "tenant-1", token = "server-token"): RelaySessionContext => ({ accessToken: token, plane, realmKey: "athyper", tenantId, principalId: "principal-1", authEpoch: 7, csrfToken: "csrf-proof" });
function authority(current = session()): RelaySessionAuthority & { invalidated: number; refreshed: number } { return { invalidated: 0, refreshed: 0, resolve: async () => current, refresh: async function () { this.refreshed++; return { ...current, accessToken: "refreshed-token" }; }, invalidate: async function () { this.invalidated++; } }; }
function relay(input: { plane?: string; operation?: RelayOperation; authority?: RelaySessionAuthority; fetch?: typeof fetch; diagnostics?: RelayDiagnostic[]; timeout?: number } = {}) { return createRelayHandler({ plane: input.plane ?? "neon", runtimeApiUrl: "http://platform-host:4000/api", appOrigin: "https://neon.example", operations: [input.operation ?? IAM_ME_OPERATION], session: input.authority ?? authority(), fetch: input.fetch ?? (async () => new Response("{}", { headers: { "content-type": "application/json" } })), timeouts: input.timeout ? { json: input.timeout, stream: input.timeout, upload: input.timeout, download: input.timeout } : undefined, onDiagnostic: (value) => input.diagnostics?.push(value) }); }

describe("Phase 4 hardened BFF relay", () => {
  it("checks unconditional relay registrations after nested pilot arrays", () => {
    const source = `const unused = [IMPORTED_ONLY]; createRelayHandler({ operations: [
      ...(enabled ? [PILOT_ONLY] : []), REQUIRED_READ, ...REQUIRED_GROUP,
    ] });`;
    assert.deepEqual([...registeredOperations(source)], ["REQUIRED_READ", "REQUIRED_GROUP"]);
    assert.equal(registeredOperations(source).has("IMPORTED_ONLY"), false);
    assert.equal(registeredOperations(source).has("PILOT_ONLY"), false);
    assert.equal(registeredOperations(source.replace("...REQUIRED_GROUP", "")).has("REQUIRED_GROUP"), false);
  });
  it("clears local session cookies and requires login after Runtime context revocation", async () => {
    for (const plane of ["neon", "mesh", "studio"]) for (const production of [true, false]) {
      let active: RelaySessionContext | undefined = session(plane);
      let calls = 0;
      const handler = relay({ plane, authority: {
        resolve: async () => active,
        refresh: async () => assert.fail("context mismatch must not refresh"),
        invalidate: async () => { active = undefined; return clearedAuthSessionCookies(production); },
      }, fetch: async () => { calls++; return Response.json({ code: "AUTH_CONTEXT_MISMATCH" }, { status: 403, headers: { "set-cookie": "upstream=untrusted" } }); } });
      const request = () => new Request(`https://${plane}.example/api/relay/iam/me`);
      const response = await handler(request(), context("iam", "me"));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("x-athyper-session-action"), "login");
      const cookies = response.headers.getSetCookie();
      const prefix = production ? "__Host-" : "";
      assert.deepEqual(cookies, [
        `${prefix}athyper-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? "; Secure" : ""}`,
        `${prefix}athyper-csrf=; Path=/; SameSite=Lax; Max-Age=0${production ? "; Secure" : ""}`,
      ]);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const after = await handler(request(), context("iam", "me"));
      assert.equal(after.status, 401);
      assert.equal(calls, 1, "revoked sessions cannot call Runtime");
    }
  });

  it("relays the complete gzip-decoded body without compressed framing headers", async () => {
    const payload = "x".repeat(10_000);
    const compressed = gzipSync(payload);
    assert.notEqual(compressed.length, Buffer.byteLength(payload));
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip", "content-length": String(compressed.length), "x-request-id": "gzip-test" });
      response.end(compressed);
    });
    await new Promise<void>((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
    try {
      const address = upstream.address();
      assert.ok(address && typeof address !== "string");
      for (const plane of ["neon", "mesh", "studio"]) {
        const handler = createRelayHandler({ plane, runtimeApiUrl: `http://127.0.0.1:${address.port}`, appOrigin: `https://${plane}.example`, operations: [IAM_ME_OPERATION], session: authority(session(plane)) });
        const response = await handler(new Request(`https://${plane}.example/api/relay/iam/me`), context("iam", "me"));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-length"), null);
        assert.equal(response.headers.get("content-encoding"), null);
        assert.equal(response.headers.get("content-type"), "text/plain");
        assert.equal(response.headers.get("x-request-id"), "gzip-test");
        assert.equal(await response.text(), payload);
      }
    } finally {
      await new Promise<void>((resolve, reject) => { upstream.close(error => error ? reject(error) : resolve()); upstream.closeAllConnections(); });
    }
  });

  it("leaves framing to the server for uncompressed and bodyless responses", async () => {
    for (const status of [200, 204, 304]) {
      const handler = relay({ fetch: async () => new Response(status === 200 ? "hello" : null, { status, headers: { "content-length": status === 200 ? "5" : "0", etag: "v1" } }) });
      const response = await handler(new Request("https://neon.example/api/relay/iam/me"), context("iam", "me"));
      assert.equal(response.status, status);
      assert.equal(response.headers.get("content-length"), null);
      assert.equal(response.headers.get("etag"), "v1");
      assert.equal(await response.text(), status === 200 ? "hello" : "");
    }
  });

  it("requires session, CSRF and idempotency before relaying a bounded invitation create", async () => {
    let calls = 0;
    const handler = relay({ operation: NEON_BP_INVITATION_CREATE_OPERATION, fetch: async () => { calls++; return Response.json({ invitation: { id: "fixture" } }, { status: 201 }); } });
    const send = (headers: Record<string,string>) => handler(new Request("https://neon.example/api/relay/neon/business-partner-invitations", {
      method: "POST", headers: { origin: "https://neon.example", "content-type": "application/json", ...headers }, body: "{}",
    }), context("neon", "business-partner-invitations"));
    assert.equal((await send({ "x-csrf-token": "csrf-proof" })).status, 428);
    assert.equal((await send({ "idempotency-key": "invitation-1", "x-csrf-token": "wrong" })).status, 403);
    assert.equal(calls, 0);
    assert.equal((await send({ "idempotency-key": "invitation-1", "x-csrf-token": "csrf-proof" })).status, 201);
    assert.equal(calls, 1);
    const anonymous = relay({ operation: NEON_BP_INVITATION_CREATE_OPERATION, authority: { resolve: async () => null, refresh: async () => null, invalidate: async () => {} } });
    assert.equal((await anonymous(new Request("https://neon.example/api/relay/neon/business-partner-invitations", { method: "POST", body: "{}" }), context("neon", "business-partner-invitations"))).status, 401);
  });
  it("registers governed Atlas confirmation, cancellation, and audit history in every plane", async () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /ATLAS_ANSWER_RELAY_OPERATIONS/);
      assert.ok(registeredOperations(source).has("ATLAS_ANSWER_RELAY_OPERATIONS"), `${plane} must register Atlas operations`);
    }
    const handler = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://platform:4000", appOrigin: "https://neon.example", operations: ATLAS_ANSWER_RELAY_OPERATIONS, session: authority(), fetch: async () => new Response('{"proposalId":"10000000-0000-4000-8000-000000000001","outcome":"completed"}', { headers: { "content-type": "application/json" } }) });
    assert.equal((await handler(new Request("https://neon.example/api/relay/atlas/tools/history"), context("atlas", "tools", "history"))).status, 200);
    assert.equal((await handler(new Request("https://neon.example/api/relay/atlas/tools/10000000-0000-4000-8000-000000000001/run", { method: "POST", headers: { origin: "https://neon.example", "x-csrf-token": "csrf-proof", "content-type": "application/json" }, body: "{}" }), context("atlas", "tools", "10000000-0000-4000-8000-000000000001", "run"))).status, 428);
    assert.equal(ATLAS_ANSWER_RELAY_OPERATIONS.some((item)=>item.path==="/api/attachments/stage"),true);
    assert.equal(ATLAS_ANSWER_RELAY_OPERATIONS.some((item)=>item.path==="/api/attachments/:attachmentId/status"),true);
  });
  it("exposes published experience reads to every plane and Studio-only authoring relays",async()=>{assert.ok(ATLAS_ANSWER_RELAY_OPERATIONS.some((item)=>item.path==="/api/atlas/experience"));const studio=readFileSync(new URL("../../apps/studio/lib/relay.ts",import.meta.url),"utf8");assert.match(studio,/ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS/);assert.equal(ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS.filter((item)=>item.method!=="GET").every((item)=>item.idempotency==="required"),true);for(const plane of ["neon","mesh"]){const source=readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`,import.meta.url),"utf8");assert.doesNotMatch(source,/ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS/);}});
  it("allowlists governed Atlas conversation history and lifecycle routes",()=>{for(const signature of [["GET","/api/atlas/threads"],["GET","/api/atlas/threads/:threadId/messages"],["GET","/api/atlas/threads/:threadId/export"],["PATCH","/api/atlas/threads/:threadId"],["POST","/api/atlas/threads/:threadId/archive"]]as const)assert.ok(ATLAS_ANSWER_RELAY_OPERATIONS.some((item)=>item.method===signature[0]&&item.path===signature[1]));assert.equal(ATLAS_ANSWER_RELAY_OPERATIONS.filter((item)=>item.method==="PATCH"||item.path.endsWith("/archive")).every((item)=>item.idempotency==="required"),true);});
  it("registers descriptor and list reads in every plane that hosts the shared List View", () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /ENTITY_LIST_DESCRIPTOR_OPERATION/);
      assert.match(source, /ENTITY_LIST_QUERY_OPERATION/);
      const operations = registeredOperations(source);
      assert.ok(operations.has("ENTITY_VIEWS_RELAY_OPERATIONS"), `${plane} must register entity view operations`);
      assert.ok(operations.has("ENTITY_APPLICATION_DESCRIPTOR_OPERATION"), `${plane} must register application descriptor reads`);
      assert.ok(operations.has("ENTITY_LIST_DESCRIPTOR_OPERATION"), `${plane} must register descriptor reads`);
      assert.ok(operations.has("ENTITY_LIST_QUERY_OPERATION"), `${plane} must register list queries`);
    }
  });

  it("registers the bounded transfer workspace and governed import relay operations in every plane", async () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const source = readFileSync(new URL(`../../apps/${plane}/lib/relay.ts`, import.meta.url), "utf8");
      assert.match(source, /RECORD_TRANSFER_RELAY_OPERATIONS/);
      assert.ok(registeredOperations(source).has("RECORD_TRANSFER_RELAY_OPERATIONS"), `${plane} must register transfer operations`);
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
    const handler = createRelayHandler({ plane: "neon", runtimeApiUrl: "http://platform-host:4000/api", appOrigin: "https://neon.example", operations: [ENTITY_APPLICATION_DESCRIPTOR_OPERATION, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION], session: authority(), fetch: async (url) => { upstream = String(url); return new Response("{}", { headers: { "content-type": "application/json" } }); } });
    assert.equal((await handler(new Request("https://neon.example/api/relay/entity-runtime/invoice/list?limit=25"), context("entity-runtime", "invoice", "list"))).status, 200);
    assert.equal(upstream, "http://platform-host:4000/api/entity-runtime/invoice/list?limit=25");
    const query="companyCodeId=company&legalEntityId=legal&operatingOrganizationId=org";
    assert.equal((await handler(new Request(`https://neon.example/api/relay/entity-runtime/business_partner/application-descriptor?${query}`), context("entity-runtime", "business_partner", "application-descriptor"))).status, 200);
    assert.equal(upstream, `http://platform-host:4000/api/entity-runtime/business_partner/application-descriptor?${query}`);
    assert.equal((await handler(new Request("https://neon.example/api/relay/entity-runtime/business_partner/application-descriptor", {method:"POST"}), context("entity-runtime", "business_partner", "application-descriptor"))).status, 404);
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

  it("preserves encoded query data across all planes without treating it as a path attack", async () => {
    const queries = ["?filter=ACME%2FUK", "?date=2026%2E09%2E06", "?url=https%3A%2F%2Fexample", "?filter=%252e%252e%252f&filter=a%5Cb&value=%23fragment"];
    for (const plane of ["neon", "mesh", "studio"]) {
      const forwarded: string[] = [];
      const handler = relay({ plane, authority: authority(session(plane)), fetch: async (url) => { forwarded.push(String(url)); return Response.json({ ok: true }); } });
      for (const query of queries) {
        const response = await handler(new Request(`https://${plane}.example/api/relay/iam/me${query}#ignored%2Ffragment`), context("iam", "me"));
        assert.equal(response.status, 200, query);
        assert.equal(forwarded.at(-1), `http://platform-host:4000/api/iam/me${query}`, "query encoding and repeated values are preserved; fragments are not forwarded");
      }
      assert.equal(forwarded.length, queries.length);
    }
  });

  it("rejects dangerous encodings in allowlisted path parameters even with a valid query", async () => {
    let calls = 0;
    const handler = relay({ operation: { id: "item", method: "GET", path: "/api/items/:id" }, fetch: async () => { calls++; return Response.json({}); } });
    for (const segment of ["a%2Fb", "a%5Cb", "a%2Eb", "%252e%252e", "a%252Fb", "a%255Cb"]) {
      const response = await handler(new Request(`https://neon.example/api/relay/items/${segment}?filter=ACME%2FUK`), context("items", decodeURIComponent(segment)));
      assert.equal(response.status, 400, segment);
      assert.equal((await response.json() as { code: string }).code, "RELAY_INVALID_PATH");
    }
    assert.equal(calls, 0, "unsafe paths never reach Runtime");
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

  for (const plane of ["neon", "studio", "mesh"]) {
    for (const method of ["POST", "PUT", "PATCH"] as const) {
      it(`${plane}: refreshes and replays a consumed ${method} body exactly once`, async () => {
        let active = session(plane); let refreshCalls = 0;
        const origin = `https://${plane}.example`;
        const payload = JSON.stringify({ name: "Supplier العربية", amount: 123 });
        const headers = { cookie: "athyper-session=opaque", origin, "sec-fetch-site": "same-origin", "x-csrf-token": "csrf-proof", "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)), "idempotency-key": "mutation-1" };
        const original = new Request(`${origin}/api/relay/command`, { method, headers, body: payload });
        const attempts: Array<{ method: string; body: string; token: string | null; key: string | null }> = [];
        const handler = createRelayHandler({
          plane, runtimeApiUrl: "http://runtime:4000", appOrigin: origin,
          operations: [{ id: "command", method, path: "/api/command", idempotency: "required" }],
          session: {
            resolve: async () => active,
            refresh: async (request) => {
              refreshCalls++;
              assert.equal(original.bodyUsed, true);
              // Match the environment adapter, which clones the refresh request.
              const cloned = request.clone();
              assert.equal(cloned.body, null);
              assert.equal(await cloned.text(), "");
              assert.equal(cloned.method, "POST", "unsafe refresh retains auth-handler CSRF enforcement");
              for (const name of ["cookie", "origin", "sec-fetch-site", "x-csrf-token"] as const) assert.equal(cloned.headers.get(name), headers[name]);
              assert.equal(cloned.headers.get("content-length"), null);
              active = { ...active, accessToken: "refreshed-token" };
              return active;
            },
            invalidate: async () => assert.fail("authority must remain unchanged"),
          },
          fetch: async (_url, init) => {
            const forwarded = new Headers(init?.headers);
            attempts.push({ method: init!.method!, body: await new Response(init?.body).text(), token: forwarded.get("authorization"), key: forwarded.get("idempotency-key") });
            return attempts.length === 1 ? new Response(null, { status: 401 }) : Response.json({ saved: true });
          },
        });
        const result = await handler(original, context("command"));
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { saved: true });
        assert.equal(refreshCalls, 1);
        assert.deepEqual(attempts, [
          { method, body: payload, token: "Bearer server-token", key: "mutation-1" },
          { method, body: payload, token: "Bearer refreshed-token", key: "mutation-1" },
        ]);
      });
    }
  }

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
    const auth = authority(); const diagnostics: RelayDiagnostic[] = []; const handler = relay({ authority: auth, diagnostics, fetch: async () => new Response(JSON.stringify({ code: "AUTH_CONTEXT_MISMATCH", detail: "secret-body" }), { status: 403, headers: { "content-type": "application/problem+json", "x-request-id": "request-7" } }) }); const response = await handler(new Request("https://neon.example/api/relay/iam/me", { headers: { cookie: "secret-cookie", authorization: "Bearer browser-secret" } }), context("iam", "me")); assert.equal(response.status, 401); assert.equal(response.headers.get("x-athyper-session-action"), "login"); assert.equal(auth.invalidated, 1); assert.equal(auth.refreshed, 0); const serialized = JSON.stringify(diagnostics); assert.doesNotMatch(serialized, /server-token|secret-cookie|browser-secret|secret-body/);
  });
});
