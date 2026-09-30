import { describe, expect, it } from "vitest";
import type { NormalizedSesDeliveryEvent, NotificationProviderDeliverySnapshot, SesDeliveryEventRepository } from "@athyper/server-contract-notifications";
import { createSesDeliveryEventProcessor, normalizeSesDeliveryEvent, sesDeliveryTransition } from "../ses-delivery-events.js";

const deliveryId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";

function event(type: string, node: Record<string, unknown> = {}) {
  return {
    id: `evt-${type}`,
    detail: {
      eventType: type,
      mail: {
        messageId: "ses-message-1",
        timestamp: "2026-08-25T00:00:00Z",
        destination: ["secret@example.test"],
        tags: {
          "athyper-delivery": [deliveryId],
          "athyper-tenant": [tenantId],
          "athyper-plane": ["neon"],
        },
      },
      ...node,
    },
  };
}

describe("SES delivery event normalization", () => {
  it.each([
    ["Send", "send"], ["Delivery", "delivery"], ["DeliveryDelay", "delivery_delay"],
    ["Bounce", "bounce"], ["Complaint", "complaint"], ["Reject", "reject"],
    ["Rendering Failure", "rendering_failure"],
  ])("normalizes %s", (providerType, expected) => {
    expect(normalizeSesDeliveryEvent(event(providerType)).type).toBe(expected);
  });

  it("retains only safe bounce classifications", () => {
    const normalized = normalizeSesDeliveryEvent(event("Bounce", {
      bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "secret@example.test" }] },
    }));
    expect(normalized.diagnostic).toEqual({ category: "bounce", subcategory: "permanent.general" });
    expect(JSON.stringify(normalized)).not.toContain("secret@example.test");
    expect(normalized.redacted).toBe(true);
  });

  it("does not retain reject or rendering failure text", () => {
    const rejected = normalizeSesDeliveryEvent(event("Reject", { reject: { reason: "Mailbox secret@example.test was rejected" } }));
    const rendering = normalizeSesDeliveryEvent(event("Rendering Failure", { failure: { errorMessage: "Template exposed secret@example.test" } }));
    expect(rejected.diagnostic).toEqual({ category: "reject" });
    expect(rendering.diagnostic).toEqual({ category: "rendering_failure" });
    expect(JSON.stringify([rejected, rendering])).not.toContain("secret@example.test");
  });

  it("derives a stable id when EventBridge does not supply one", () => {
    const input = event("Delivery");
    delete (input as {id?:string}).id;
    expect(normalizeSesDeliveryEvent(input).providerEventId).toMatch(/^[a-f0-9]{64}$/);
    expect(normalizeSesDeliveryEvent(input).providerEventId).toBe(normalizeSesDeliveryEvent(input).providerEventId);
  });

  it("fails closed without trusted Athyper correlation tags", () => {
    const input = event("Delivery");
    delete (input.detail.mail.tags as Record<string, unknown>)["athyper-tenant"];
    expect(() => normalizeSesDeliveryEvent(input)).toThrow("athyper-tenant tag");
  });
});

describe("SES delivery transitions", () => {
  const normalized = (type: string) => normalizeSesDeliveryEvent(event(type));
  it("treats Send as provider acceptance, not delivery", () => {
    expect(sesDeliveryTransition("sending", normalized("Send"))).toEqual({ status: "sent", terminal: false, setSentAt: true });
  });
  it("makes SES Delivery authoritative", () => {
    expect(sesDeliveryTransition("sent", normalized("Delivery"))).toMatchObject({ status: "delivered", terminal: true, setDeliveredAt: true });
  });
  it("does not regress a delivered item on a late delay", () => {
    expect(sesDeliveryTransition("delivered", normalized("DeliveryDelay"))).toBeUndefined();
  });
  it("allows a complaint after delivery to become a permanent failure", () => {
    expect(sesDeliveryTransition("delivered", normalized("Complaint"))).toMatchObject({ status: "failed", terminal: true, errorCategory: "permanent" });
  });
  it("projects delays without pretending they are delivered", () => {
    expect(sesDeliveryTransition("sent", normalized("DeliveryDelay"))).toMatchObject({
      status: "sent", terminal: false, errorCategory: "transient",
    });
  });
  it.each(["Reject", "Rendering Failure"])("projects %s as a permanent failure", type => {
    expect(sesDeliveryTransition("sent", normalized(type))).toMatchObject({
      status: "failed", terminal: true, errorCategory: "permanent",
    });
  });
  it("keeps terminal delivery authoritative over a late rejection", () => {
    expect(sesDeliveryTransition("delivered", normalized("Reject"))).toBeUndefined();
  });
});

describe("SES delivery event processor", () => {
  it("correlates, applies once, and identifies duplicate events", async () => {
    const snapshot: NotificationProviderDeliverySnapshot = {
      deliveryId, tenantId, principalId: "44444444-4444-4444-8444-444444444444", planeKey: "neon", status: "sent", providerCode: "amazon_ses", externalId: "ses-message-1",
    };
    let duplicate = false;
    const repository: SesDeliveryEventRepository = {
      findByProviderMessageId: async () => snapshot,
      recordAndApply: async () => duplicate ? "duplicate" : (duplicate = true, "applied"),
    };
    const processor = createSesDeliveryEventProcessor(repository);
    await expect(processor.apply(event("Delivery"))).resolves.toMatchObject({ outcome: "applied", delivery: { principalId: "44444444-4444-4444-8444-444444444444" } });
    await expect(processor.apply(event("Delivery"))).resolves.toMatchObject({ outcome: "duplicate" });
  });

  it("rejects a cross-tenant correlation mismatch", async () => {
    const repository: SesDeliveryEventRepository = {
      findByProviderMessageId: async (): Promise<NotificationProviderDeliverySnapshot> => ({
        deliveryId, tenantId: "33333333-3333-4333-8333-333333333333", planeKey: "neon", status: "sent", externalId: "ses-message-1",
      }),
      recordAndApply: async () => { throw new Error("must not apply"); },
    };
    await expect(createSesDeliveryEventProcessor(repository).apply(event("Delivery"))).resolves.toEqual({ outcome: "correlation_mismatch" });
  });
});
