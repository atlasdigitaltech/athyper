import { describe, expect, it, vi } from "vitest";

import { createAttachmentLifecycle } from "./attachment-lifecycle.js";

describe("attachment lifecycle", () => {
  it("stages an upload in quarantine with a bounded URL", async () => {
    let saved: { id:string;status:"uploading";storageKey:string;isCurrent:boolean;isActive:boolean;hasLegalHold:boolean;expiresAt:string } | null = null;
    const createStaged = vi.fn(async (input: { attachmentId: string; storageKey: string; expiresAt: string }) => (saved = ({
      id: input.attachmentId,
      status: "uploading" as const,
      storageKey: input.storageKey,
      isCurrent: true,
      isActive: true,
      hasLegalHold: false,
      expiresAt: input.expiresAt,
    })));
    const createUploadUrl = vi.fn(async () => "https://objects.example/upload");
    const lifecycle = createAttachmentLifecycle({
      transactions: { run: async (_plane, _actor, work) => work({}) },
      repository: {
        createStaged,
        load: async () => saved,
        finalizeClean: async () => { throw new Error("not used"); },
        quarantine: async () => undefined,
        deactivate: async () => undefined,
        expire: async () => undefined,
        markPurged: async () => undefined,
      },
      storage: {
        get: async () => new Uint8Array(),
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => false,
        createDownloadUrl: async () => "",
        createUploadUrl,
        copy: async () => undefined,
      },
      scanner: { scan: async () => ({ status: "clean", scanner: "fixture", scannedAt: new Date().toISOString(), durationMs: 1 }) },
      quota: { reserve: async () => "created", commit: async () => undefined, release: async () => false, expire: async () => [] },
      quotaPolicies: { resolve: async () => ({ kind:"attachment.storage",limitBytes:1_000_000,limitItems:100,reservationTtlSeconds:1800,retryAfterSeconds:900 }) },
      uploadUrlTtlSeconds: 300,
    });

    const result = await lifecycle.stage({
      planeKey: "studio",
      tenantId: "11111111-1111-4111-8111-111111111111",
      attachmentId: "22222222-2222-4222-8222-222222222222",
      principalId: "33333333-3333-4333-8333-333333333333",
      fileName: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });

    expect(result.storageKey).toContain("quarantine/studio/11111111-1111-4111-8111-111111111111");
    expect(createStaged).toHaveBeenCalledOnce();
    expect(createUploadUrl).toHaveBeenCalledWith(result.storageKey, 300);
  });

  it("schedules derivatives with the finalized source hash", async () => {
    const scheduleDerivatives = vi.fn(async () => undefined);
    const identity = { planeKey: "neon" as const, tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", principalId: "33333333-3333-4333-8333-333333333333" };
    const lifecycle = createAttachmentLifecycle({
      transactions: { run: async (_plane, _actor, work) => work({}) },
      repository: { createStaged: async () => { throw new Error("unused"); }, load: async () => ({ id: identity.attachmentId, status: "uploaded" as const, storageKey: "quarantine/source", isCurrent: true, isActive: true, hasLegalHold: false }), finalizeClean: async () => ({ id: identity.attachmentId, status: "active" as const, storageKey: "attachments/source", isCurrent: true, isActive: true, hasLegalHold: false }), quarantine: async () => undefined, deactivate: async () => undefined, expire: async () => undefined, markPurged: async () => undefined },
      storage: { get: async () => new TextEncoder().encode("source"), put: async () => undefined, delete: async () => undefined, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "", copy: async () => undefined },
      scanner: { scan: async () => ({ status: "clean" as const, scanner: "fixture", scannedAt: new Date().toISOString(), durationMs: 1 }) },
      quota: { reserve: async () => "created" as const, commit: async () => undefined, release: async () => false, expire: async () => [] }, quotaPolicies: { resolve: async () => ({ kind: "attachment.storage", limitBytes: 1_000, limitItems: 10, reservationTtlSeconds: 60, retryAfterSeconds: 60 }) },
      scheduler: { scheduleExtraction: async () => undefined, scheduleDerivatives, schedulePurge: async () => undefined },
    });
    await lifecycle.finalize(identity, "application/pdf");
    expect(scheduleDerivatives).toHaveBeenCalledWith(expect.objectContaining({ ...identity, sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
});
