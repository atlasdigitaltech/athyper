import { describe, expect, it, vi } from "vitest";
import { createCaptureChannel, createCapturePush } from "../capture.adapter.js";
import type { NotificationChannelHandler } from "@athyper/server-contract-notifications";

function fixture() {
  const send = vi.fn().mockResolvedValue({ externalId: "smtp-id" });
  const inbox: NotificationChannelHandler = { channel: "email", send, health: async () => ({ status: "healthy" }) };
  return { inbox, send };
}
describe("local capture", () => {
  it.each(["email", "sms", "whatsapp"] as const)("captures %s without using the recipient as an SMTP destination", async (channel) => {
    const { inbox, send } = fixture();
    const result = await createCaptureChannel(channel, inbox).send({
      channel, recipientAddress: "real@example.com", senderOverride: "untrusted@example.com",
      templateKey: "test", planeKey: "neon", tenantId: "tenant", payload: { renderedText: "hello" },
    });
    expect(result.externalId).toBe("capture:smtp-id");
    expect(send.mock.calls[0]?.[0]).toMatchObject({ recipientAddress: `${channel}@capture.dev.athyper.test` });
    expect(send.mock.calls[0]?.[0].senderOverride).toBe(`${channel === "email" ? "noreply" : channel}@dev.athyper.test`);
    expect(JSON.parse(send.mock.calls[0]?.[0].payload.renderedText)).toMatchObject({ simulation: true, tenantId: "tenant", recipientAddress: "real@example.com" });
  });
  it("propagates capture failures instead of reporting success", async () => {
    const { inbox, send } = fixture();
    send.mockRejectedValue(new Error("SMTP unavailable"));
    await expect(createCaptureChannel("sms", inbox).send({ channel: "sms", recipientAddress: "+10000000000", templateKey: "test", planeKey: "neon", payload: {} })).rejects.toThrow("SMTP unavailable");
  });
  it("captures push without storing device credentials", async () => {
    const { inbox, send } = fixture();
    await createCapturePush(inbox).send({ id: "subscription", tenantId: "tenant", principalId: "principal", planeKey: "neon", platform: "android", endpoint: "secret-endpoint", deviceToken: "secret-token" }, { body: "hello" });
    const text = send.mock.calls[0]?.[0].payload.renderedText;
    expect(text).toContain("subscription");
    expect(text).not.toContain("secret-");
  });
});
