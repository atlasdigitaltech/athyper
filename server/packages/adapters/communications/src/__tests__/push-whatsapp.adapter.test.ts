import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createFcmPushAdapter } from "../fcm-push.adapter.js";
import { createWebPushAdapter } from "../web-push.adapter.js";
import { createMetaWhatsAppAdapter } from "../whatsapp-meta.adapter.js";

describe("push transports", () => {
  it("exchanges an FCM service-account assertion and caches the token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "access", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ name: "projects/project/messages/message-1" }),
          { status: 200 },
        ),
      );
    const transport = createFcmPushAdapter(
      {
        projectId: "project",
        clientEmail: "service@example.test",
        privateKey: privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
      { fetch: fetchMock, now: () => 1_800_000_000_000 },
    );

    await transport.send(mobileSubscription(), {
      title: "Alert",
      body: "Review",
    });
    await transport.send(mobileSubscription(), {
      title: "Alert",
      body: "Review",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("fcm.googleapis.com");
  });

  it("marks expired Web Push subscriptions without throwing", async () => {
    const transport = createWebPushAdapter(
      {
        subject: "mailto:no-reply@example.test",
        publicKey: "public",
        privateKey: "private",
      },
      { send: vi.fn().mockRejectedValue({ statusCode: 410 }) },
    );
    await expect(
      transport.send(
        {
          id: "web-1",
          tenantId: "tenant-1",
          principalId: "person-1",
          planeKey: "neon",
          platform: "web",
          endpoint: "https://push.example.test/device",
          p256dhKey: "p256dh",
          authKey: "auth",
        },
        { body: "Review" },
      ),
    ).resolves.toEqual({ subscriptionExpired: true });
  });
});

describe("Meta WhatsApp adapter", () => {
  it("sends an approved template through the Graph API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
      }),
    );
    const adapter = createMetaWhatsAppAdapter(
      { apiVersion: "v23.0", phoneNumberId: "phone-1", accessToken: "secret" },
      { fetch: fetchMock },
    );
    await expect(
      adapter.send({
        channel: "whatsapp",
        recipientAddress: "+14155550101",
        templateKey: "invoice_posted",
        planeKey: "neon",
        payload: {
          whatsappTemplate: {
            name: "invoice_posted",
            languageCode: "en_US",
            components: [],
          },
        },
      }),
    ).resolves.toEqual({ externalId: "wamid.1" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "14155550101",
      type: "template",
    });
  });

  it("requires templates and classifies Meta throttling as retryable", async () => {
    const adapter = createMetaWhatsAppAdapter(
      { apiVersion: "v23.0", phoneNumberId: "phone-1", accessToken: "secret" },
      { fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 429 })) },
    );
    await expect(
      adapter.send({
        channel: "whatsapp",
        recipientAddress: "+14155550101",
        templateKey: "notice",
        planeKey: "neon",
        payload: {},
      }),
    ).rejects.toThrow("whatsappTemplate");
    const error = await adapter
      .send({
        channel: "whatsapp",
        recipientAddress: "+14155550101",
        templateKey: "notice",
        planeKey: "neon",
        payload: {
          whatsappTemplate: { name: "notice", languageCode: "en_US" },
        },
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      channel: "whatsapp",
      retryable: true,
      statusCode: 429,
    });
  });
});

function mobileSubscription() {
  return {
    id: "mobile-1",
    tenantId: "tenant-1",
    principalId: "person-1",
    planeKey: "neon" as const,
    platform: "android" as const,
    endpoint: "fcm",
    deviceToken: "device-token",
  };
}
