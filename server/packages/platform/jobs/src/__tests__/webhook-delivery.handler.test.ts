import { describe, expect, it, vi } from "vitest";
import type { WebhookDeliveryRepository } from "@athyper/server-contract-notifications";

import {
  RetryableWebhookDeliveryError,
  createWebhookDeliveryHandler,
} from "../webhook-delivery.handler.js";

describe("governed webhook delivery", () => {
  it("signs and delivers an approved HTTPS target", async () => {
    const complete = vi.fn(async () => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const handler = createWebhookDeliveryHandler({
      repository: repository(complete),
      fetch: fetchMock,
      resolveHost: vi.fn().mockResolvedValue(["203.0.113.10"]),
    });

    await expect(handler.handle(job(), context())).resolves.toEqual({ status: "completed" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>)["X-Webhook-Signature"]).toMatch(/^sha256=/);
    expect(complete).toHaveBeenCalledWith(job().data, expect.objectContaining({
      delivered: true,
      retryable: false,
      statusCode: 204,
    }));
  });

  it("rejects private destinations before making a request", async () => {
    const fetchMock = vi.fn();
    const complete = vi.fn(async () => undefined);
    const handler = createWebhookDeliveryHandler({
      repository: repository(complete),
      fetch: fetchMock,
      resolveHost: vi.fn().mockResolvedValue(["127.0.0.1"]),
    });
    await expect(handler.handle(job(), context())).resolves.toEqual({
      status: "discarded",
      reason: "unsafe_target",
    });
    expect(complete).toHaveBeenCalledWith(job().data, expect.objectContaining({
      delivered: false,
      retryable: false,
      errorCategory: "permanent",
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists throttling and asks the job runtime to retry", async () => {
    const complete = vi.fn(async () => undefined);
    const handler = createWebhookDeliveryHandler({
      repository: repository(complete),
      fetch: vi.fn().mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
      ),
      resolveHost: vi.fn().mockResolvedValue(["203.0.113.10"]),
    });
    await expect(handler.handle(job(), context())).rejects.toBeInstanceOf(
      RetryableWebhookDeliveryError,
    );
    expect(complete).toHaveBeenCalledWith(
      job().data,
      expect.objectContaining({ retryable: true, retryAfterMs: 30_000 }),
    );
  });
});

function repository(
  complete: WebhookDeliveryRepository["complete"],
): WebhookDeliveryRepository {
  return {
    loadDue: vi.fn().mockResolvedValue({
      deliveryId: "delivery-1",
      tenantId: "tenant-1",
      topic: "invoice.posted",
      targetUrl: "https://hooks.example.test/athyper",
      payload: { invoiceId: "invoice-1" },
      signingSecret: "a-secure-signing-secret",
    }),
    complete,
  };
}

function job() {
  return {
    id: "job-1",
    name: "webhook.deliver" as const,
    queue: "webhooks",
    data: { planeKey:"neon" as const,tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",deliveryId: "delivery-1" },
    attempt: 1,
    maxAttempts: 3,
    enqueuedAt: "2026-08-09T00:00:00.000Z",
  };
}

function context() {
  return { signal: new AbortController().signal, attempt: 1, reportProgress: vi.fn() };
}
