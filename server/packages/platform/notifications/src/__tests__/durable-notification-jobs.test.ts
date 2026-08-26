import { describe, expect, it, vi } from "vitest";

import {
  DELIVERY_SWEEP_JOB,
  DISCOVER_NOTIFICATION_WORK_JOB,
  NOTIFICATION_MAINTENANCE_QUEUE,
  PLAN_NOTIFICATION_OUTBOX_JOB,
  WEBHOOK_SWEEP_JOB,
  createDeliverySweepHandler,
  createNotificationDiscoveryHandler,
  createNotificationOutboxSweepHandler,
  createWebhookSweepHandler,
} from "../index.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";

describe("durable notification jobs", () => {
  it("completes and retries outbox items independently", async () => {
    const complete = vi.fn();
    const fail = vi.fn();
    const events = [sourceEvent("event-1"), sourceEvent("event-2")];
    const repository = {
      claim: vi.fn().mockResolvedValue([
        { stateId: "state-1", event: events[0], attemptCount: 1 },
        { stateId: "state-2", event: events[1], attemptCount: 1 },
      ]),
      complete,
      fail,
    };
    const planner = {
      plan: vi.fn()
        .mockResolvedValueOnce({ matchedRules: 1, messages: 2, deliveries: 2, digests: 0 })
        .mockRejectedValueOnce(new Error("invalid template")),
    };
    const handler = createNotificationOutboxSweepHandler({ repository, planner } as never);

    await expect(handler.handle(job(PLAN_NOTIFICATION_OUTBOX_JOB, request()), context()))
      .resolves.toEqual({
        status: "completed",
        output: { claimed: 2, messages: 2, failed: 1 },
      });
    expect(complete).toHaveBeenCalledWith(request(), "state-1", 2);
    expect(fail).toHaveBeenCalledWith(
      request(),
      expect.objectContaining({ stateId: "state-2" }),
      "invalid template",
    );
  });

  it("delivers claimed external and in-app rows and publishes only in-app SSE", async () => {
    const complete = vi.fn();
    const publish = vi.fn();
    const send = vi.fn().mockResolvedValue({ externalId: "mail-1" });
    const repository = {
      claim: vi.fn().mockResolvedValue([
        delivery("email", "delivery-email"),
        delivery("in_app", "delivery-in-app"),
      ]),
      attachments: vi.fn().mockResolvedValue([]),
      complete,
    };
    const handler = createDeliverySweepHandler({
      repository,
      handlers: new Map([["email", { channel: "email", send, health: vi.fn() }]]),
      events: { publish },
    } as never);

    await expect(handler.handle(job(DELIVERY_SWEEP_JOB, request()), context()))
      .resolves.toEqual({
        status: "completed",
        output: { claimed: 2, delivered: 2, failed: 0 },
      });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-email" }));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: PRINCIPAL_ID, notificationId: "message-1" }),
    );
  });

  it("preserves asynchronous provider acceptance for authoritative delivery events", async () => {
    const complete = vi.fn();
    const repository = {
      claim: vi.fn().mockResolvedValue([delivery("email", "delivery-ses")]),
      attachments: vi.fn().mockResolvedValue([]),
      complete,
    };
    const handler = createDeliverySweepHandler({
      repository,
      handlers: new Map([["email", {
        channel: "email",
        send: vi.fn().mockResolvedValue({ externalId: "ses-message-1", confirmation: "provider_accepted" }),
        health: vi.fn(),
      }]]),
      events: { publish: vi.fn() },
    } as never);

    await handler.handle(job(DELIVERY_SWEEP_JOB, request()), context());
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "delivery-ses" }),
      expect.objectContaining({ delivered: true, externalId: "ses-message-1", confirmation: "provider_accepted" }),
      PRINCIPAL_ID,
    );
  });

  it("resolves a durable attachment immediately before the external send", async () => {
    const send = vi.fn().mockResolvedValue({ externalId: "mail-attachment" });
    const resolveForDelivery = vi.fn().mockResolvedValue({
      attachmentId: "44444444-4444-4444-8444-444444444444",
      attachmentVersionId: "44444444-4444-4444-8444-444444444444",
      filename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 20,
      sha256: "a".repeat(64), disposition: "link", downloadUrl: "https://download.example/invoice",
    });
    const repository = {
      claim: vi.fn().mockResolvedValue([delivery("email", "delivery-attachment")]),
      attachments: vi.fn().mockResolvedValue([{
        attachmentId: "44444444-4444-4444-8444-444444444444",
        versionPolicy: "current", requestedDisposition: "auto", required: true, sortOrder: 0,
      }]),
      complete: vi.fn(),
    };
    const handler = createDeliverySweepHandler({
      repository,
      handlers: new Map([["email", { channel: "email", send, health: vi.fn() }]]),
      events: { publish: vi.fn() },
      attachments: { resolveForDelivery },
    } as never);

    await handler.handle(job(DELIVERY_SWEEP_JOB, request()), context());
    expect(resolveForDelivery).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "notification_delivery", accessMode: "link",
    }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ filename: "invoice.pdf" })],
    }));
  });

  it("discovers tenant work and fans out deterministic tenant-scoped sweeps", async () => {
    const enqueue = vi.fn().mockResolvedValue("job-1");
    const catalog = {
      listTenants: vi.fn().mockResolvedValue([TENANT_ID]),
      listWebhookDeliveries: vi.fn(),
    };
    const handler = createNotificationDiscoveryHandler({ catalog, jobs: { enqueue } });

    await expect(handler.handle(
      job(DISCOVER_NOTIFICATION_WORK_JOB, {
        planeKey: "neon" as const,
        principalId: PRINCIPAL_ID,
      }),
      context(),
    )).resolves.toEqual({ status: "completed", output: { tenants: 1, kind: "message" } });
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledWith(
      NOTIFICATION_MAINTENANCE_QUEUE,
      PLAN_NOTIFICATION_OUTBOX_JOB,
      expect.objectContaining({ tenantId: TENANT_ID, planeKey: "neon" }),
      expect.any(Object),
    );
  });

  it("queues each due webhook with its plane and tenant coordinate", async () => {
    const enqueue = vi.fn().mockResolvedValue("job-1");
    const catalog = {
      listTenants: vi.fn(),
      listWebhookDeliveries: vi.fn().mockResolvedValue([
        { deliveryId: "delivery-1", attempt: 2 },
      ]),
    };
    const handler = createWebhookSweepHandler({ catalog, jobs: { enqueue } });
    const data = { planeKey: "mesh" as const, tenantId: TENANT_ID, principalId: PRINCIPAL_ID };

    await expect(handler.handle(job(WEBHOOK_SWEEP_JOB, data), context())).resolves.toEqual({
      status: "completed",
      output: { enqueued: 1 },
    });
    expect(enqueue).toHaveBeenCalledWith(
      "webhooks",
      "webhook.deliver",
      { ...data, deliveryId: "delivery-1" },
      expect.objectContaining({ jobId: "webhook-mesh-delivery-1-2" }),
    );
  });
});

function request() {
  return {
    planeKey: "neon" as const,
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    workerId: "notification-test",
  };
}

function sourceEvent(id: string) {
  return {
    id,
    planeKey: "neon" as const,
    tenantId: TENANT_ID,
    actorPrincipalId: PRINCIPAL_ID,
    eventCode: "record.changed",
    payload: {},
  };
}

function delivery(channel: "email" | "in_app", id: string) {
  return {
    id,
    tenantId: TENANT_ID,
    planeKey: "neon" as const,
    messageId: "message-1",
    principalId: PRINCIPAL_ID,
    recipientAddress: channel === "email" ? "person@example.test" : PRINCIPAL_ID,
    channel,
    templateKey: "record.changed",
    subject: "Changed",
    payload: { renderedText: "A record changed" },
    attemptCount: 1,
    maxAttempts: 5,
    workerId: "notification-test",
  };
}

function job<Name extends string, Data extends Record<string, unknown>>(name: Name, data: Data) {
  return {
    id: "job-1",
    name,
    queue: NOTIFICATION_MAINTENANCE_QUEUE,
    data,
    attempt: 1,
    maxAttempts: 3,
    enqueuedAt: "2026-08-09T00:00:00.000Z",
  };
}

function context() {
  return { signal: new AbortController().signal, attempt: 1, reportProgress: vi.fn() };
}
