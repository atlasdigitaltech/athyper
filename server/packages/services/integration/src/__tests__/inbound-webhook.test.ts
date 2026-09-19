import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InboundWebhookPolicy,
  IntegrationRepository,
  SecretResolver,
} from "@athyper/server-contract-integration";
import { admitInboundWebhook } from "../inbound-webhook.js";
import { registerIntegrationRoutes } from "../integration-routes.js";

const subscriptionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = Buffer.from("webhook-test-secret");
const policy: InboundWebhookPolicy = {
  subscriptionId,
  tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  signingSecretReference: "secret-ref",
  signatureHeader: "X-Signature",
  timestampHeader: "X-Timestamp",
  toleranceSeconds: 300,
  maxBodyBytes: 1048576,
  algorithm: "hmac-sha256",
};
function fixture() {
  const admitInbound = vi
    .fn()
    .mockResolvedValue({ id: "receipt", duplicate: false });
  return {
    repository: { admitInbound } as unknown as IntegrationRepository,
    policies: { resolve: vi.fn().mockResolvedValue(policy) },
    secrets: {
      resolve: vi.fn().mockResolvedValue({ bytes: secret }),
    } as unknown as SecretResolver,
    admitInbound,
  };
}
function signed(
  body = '{ "event": "created" }',
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  return {
    subscriptionId,
    rawBody: Buffer.from(body),
    headers: {
      "x-timestamp": timestamp,
      "x-signature": `sha256=${createHmac("sha256", secret).update(timestamp).update(".").update(body).digest("hex")}`,
    },
  };
}
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
async function appUrl(deps: ReturnType<typeof fixture>, parsed = false) {
  const app = express();
  if (parsed) app.use(express.json());
  registerIntegrationRoutes(app, {
    ...deps,
    authenticate: (_r: unknown, _s: unknown, next: () => void) => next(),
  } as unknown as Parameters<typeof registerIntegrationRoutes>[1]);
  app.use(((error: any, _request: any, response: any, _next: any) =>
    response
      .status(error.status ?? 500)
      .json({
        code: error.code ?? error.type,
      })) as express.ErrorRequestHandler);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  return `http://127.0.0.1:${address.port}/api/webhooks/${subscriptionId}`;
}
describe("inbound webhook admission", () => {
  it("verifies the exact bytes and uses the policy tenant", async () => {
    const deps = fixture(),
      request = signed();
    await expect(admitInboundWebhook(request, deps)).resolves.toMatchObject({
      id: "receipt",
      payload: { event: "created" },
    });
    expect(deps.admitInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: request.rawBody,
        tenantId: policy.tenantId,
        subscriptionId,
      }),
    );
    await expect(
      admitInboundWebhook(
        { ...request, rawBody: Buffer.from('{"event":"created"}') },
        deps,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it.each(["é".repeat(64), "z".repeat(64), "a", "a".repeat(65)])(
    "rejects malformed signature %s without throwing a buffer error",
    async (signature) => {
      const deps = fixture(),
        request = signed();
      request.headers["x-signature"] = signature;
      await expect(admitInboundWebhook(request, deps)).rejects.toMatchObject({
        status: 401,
        code: "INTEGRATION_WEBHOOK_SIGNATURE_INVALID",
      });
      expect(deps.admitInbound).not.toHaveBeenCalled();
    },
  );
  it.each(["null", "42", '"text"', "true", "{broken"])(
    "rejects invalid payload %s before persistence",
    async (body) => {
      const deps = fixture();
      await expect(
        admitInboundWebhook(signed(body), deps),
      ).rejects.toMatchObject({ status: 400 });
      expect(deps.admitInbound).not.toHaveBeenCalled();
    },
  );
  it("accepts arrays", async () => {
    await expect(
      admitInboundWebhook(signed("[]"), fixture()),
    ).resolves.toMatchObject({ payload: [] });
  });
  it("rejects missing subscriptions, stale/future timestamps and missing authentication", async () => {
    const deps = fixture();
    deps.policies.resolve.mockResolvedValueOnce(undefined);
    await expect(admitInboundWebhook(signed(), deps)).rejects.toMatchObject({
      status: 404,
    });
    for (const delta of [-301, 302]) {
      await expect(
        admitInboundWebhook(
          signed("{}", String(Math.floor(Date.now() / 1000) + delta)),
          deps,
        ),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      admitInboundWebhook({ ...signed(), headers: {} }, deps),
    ).rejects.toMatchObject({ status: 401 });
    expect(deps.admitInbound).not.toHaveBeenCalled();
  });
  it("enforces the byte limit before resolving secrets", async () => {
    const deps = fixture();
    deps.policies.resolve.mockResolvedValue({ ...policy, maxBodyBytes: 2 });
    await expect(admitInboundWebhook(signed(), deps)).rejects.toMatchObject({
      status: 413,
    });
    expect(deps.secrets.resolve).not.toHaveBeenCalled();
  });
});
describe("POST /api/webhooks/:subscriptionId", () => {
  it("accepts raw noncanonical JSON and returns 200 on retries", async () => {
    const deps = fixture(),
      url = await appUrl(deps),
      request = signed();
    for (const duplicate of [false, true]) {
      deps.admitInbound.mockResolvedValueOnce({ id: "receipt", duplicate });
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...request.headers,
          "content-type": "application/octet-stream",
        },
        body: request.rawBody,
      });
      expect(response.status).toBe(duplicate ? 200 : 202);
      expect(await response.json()).toEqual({
        receiptId: "receipt",
        duplicate,
      });
    }
  });
  it("fails closed when an upstream parser consumed the body without preserving bytes", async () => {
    const deps = fixture(),
      url = await appUrl(deps, true),
      request = signed('{"event":"created"}');
    const response = await fetch(url, {
      method: "POST",
      headers: { ...request.headers, "content-type": "application/json" },
      body: request.rawBody,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INTEGRATION_WEBHOOK_RAW_BODY_REQUIRED",
    });
    expect(deps.admitInbound).not.toHaveBeenCalled();
  });
  it("rejects invalid subscription IDs before lookup", async () => {
    const deps = fixture(),
      url = await appUrl(deps);
    const response = await fetch(url.replace(subscriptionId, "bad"), {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(deps.policies.resolve).not.toHaveBeenCalled();
  });
  it("returns idempotency conflicts as problem details", async () => {
    const deps = fixture(),
      url = await appUrl(deps),
      request = signed();
    deps.admitInbound.mockRejectedValueOnce(
      Object.assign(new Error("Conflict"), {
        status: 409,
        code: "INTEGRATION_WEBHOOK_IDEMPOTENCY_CONFLICT",
      }),
    );
    const response = await fetch(url, {
      method: "POST",
      headers: request.headers,
      body: request.rawBody,
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });
});
