import { describe, expect, it } from "vitest";
import type { InvocationPlan } from "@athyper/server-contract-integration";
import { createIntegrationHttpTransport } from "./index.js";

const endpoint = process.env.INTEGRATION_HTTP_CONTRACT_URL;
const credentialJson = process.env.INTEGRATION_HTTP_CONTRACT_CREDENTIAL_JSON;
const live = endpoint ? describe : describe.skip;

/**
 * Opt-in real-provider contract suite. CI or staging supplies an HTTPS health
 * endpoint and, when needed, a JSON credential. No provider secret is logged or
 * persisted by this suite.
 */
live("integration HTTP real-provider contract", () => {
  it("honours the response boundary and returns a non-redirecting provider response", async () => {
    const url = new URL(endpoint!);
    const transport = createIntegrationHttpTransport({
      allowedHosts: [url.hostname],
      maxResponseBytes: 65_536,
      circuitBreaker: false,
    });
    const plan: InvocationPlan = {
      version: 1,
      tenantId: "contract-test",
      endpointId: "real-provider-health",
      connectorInstanceId: `contract:${url.hostname}`,
      kind: "health",
      url: url.toString(),
      method: "GET",
      requestContentType: "application/json",
      timeoutMs: 10_000,
      headers: {},
      maxPayloadBytes: 0,
      retryPolicy: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1, multiplier: 1, retryStatuses: [429, 503] },
      credentialRevision: 1,
      audience: url.origin,
    };
    const credential = credentialJson ? new TextEncoder().encode(credentialJson) : undefined;
    const response = await transport.probe(plan, credential);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(500);
    expect(response.body.byteLength).toBeLessThanOrEqual(65_536);
  });
});
