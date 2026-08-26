import { describe, expect, it, vi } from "vitest";

import { createInAppNotificationHandler } from "../in-app.handler.js";
import {
  createNotificationEventBus,
  openNotificationSseStream,
} from "../notification-event-bus.js";
import { createNotificationOrchestrator } from "../notification-orchestrator.js";
import { createPushNotificationHandler } from "../push.handler.js";
import { createNotificationRecipientResolver } from "../recipient-resolver.js";
import { createNotificationDispatchHandler,createNotificationDispatchScheduler,DISPATCH_NOTIFICATION_JOB,NOTIFICATION_QUEUE } from "../notification-jobs.js";

describe("notification platform", () => {
  it("continues delivery when a listener throws synchronously", async () => {
    const bus = createNotificationEventBus();
    const delivered = vi.fn();
    bus.subscribe({ tenantId: "tenant-1", principalId: "person-1" }, () => { throw new Error("broken listener"); });
    bus.subscribe({ tenantId: "tenant-1", principalId: "person-1" }, delivered);
    await expect(bus.publish({ type: "notification.read", tenantId: "tenant-1", principalId: "person-1", notificationId: "notice-1", occurredAt: "2026-08-09T00:00:00.000Z" })).resolves.toBeUndefined();
    expect(delivered).toHaveBeenCalledOnce();
  });

  it("closes an SSE subscription when a heartbeat write fails", () => {
    vi.useFakeTimers();
    const subscribe = vi.fn((_scope, _listener) => vi.fn());
    let writes = 0;
    openNotificationSseStream({ subscriber: { subscribe }, tenantId: "tenant-1", principalId: "person-1", write: () => { if (++writes > 1) throw new Error("closed writer"); }, signal: new AbortController().signal, heartbeatMs: 100 });
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    vi.useRealTimers();
  });
  it("persists in-app delivery before publishing its scoped event", async () => {
    const bus = createNotificationEventBus();
    const listener = vi.fn();
    bus.subscribe({ tenantId: "tenant-1", principalId: "person-1" }, listener);
    const create = vi.fn().mockResolvedValue({
      id: "notice-1",
      tenantId: "tenant-1",
      principalId: "person-1",
      planeKey: "neon",
      templateKey: "welcome",
      payload: {},
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const handler = createInAppNotificationHandler({
      repository: { create, list: vi.fn(), countUnread: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), dismiss: vi.fn() },
      publisher: bus,
    });

    await handler.send({
      channel: "in_app",
      recipientAddress: "person-1",
      recipientId: "person-1",
      tenantId: "tenant-1",
      planeKey: "neon",
      templateKey: "welcome",
      payload: {},
    });
    expect(create).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notification.created", notificationId: "notice-1" }),
    );
  });

  it("publishes only the authorized principal scope to SSE", async () => {
    const bus = createNotificationEventBus();
    const controller = new AbortController();
    const chunks: string[] = [];
    openNotificationSseStream({
      subscriber: bus,
      tenantId: "tenant-1",
      principalId: "person-1",
      write: (chunk) => chunks.push(chunk),
      signal: controller.signal,
      heartbeatMs: 60_000,
    });
    await bus.publish({
      type: "notification.read",
      tenantId: "tenant-1",
      principalId: "person-2",
      notificationId: "other",
      occurredAt: "2026-08-09T00:00:00.000Z",
    });
    await bus.publish({
      type: "notification.read",
      tenantId: "tenant-1",
      principalId: "person-1",
      notificationId: "notice-1",
      occurredAt: "2026-08-09T00:00:00.000Z",
    });
    controller.abort();
    expect(chunks.join("")).toContain("notice-1");
    expect(chunks.join("")).not.toContain("other");
  });

  it("dispatches through registered channels and records unavailable channels", async () => {
    const record = vi.fn();
    const send = vi.fn().mockResolvedValue({ externalId: "mail-1" });
    const orchestrator = createNotificationOrchestrator({
      recipients: {
        resolve: vi.fn().mockResolvedValue({
          principalId: "person-1",
          addresses: { in_app: "person-1", email: "person@example.test" },
        }),
      },
      ledger: { record },
      handlers: new Map([
        ["email", { channel: "email", send, health: vi.fn() }],
      ]),
    });

    const result = await orchestrator.dispatch({
      tenantId: "tenant-1",
      principalId: "person-1",
      planeKey: "neon",
      channels: ["email", "whatsapp"],
      templateKey: "welcome",
      payload: {},
    });
    expect(result.deliveries.map((delivery) => delivery.status)).toEqual([
      "delivered",
      "skipped",
    ]);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("deactivates expired push subscriptions while delivering remaining devices", async () => {
    const deactivate = vi.fn();
    const subscriptions = [
      subscription("web", "web-1"),
      subscription("android", "android-1"),
    ];
    const handler = createPushNotificationHandler({
      subscriptions: {
        listActive: vi.fn().mockResolvedValue(subscriptions),
        deactivate,
        upsert: vi.fn(),
      },
      transports: [
        { platforms: ["web"], send: vi.fn().mockResolvedValue({ subscriptionExpired: true }) },
        { platforms: ["android", "ios"], send: vi.fn().mockResolvedValue({ externalId: "fcm-1" }) },
      ],
    });

    await expect(handler.send({
      channel: "push",
      recipientAddress: "person-1",
      recipientId: "person-1",
      tenantId: "tenant-1",
      planeKey: "neon",
      templateKey: "alert",
      subject: "Alert",
      payload: { renderedText: "Action required" },
    })).resolves.toEqual({ externalId: "fcm-1" });
    expect(deactivate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      principalId: "person-1",
      planeKey: "neon",
      subscriptionId: "web-1",
      reason: "provider_expired",
    });
  });

  it("exposes WhatsApp only when the principal has active consent", async () => {
    const resolver = createNotificationRecipientResolver({
      directory: {
        find: vi.fn().mockResolvedValue({
          email: "person@example.test",
          phoneE164: "+14155550101",
        }),
      },
      whatsAppConsent: {
        findOptedIn: vi.fn().mockResolvedValue({
          phoneE164: "+14155550101",
          status: "opted_in",
        }),
      },
    });
    await expect(resolver.resolve({
      tenantId: "tenant-1",
      principalId: "person-1",
      planeKey: "neon",
    })).resolves.toMatchObject({
      addresses: {
        in_app: "person-1",
        push: "person-1",
        email: "person@example.test",
        sms: "+14155550101",
        whatsapp: "+14155550101",
      },
    });
  });

  it("enqueues notification dispatch with a deterministic semantic job id",async()=>{const enqueue=vi.fn().mockResolvedValue("job-1");const scheduler=createNotificationDispatchScheduler({enqueue});const command={planeKey:"neon" as const,tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",channels:["in_app" as const],templateKey:"records.changed",payload:{},idempotencyKey:"event-1:principal-1"};await scheduler.schedule(command);expect(enqueue).toHaveBeenCalledWith(NOTIFICATION_QUEUE,DISPATCH_NOTIFICATION_JOB,command,expect.objectContaining({jobId:expect.stringMatching(/^notification-[a-f0-9]{64}$/),maxAttempts:5}));});

  it("fails the BullMQ job when any retryable channel delivery fails",async()=>{const handler=createNotificationDispatchHandler({dispatch:vi.fn().mockResolvedValue({deliveries:[{planeKey:"neon",tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",channel:"email",templateKey:"records.changed",status:"failed",error:"smtp unavailable"}]})});await expect(handler.handle({id:"job-1",name:DISPATCH_NOTIFICATION_JOB,queue:NOTIFICATION_QUEUE,data:{planeKey:"neon",tenantId:"11111111-1111-4111-8111-111111111111",principalId:"22222222-2222-4222-8222-222222222222",channels:["email"],templateKey:"records.changed",payload:{},idempotencyKey:"event-1:principal-1"},attempt:1,maxAttempts:5,enqueuedAt:new Date().toISOString()},{signal:new AbortController().signal,attempt:1,reportProgress:vi.fn()})).rejects.toThrow("notification deliveries failed");});
});

function subscription(platform: "web" | "android", id: string) {
  return {
    id,
    tenantId: "tenant-1",
    principalId: "person-1",
    planeKey: "neon" as const,
    platform,
    endpoint: "https://push.example.test/device",
    ...(platform === "web"
      ? { p256dhKey: "p256dh", authKey: "auth" }
      : { deviceToken: "device-token" }),
  };
}
