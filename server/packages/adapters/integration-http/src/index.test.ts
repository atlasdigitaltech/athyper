import { describe, expect, it, vi } from "vitest";
import type { InvocationPlan, TokenCache } from "@athyper/server-contract-integration";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalAgent } from "node:https";
import {
  classifyIntegrationFailure,
  createIntegrationHttpTransport,
  pinnedFetch,
  validateOutboundUrl,
} from "./index.js";

const plan: InvocationPlan = {
  version: 1,
  tenantId: "tenant-1",
  endpointId: "endpoint-1",
  connectorInstanceId: "connector-1",
  kind: "operation",
  url: "https://example.test/x",
  method: "POST",
  requestContentType: "application/json",
  timeoutMs: 1_000,
  headers: { "idempotency-key": "delivery-1" },
  maxPayloadBytes: 100,
  retryPolicy: {
    maxAttempts: 3,
    initialDelayMs: 1,
    maxDelayMs: 10,
    multiplier: 2,
    retryStatuses: [429, 503],
  },
  credentialReference: "secret/integration",
  credentialRevision: 1,
  audience: "https://example.test",
};

const publicLookup = async () => ["8.8.8.8"];

describe("integration HTTP boundary", () => {
  it("rejects resolved private addresses", async () => {
    await expect(validateOutboundUrl("https://example.test/x", async () => ["10.0.0.2"]))
      .rejects.toMatchObject({ code: "INTEGRATION_PRIVATE_NETWORK_DENIED", retryable: false });
  });

  it("denies redirects", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } }));
    const transport = createIntegrationHttpTransport({ pinnedFetch: fetcher, lookup: publicLookup });
    await expect(transport.invoke(plan, new Uint8Array(), undefined)).rejects.toMatchObject({ code: "INTEGRATION_REDIRECT_DENIED" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }), "8.8.8.8");
  });

  it("omits blank idempotency keys and pins the validated DNS address", async () => {
    const pinnedFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const lookup = vi.fn(async () => ["8.8.8.8"]);
    const transport = createIntegrationHttpTransport({ pinnedFetch, lookup });
    await transport.invoke({ ...plan, headers: { "idempotency-key": "" } }, new Uint8Array(), undefined);
    expect(lookup).toHaveBeenCalledOnce();
    expect(pinnedFetch).toHaveBeenCalledWith(
      new URL(plan.url),
      expect.objectContaining({ headers: { "content-type": "application/json" } }),
      "8.8.8.8",
    );
  });

  it("stops reading a chunked response as soon as the configured bound is exceeded", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
      },
      cancel() { cancelled = true; },
    });
    const transport = createIntegrationHttpTransport({
      pinnedFetch: async () => new Response(body, { status: 200 }),
      lookup: publicLookup,
      maxResponseBytes: 6,
    });
    await expect(transport.invoke(plan, new Uint8Array(), undefined)).rejects.toMatchObject({
      code: "INTEGRATION_RESPONSE_TOO_LARGE",
      retryable: false,
    });
    expect(cancelled).toBe(true);
  });

  it("classifies provider, transport, cancellation, and validation failures", () => {
    expect(classifyIntegrationFailure(undefined, 503, [])).toEqual({ kind: "transient", status: 503 });
    expect(classifyIntegrationFailure(undefined, 409, [409])).toEqual({ kind: "transient", status: 409 });
    expect(classifyIntegrationFailure(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toEqual({ kind: "transient" });
    expect(classifyIntegrationFailure(new DOMException("cancelled", "AbortError"))).toEqual({ kind: "cancelled" });
    expect(classifyIntegrationFailure(Object.assign(new Error("invalid"), { retryable: false }))).toEqual({ kind: "permanent" });
  });

  it("opens a per-connector circuit on classified provider failures and exposes dependency health", async () => {
    const telemetry: unknown[] = [];
    const fetcher = vi.fn(async () => new Response("busy", { status: 503 }));
    const transport = createIntegrationHttpTransport({
      pinnedFetch: fetcher,
      lookup: publicLookup,
      circuitBreaker: { failureThreshold: 2, failureWindowMs: 60_000, resetTimeoutMs: 60_000 },
      telemetry: (event) => telemetry.push(event),
    });
    expect((await transport.invoke(plan, new Uint8Array(), undefined)).status).toBe(503);
    expect((await transport.invoke(plan, new Uint8Array(), undefined)).status).toBe(503);
    await expect(transport.invoke(plan, new Uint8Array(), undefined)).rejects.toMatchObject({ name: "CircuitBreakerOpenError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(transport.health()).resolves.toMatchObject({ status: "unhealthy", openCircuits: 1, dependencyCount: 1 });
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: "failure", classification: "transient", status: 503, credentialRevision: 1 }),
      expect.objectContaining({ outcome: "circuit_open", circuitState: "OPEN" }),
    ]));
  });

  it("uses a new OAuth token cache partition immediately after credential rotation", async () => {
    const values = new Map<string, string>();
    const tokenCache: TokenCache = {
      get: async (key) => values.get(key),
      set: async (key, value) => { values.set(key, value); },
    };
    const authorization: string[] = [];
    let tokenRequests = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://identity.test/token") {
        tokenRequests += 1;
        return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 3_600 });
      }
      authorization.push((init?.headers as Record<string, string>).authorization);
      return new Response("ok", { status: 200 });
    });
    const credential = new TextEncoder().encode(JSON.stringify({
      type: "oauth2_client_credentials",
      clientId: "client",
      clientSecret: "secret",
      tokenUrl: "https://identity.test/token",
    }));
    const transport = createIntegrationHttpTransport({ pinnedFetch: fetcher, lookup: publicLookup, tokenCache });
    await transport.invoke(plan, new Uint8Array(), credential);
    await transport.invoke({ ...plan, credentialRevision: 2 }, new Uint8Array(), credential);
    await transport.invoke({ ...plan, credentialRevision: 2 }, new Uint8Array(), credential);
    expect(tokenRequests).toBe(2);
    expect(authorization).toEqual(["Bearer token-1", "Bearer token-2", "Bearer token-2"]);
    expect([...values.keys()]).toEqual(expect.arrayContaining([
      expect.stringContaining(":1:"),
      expect.stringContaining(":2:"),
    ]));
  });

  it.each([
    "::ffff:7f00:1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::1", "::1", "fe80::1", "fd00::1",
    "127.0.0.1", "169.254.169.254", "100.64.0.1", "10.1.2.3",
  ])("denies %s", async (address) => {
    await expect(validateOutboundUrl("https://example.test/x", async () => [address]))
      .rejects.toMatchObject({ code: "INTEGRATION_PRIVATE_NETWORK_DENIED" });
  });

  it("allows public addresses", async () => {
    await expect(validateOutboundUrl("https://example.test/x", async () => ["8.8.8.8", "2606:4700:4700::1111"])).resolves.toBeInstanceOf(URL);
  });

  it("classifies timeouts as transient and caller cancellation as cancelled", async () => {
    const hang: typeof pinnedFetch = (_url, init) => new Promise((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (init.signal?.aborted) fail();
      else init.signal?.addEventListener("abort", fail);
    });
    const transport = createIntegrationHttpTransport({ pinnedFetch: hang, lookup: publicLookup, circuitBreaker: false });
    const timeout = await transport.invoke({ ...plan, timeoutMs: 10 }, new Uint8Array(), undefined).catch((e) => e);
    expect(classifyIntegrationFailure(timeout)).toEqual({ kind: "transient" });
    const caller = new AbortController();
    const pending = transport.invoke(plan, new Uint8Array(), undefined, caller.signal).catch((e) => e);
    caller.abort();
    expect(classifyIntegrationFailure(await pending)).toEqual({ kind: "cancelled" });
  });

  it("fails closed on missing secrets and bounds the OAuth token call by the plan timeout", async () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const transport = createIntegrationHttpTransport({ pinnedFetch: async () => new Response("ok"), lookup: publicLookup, circuitBreaker: false });
    for (const credential of [{ type: "api_key" }, { type: "bearer" }, { type: "oauth2_client_credentials", tokenUrl: "https://identity.test/t" }]) {
      await expect(transport.invoke(plan, new Uint8Array(), encode(credential))).rejects.toMatchObject({ code: "INTEGRATION_CREDENTIAL_INVALID" });
    }
    const hang: typeof pinnedFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const slow = createIntegrationHttpTransport({ pinnedFetch: hang, lookup: publicLookup, circuitBreaker: false });
    await expect(slow.invoke({ ...plan, timeoutMs: 20 }, new Uint8Array(), encode({
      type: "oauth2_client_credentials", clientId: "c", clientSecret: "s", tokenUrl: "https://identity.test/t",
    }))).rejects.toMatchObject({ code: "INTEGRATION_HTTP_TIMEOUT", retryable: true });
  });

  it("drops a cached OAuth token when the provider answers 401", async () => {
    const values = new Map<string, string>();
    const tokenCache: TokenCache = {
      get: async (key) => values.get(key),
      set: async (key, value) => { values.set(key, value); },
      delete: async (key) => { values.delete(key); },
    };
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/token") ? Response.json({ access_token: "t", expires_in: 3_600 }) : new Response("no", { status: 401 }));
    const credential = new TextEncoder().encode(JSON.stringify({
      type: "oauth2_client_credentials", clientId: "c", clientSecret: "s", tokenUrl: "https://identity.test/token",
    }));
    const transport = createIntegrationHttpTransport({ pinnedFetch: fetcher, lookup: publicLookup, tokenCache, circuitBreaker: false });
    expect((await transport.invoke(plan, new Uint8Array(), credential)).status).toBe(401);
    expect(values.size).toBe(0);
  });

  it("admits a single half-open probe", async () => {
    let clock = 0;
    let release!: () => void;
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls <= 1) return new Response("busy", { status: 503 });
      await new Promise<void>((resolve) => { release = resolve; });
      return new Response("ok");
    });
    const transport = createIntegrationHttpTransport({
      pinnedFetch: fetcher, lookup: publicLookup, now: () => clock,
      circuitBreaker: { failureThreshold: 1, failureWindowMs: 60_000, resetTimeoutMs: 100 },
    });
    await transport.invoke(plan, new Uint8Array(), undefined);
    clock = 200;
    const probe = transport.invoke(plan, new Uint8Array(), undefined);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await expect(transport.invoke(plan, new Uint8Array(), undefined)).rejects.toMatchObject({ name: "CircuitBreakerOpenError" });
    release();
    expect((await probe).status).toBe(200);
  });
});

describe("pinnedFetch against a real TLS server", () => {
  it("connects to the pinned address with hostname verification and Node's lookup contract", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pinned-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
      "-days", "1", "-subj", "/CN=pinned.test", "-addext", "subjectAltName=DNS:pinned.test"], { stdio: "ignore" });
    const cert = readFileSync(join(dir, "c.pem"));
    const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert }, (req, res) => {
      res.end(`host=${req.headers.host}`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const previousCa = globalAgent.options.ca;
    globalAgent.options.ca = cert;
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await pinnedFetch(new URL(`https://pinned.test:${port}/`), { method: "GET", signal: AbortSignal.timeout(5_000) }, "127.0.0.1");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("host=pinned.test");
    } finally {
      globalAgent.options.ca = previousCa;
      server.close();
    }
  });
});
