import { describe, expect, it, vi } from "vitest";

import { CommunicationDeliveryError } from "../communication-delivery.error.js";
import { createSmsAdapter } from "../sms.adapter.js";

const request = {
  channel: "sms",
  recipientAddress: "+14155550101",
  templateKey: "alert",
  subject: "Alert",
  payload: { renderedText: "Action required" },
  planeKey: "mesh",
} as const;

describe("createSmsAdapter", () => {
  it("delivers SMS through Twilio with a messaging service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
    );
    const adapter = createSmsAdapter(
      {
        accountSid: "AC123",
        authToken: "token",
        messagingServiceSid: "MG123",
      },
      { fetch: fetchMock },
    );

    await expect(adapter.send(request)).resolves.toEqual({ externalId: "SM123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/Accounts/AC123/Messages.json");
    expect(init.body).toContain("To=%2B14155550101");
    expect(init.body).toContain("MessagingServiceSid=MG123");
    expect(init.body).toContain("Body=Alert%3A+Action+required");
  });

  it("classifies throttling as retryable and bad requests as permanent", async () => {
    const throttled = createSmsAdapter(baseConfig(), {
      fetch: vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    });
    const invalid = createSmsAdapter(baseConfig(), {
      fetch: vi.fn().mockResolvedValue(new Response("invalid", { status: 400 })),
    });

    const retryable = await throttled.send(request).catch((error: unknown) => error);
    const permanent = await invalid.send(request).catch((error: unknown) => error);
    expect(retryable).toBeInstanceOf(CommunicationDeliveryError);
    expect(retryable).toMatchObject({ retryable: true, statusCode: 429 });
    expect(permanent).toMatchObject({ retryable: false, statusCode: 400 });
  });

  it("maps provider health statuses", async () => {
    const adapter = createSmsAdapter(baseConfig(), {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });
    await expect(adapter.health()).resolves.toMatchObject({ status: "degraded" });
  });

  it("rejects invalid recipients and incomplete sender configuration", async () => {
    expect(() =>
      createSmsAdapter({ accountSid: "AC123", authToken: "token" }),
    ).toThrow("from number or messaging service SID");

    const adapter = createSmsAdapter(baseConfig());
    await expect(
      adapter.send({ ...request, recipientAddress: "4155550101" }),
    ).rejects.toThrow("E.164");
  });
});

function baseConfig() {
  return {
    accountSid: "AC123",
    authToken: "token",
    fromNumber: "+14155550100",
  };
}
