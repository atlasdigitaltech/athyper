import { expect, it } from "vitest";
import {
  mapNotificationProviderStatus,
  nextNotificationProviderStatus,
} from "../provider-status.js";
it("separates provider acceptance from receipt across channel callbacks", () => {
  expect(mapNotificationProviderStatus("push", "accepted")).toBe("sent");
  expect(mapNotificationProviderStatus("sms", "delivered")).toBe("delivered");
  expect(mapNotificationProviderStatus("sms", "undelivered")).toBe("failed");
  expect(mapNotificationProviderStatus("whatsapp", "read")).toBe("delivered");
  expect(mapNotificationProviderStatus("whatsapp", "failed")).toBe("failed");
  expect(mapNotificationProviderStatus("email", "bounce")).toBe("bounced");
  expect(mapNotificationProviderStatus("push", "unregistered")).toBe("failed");
  expect(mapNotificationProviderStatus("sms", "invented")).toBeUndefined();
});
it("ignores duplicate and out-of-order callbacks", () => {
  expect(nextNotificationProviderStatus("sent", "delivered")).toBe("delivered");
  expect(nextNotificationProviderStatus("delivered", "sent")).toBe("delivered");
  expect(nextNotificationProviderStatus("failed", "sent")).toBe("failed");
  expect(nextNotificationProviderStatus("delivered", "delivered")).toBe(
    "delivered",
  );
});

it("passes only recognized callbacks with exact delivery coordinates to persistence", async () => {
  const { createNotificationCallbackApplier } =
    await import("../provider-status.js");
  const calls: unknown[] = [];
  const service = createNotificationCallbackApplier({
    apply: async (event, status) => {
      calls.push({ event, status });
      return "applied";
    },
  });
  const event = {
    channel: "sms" as const,
    planeKey: "neon" as const,
    tenantId: "11111111-1111-4111-8111-111111111111",
    deliveryId: "22222222-2222-4222-8222-222222222222",
    providerMessageId: "mock-sms-id",
    status: "undelivered",
  };
  expect(await service.apply(event)).toBe("applied");
  expect(calls).toEqual([{ event, status: "failed" }]);
  expect(await service.apply({ ...event, status: "constructor" })).toBe(
    "ignored",
  );
  expect(calls).toHaveLength(1);
  await expect(
    service.apply({ ...event, deliveryId: "wrong" }),
  ).rejects.toThrow("coordinates");
});
