import { describe, expect, it, vi } from "vitest";
import { createSesActivityEventApplier } from "../ses-activity-events.js";

const delivery = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  principalId: "33333333-3333-4333-8333-333333333333",
  planeKey: "neon" as const,
  status: "sent" as const,
  providerCode: "amazon_ses",
  externalId: "ses-message-1",
};

describe("SES Activity Center publishing", () => {
  it.each(["applied", "duplicate"] as const)("publishes an idempotent delivery event for %s results", async outcome => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const applier = createSesActivityEventApplier({
      apply: vi.fn().mockResolvedValue({
        outcome,
        previousStatus: "sending",
        transition: { status: "delivered", terminal: true },
        delivery,
      }),
    }, { publish });

    await applier.apply({});

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "notification.delivery",
      tenantId: delivery.tenantId,
      principalId: delivery.principalId,
      deliveryId: delivery.deliveryId,
      deliveryStatus: "delivered",
    }));
  });

  it("does not publish a user event for address-only recipients", async () => {
    const publish = vi.fn();
    const applier = createSesActivityEventApplier({
      apply: vi.fn().mockResolvedValue({
        outcome: "applied",
        previousStatus: "sending",
        transition: { status: "delivered", terminal: true },
        delivery: { ...delivery, principalId: undefined },
      }),
    }, { publish });

    await applier.apply({});
    expect(publish).not.toHaveBeenCalled();
  });
});
