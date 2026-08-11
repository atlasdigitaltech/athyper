import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  NotificationChannelHandler,
  NotificationDeliveryRequest,
} from "../index.js";

describe("notification contract API", () => {
  it("defines a provider-neutral delivery boundary", () => {
    const request = {
      channel: "email",
      recipientAddress: "person@example.test",
      templateKey: "welcome",
      payload: { renderedText: "Welcome" },
      planeKey: "neon",
    } as const satisfies NotificationDeliveryRequest;

    expect(request.channel).toBe("email");
    expectTypeOf<NotificationChannelHandler>().toHaveProperty("send");
    expectTypeOf<NotificationChannelHandler>().toHaveProperty("health");
  });

  it("includes every channel supported by the canonical event schema", () => {
    const channels = [
      "in_app",
      "email",
      "sms",
      "whatsapp",
      "push",
      "webhook",
    ] as const satisfies readonly import("../index.js").NotificationChannel[];
    expect(channels).toHaveLength(6);
  });
});
