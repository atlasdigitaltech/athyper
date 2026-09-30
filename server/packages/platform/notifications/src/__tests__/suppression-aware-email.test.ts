import { describe, expect, it, vi } from "vitest";
import { createSuppressionAwareEmailHandler } from "../suppression-aware-email.js";

const request = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  channel: "email" as const,
  recipientAddress: "recipient@example.test",
  recipientId: "22222222-2222-4222-8222-222222222222",
  tenantId: "33333333-3333-4333-8333-333333333333",
  planeKey: "neon" as const,
  templateKey: "test",
  payload: {},
};

describe("suppression-aware email", () => {
  it("blocks a suppressed recipient before calling SES", async () => {
    const send = vi.fn();
    const handler = createSuppressionAwareEmailHandler(
      {
        channel: "email",
        send,
        health: vi.fn().mockResolvedValue({ status: "healthy" }),
      },
      { isSuppressed: vi.fn().mockResolvedValue(true) },
    );
    await expect(handler.send(request)).rejects.toMatchObject({
      retryable: false,
      code: "EMAIL_RECIPIENT_SUPPRESSED",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("delegates only after the scoped registry allows delivery", async () => {
    const send = vi.fn().mockResolvedValue({
      externalId: "ses-1",
      confirmation: "provider_accepted",
    });
    const isSuppressed = vi.fn().mockResolvedValue(false);
    const handler = createSuppressionAwareEmailHandler(
      {
        channel: "email",
        send,
        health: vi.fn().mockResolvedValue({ status: "healthy" }),
      },
      { isSuppressed },
    );
    await expect(handler.send(request)).resolves.toMatchObject({
      externalId: "ses-1",
    });
    expect(isSuppressed).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: request.tenantId,
        address: request.recipientAddress,
      }),
    );
  });
});
