import { describe, expect, it, vi } from "vitest";

import {
  NotificationAttachmentResolutionError,
  createNotificationAttachmentResolver,
} from "../notification-attachment-resolver.js";

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  actor: "22222222-2222-4222-8222-222222222222",
  recipient: "33333333-3333-4333-8333-333333333333",
  attachment: "44444444-4444-4444-8444-444444444444",
};

describe("notification attachment resolver", () => {
  it("returns only a just-in-time link after clean-state and recipient access checks", async () => {
    const access = { authorize: vi.fn().mockResolvedValue(true) };
    const createDownloadUrl = vi.fn().mockResolvedValue("https://objects.example/signed");
    const resolver = createNotificationAttachmentResolver({
      transactions: transactionCoordinator(),
      artifacts: { findNotificationCandidate: vi.fn().mockResolvedValue(candidate()) } as never,
      storage: { createDownloadUrl } as never,
      access,
    });

    await expect(resolver.resolveForDelivery(request())).resolves.toMatchObject({
      attachmentId: ids.attachment,
      disposition: "link",
      downloadUrl: "https://objects.example/signed",
    });
    expect(access.authorize).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ recipientPrincipalId: ids.recipient }),
    }));
    expect(createDownloadUrl).toHaveBeenCalledWith("active/key.pdf", 900);
  });

  it("fails closed for an unscanned, quarantined, or unauthorized attachment", async () => {
    const access = { authorize: vi.fn().mockResolvedValue(false) };
    const resolver = createNotificationAttachmentResolver({
      transactions: transactionCoordinator(),
      artifacts: { findNotificationCandidate: vi.fn().mockResolvedValue({
        ...candidate(), isVirusScanned: false, status: "quarantined",
      }) } as never,
      storage: {} as never,
      access,
    });

    await expect(resolver.resolveForDelivery(request())).rejects.toMatchObject({
      retryable: false,
      message: "NOTIFICATION_ATTACHMENT_NOT_DELIVERABLE",
    });
    expect(access.authorize).not.toHaveBeenCalled();
  });
});

function request() {
  return {
    planeKey: "neon" as const,
    tenantId: ids.tenant,
    actorPrincipalId: ids.actor,
    recipientPrincipalId: ids.recipient,
    attachmentId: ids.attachment,
    versionPolicy: "current" as const,
    accessMode: "link" as const,
    purpose: "notification_delivery" as const,
    deliveryId: "55555555-5555-4555-8555-555555555555",
  };
}

function transactionCoordinator() {
  return {
    run: async (
      _plane: "athyper" | "neon" | "mesh",
      _actor: { tenantId: string; principalId: string },
      work: (transaction: Record<string, never>) => unknown,
    ) => work({}),
  } as never;
}

function candidate() {
  return {
    attachmentId: ids.attachment,
    attachmentVersionId: ids.attachment,
    filename: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 20,
    sha256: "a".repeat(64),
    storageKey: "active/key.pdf",
    isActive: true,
    isVirusScanned: true,
    status: "active",
    links: [{ entityType: "invoice", entityId: "invoice-1" }],
  };
}
