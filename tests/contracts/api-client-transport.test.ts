import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSanitizedSession } from "../../packages/contracts/platform/auth-session/src/index";
import { createHttpClient, createOperation, createRequestScope, encodePathSegment, entityListDescriptorOperation, type ApiTransportError } from "../../packages/platform/foundation/api-client/src/index";
import { parsePlatformBootstrap } from "../../packages/platform/foundation/api-client/src/bootstrap";

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json", ...init.headers }, ...init });

describe("same-origin API transport", () => {
  it("calls a fake relay, validates success, safely encodes paths, and never sends bearer tokens", async () => {
    let observed: { url: string; headers: Headers } | undefined;
    const client = createHttpClient({ fetch: async (input, init) => { observed = { url: String(input), headers: new Headers(init?.headers) }; return json({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: [] }, { headers: { "x-request-id": "req-success" } }); } });
    const operation = createOperation({ method: "GET", path: ({ principal }) => `session/${encodePathSegment(principal!)}`, parse: parseSanitizedSession });
    const session = await client.request(operation, { params: { principal: "a/b ?" } });
    assert.equal(session.state, "anonymous"); assert.equal(observed?.url, "/api/relay/session/a%2Fb%20%3F");
    assert.equal(observed?.headers.has("authorization"), false); assert.equal(observed?.headers.has("cookie"), false); assert.equal(observed?.headers.has("x-tenant-id"), false);
  });

  it("removes the canonical upstream api prefix when constructing a relay URL", async () => {
    let observedUrl: string | undefined;
    const client = createHttpClient({ fetch: async (input) => { observedUrl = String(input); return json({ ok: true }); } });
    const operation = createOperation<{ ok: boolean }>({ method: "GET", path: "/api/neon/work-contexts" });

    await client.request(operation);

    assert.equal(observedUrl, "/api/relay/neon/work-contexts");
  });

  it("encodes entity-list coordinates and repeated query values through the relay", async () => {
    let observedUrl: string | undefined;
    const client = createHttpClient({ fetch: async (input) => { observedUrl = String(input); return json({ schemaVersion: 1, plane: "neon", entity: { code: "invoice", label: "Invoice", pluralLabel: "Invoices", identityField: "record_id" }, revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) }, surface: { key: "default_list", title: "Invoices", defaultState: { filters: [], sort: [], columns: ["record_id"], density: "comfortable", mode: "table" }, supportedModes: ["table"] }, fields: [{ key: "record_id", label: "Record ID", valueKind: "string", defaultVisible: true, defaultOrder: 0, filterOperators: [], sortable: false, groupable: false, aggregations: [] }], actions: [], scope: { status: "ready", labels: [], fingerprint: "c".repeat(64) }, limits: { defaultPageSize: 50, allowedPageSizes: [50], maxSortLevels: 5, countMode: "none" } }); } });
    await client.request(entityListDescriptorOperation, { params: { entityCode: "invoice" }, query: { companyCodeId: "11111111-1111-4111-8111-111111111111", legalEntityId: "22222222-2222-4222-8222-222222222222", operatingOrganizationId: "33333333-3333-4333-8333-333333333333", networkAccountId: "44444444-4444-4444-8444-444444444444" } });
    assert.equal(observedUrl, "/api/relay/entity-runtime/invoice/list-descriptor?companyCodeId=11111111-1111-4111-8111-111111111111&legalEntityId=22222222-2222-4222-8222-222222222222&operatingOrganizationId=33333333-3333-4333-8333-333333333333&networkAccountId=44444444-4444-4444-8444-444444444444");
    await assert.rejects(client.request(entityListDescriptorOperation, { params: { entityCode: "../invoice" } }), /catalog code/);
  });

  it("parses the current platform problem and preserves request/correlation IDs without leaking diagnostics", async () => {
    const diagnostics: unknown[] = [];
    const fixture = JSON.parse(readFileSync("packages/contracts/platform/fixtures/api-problem.v1.json", "utf8"));
    const client = createHttpClient({ fetch: async () => json({ ...fixture, detail: "secret response detail" }, { status: 401, headers: { "content-type": "application/problem+json", "x-correlation-id": "corr-1" } }), onDiagnostic: (item) => diagnostics.push(item) });
    await assert.rejects(client.requestJson("session"), (error: ApiTransportError) => { assert.equal(error.kind, "authentication"); assert.equal(error.requestId, fixture.requestId); assert.equal(error.correlationId, "corr-1"); return true; });
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret response detail|authorization|body/i);
  });

  it("accepts empty 204 responses and sends CSRF/idempotency only for declared mutations", async () => {
    let headers = new Headers(); let calls = 0;
    const client = createHttpClient({ csrfToken: () => "csrf-1", fetch: async (_input, init) => { calls += 1; headers = new Headers(init?.headers); return new Response(null, { status: 204 }); } });
    const operation = createOperation<void, { name: string }>({ method: "POST", path: "commands", response: "void", idempotency: "required" });
    await client.request(operation, { body: { name: "create" }, idempotencyKey: "idem-1" });
    assert.equal(headers.get("x-csrf-token"), "csrf-1"); assert.equal(headers.get("idempotency-key"), "idem-1"); assert.equal(headers.has("authorization"), false); assert.equal(calls, 1);
    assert.equal(await client.requestJson<undefined>("empty"), undefined);
  });

  it("propagates lifecycle cancellation and does not retry mutations", async () => {
    const scope = createRequestScope(); let calls = 0;
    const client = createHttpClient({ lifecycleSignal: scope.signal, csrfToken: () => "csrf", fetch: async (_input, init) => { calls += 1; return new Promise((_resolve, reject) => { if (init?.signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; } init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); }); } });
    const pending = client.requestVoid("commands", { method: "POST" }); scope.cancel("context changed");
    await assert.rejects(pending, (error: ApiTransportError) => error.kind === "abort"); assert.equal(calls, 1);
  });

  it("returns a stream without consuming or buffering it", async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({ pull(controller) { pulls += 1; if (pulls === 1) controller.enqueue(new TextEncoder().encode("first")); else controller.close(); } });
    const client = createHttpClient({ fetch: async () => new Response(source, { headers: { "content-type": "text/event-stream" } }) });
    const stream = await client.requestStream("events"); assert.ok(stream instanceof ReadableStream); assert.ok(pulls <= 1);
    const first = await stream.getReader().read(); assert.equal(new TextDecoder().decode(first.value), "first");
  });

  it("supports blobs, FormData, upload progress strategies, and request-class timeouts", async () => {
    const blobClient = createHttpClient({ fetch: async () => new Response(new Blob(["report"]), { headers: { "content-type": "application/octet-stream" } }) });
    assert.equal(await (await blobClient.requestBlob("reports/one")).text(), "report");
    let uploadBody: BodyInit | undefined; let progress = 0;
    const uploadClient = createHttpClient({ csrfToken: () => "csrf", uploadProgressStrategy: { upload: async (input) => { uploadBody = input.body; input.onProgress(4, 4); return json({ uploaded: true }); } }, fetch: async () => { throw new Error("upload strategy should own this request"); } });
    const form = new FormData(); form.set("file", new Blob(["data"]), "file.txt");
    const upload = createOperation<{ uploaded: boolean }, FormData>({ method: "POST", path: "uploads", requestClass: "upload" });
    assert.equal((await uploadClient.request(upload, { body: form, onUploadProgress: (loaded) => { progress = loaded; } })).uploaded, true);
    assert.equal(uploadBody, form); assert.equal(progress, 4);
    const timeoutClient = createHttpClient({ timeouts: { background: 5 }, fetch: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })) });
    const slow = createOperation({ method: "GET", path: "slow", requestClass: "background" });
    await assert.rejects(timeoutClient.request(slow), (error: ApiTransportError) => error.kind === "timeout");
  });

  it("classifies authorization, validation, conflict, rate-limit, dependency, network, and parse failures", async () => {
    const statuses = [[403, "authorization"], [422, "validation"], [409, "conflict"], [429, "rate-limit"], [503, "dependency"]] as const;
    for (const [status, kind] of statuses) {
      const client = createHttpClient({ fetch: async () => new Response(null, { status }) });
      await assert.rejects(client.requestJson("failure"), (error: ApiTransportError) => error.kind === kind);
    }
    await assert.rejects(createHttpClient({ fetch: async () => { throw new TypeError("offline"); } }).requestJson("failure"), (error: ApiTransportError) => error.kind === "network");
    await assert.rejects(createHttpClient({ fetch: async () => new Response("not-json") }).requestJson("failure"), (error: ApiTransportError) => error.kind === "parse");
  });

  it("validates the shared bootstrap fixture through canonical session, authorization, and navigation parsers", () => {
    const fixture = JSON.parse(readFileSync("packages/contracts/platform/fixtures/platform-bootstrap.v1.json", "utf8"));
    const bootstrap = parsePlatformBootstrap(fixture); assert.equal(bootstrap.session.plane, "neon"); assert.equal(bootstrap.navigation.modules[0]?.code, "records");
    assert.throws(() => parsePlatformBootstrap({ ...fixture, authorization: { schemaVersion: 1 } }), /allowed|profileHash/);
  });

  it("rejects absolute URLs, bearer headers, undeclared idempotency, and missing CSRF", async () => {
    const client = createHttpClient({ fetch: async () => json({}) });
    await assert.rejects(client.requestJson("https://public-api.example/v1"), /absolute URLs/);
    await assert.rejects(client.requestJson("session", { headers: { Authorization: "Bearer forbidden" } }), /authorization/);
    await assert.rejects(client.requestJson("session", { headers: { "Idempotency-Key": "smuggled" } }), /managed/);
    await assert.rejects(client.requestJson("session", { idempotencyKey: "not-declared" }), /does not declare/);
    await assert.rejects(client.requestVoid("commands", { method: "POST" }), /CSRF/);
    await assert.rejects(client.requestJson("uploads", { onUploadProgress: () => undefined }), /upload strategy/i);
  });
});
