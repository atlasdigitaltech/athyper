import { describe, expect, it, vi } from "vitest";
import type { InvocationPlan, TokenCache } from "@athyper/server-contract-integration";
import {
  classifyIntegrationFailure,
  createIntegrationHttpTransport,
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
});
