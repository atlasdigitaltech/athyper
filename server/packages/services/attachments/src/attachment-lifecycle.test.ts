import { describe, expect, it, vi } from "vitest";
import type { OutboxEventInput } from "@athyper/server-contract-events";

import { createAttachmentLifecycle } from "./attachment-lifecycle.js";

describe("attachment lifecycle", () => {
  it("stages an upload in quarantine with a bounded URL", async () => {
    const writes: string[] = [];
    let saved: { id:string;status:"uploading";storageKey:string;isCurrent:boolean;isActive:boolean;hasLegalHold:boolean;expiresAt:string } | null = null;
    const createStaged = vi.fn(async (input: { attachmentId: string; storageKey: string; expiresAt: string }) => { writes.push("attachment"); return (saved = ({
      id: input.attachmentId,
      status: "uploading" as const,
      storageKey: input.storageKey,
      isCurrent: true,
      isActive: true,
      hasLegalHold: false,
      expiresAt: input.expiresAt,
    })); });
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
      quota: { reserve: async () => { writes.push("quota"); return "created"; }, commit: async () => undefined, release: async () => false, expire: async () => [] },
      quotaPolicies: { resolve: async () => ({ kind:"attachment.storage",limitBytes:1_000_000,limitItems:100,reservationTtlSeconds:1800,retryAfterSeconds:900 }) },
      outbox: { append: async () => undefined },
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
    expect(writes).toEqual(["attachment", "quota"]);
    expect(createUploadUrl).toHaveBeenCalledWith(result.storageKey, 300);
  });

  it("reuses an existing staged upload without reserving quota again", async () => {
    const existing = { id: "22222222-2222-4222-8222-222222222222", status: "uploading" as const, storageKey: "quarantine/neon/existing", isCurrent: true, isActive: true, hasLegalHold: false, expiresAt: "2026-08-30T04:00:00.000Z" };
    const reserve = vi.fn(async () => "created" as const);
    const createStaged = vi.fn(async () => existing);
    const lifecycle = createAttachmentLifecycle({
      transactions: { run: async (_plane, _actor, work) => work({}) },
      repository: { lockForStaging: async () => undefined, createStaged, load: async () => existing, finalizeClean: async () => { throw new Error("unused"); }, quarantine: async () => undefined, deactivate: async () => undefined, expire: async () => undefined, markPurged: async () => undefined },
      storage: { get: async () => new Uint8Array(), put: async () => undefined, delete: async () => undefined, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "https://objects.example/existing", copy: async () => undefined },
      scanner: { scan: async () => ({ status: "clean", scanner: "fixture", scannedAt: new Date().toISOString(), durationMs: 1 }) },
      quota: { reserve, commit: async () => undefined, release: async () => false, expire: async () => [] },
      quotaPolicies: { resolve: async () => ({ kind: "attachment.storage", limitBytes: 1_000, limitItems: 10, reservationTtlSeconds: 60, retryAfterSeconds: 60 }) },
      outbox: { append: async () => undefined },
    });

    await expect(lifecycle.stage({ planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: existing.id, principalId: "33333333-3333-4333-8333-333333333333", fileName: "invoice.pdf", contentType: "application/pdf", sizeBytes: 1024 })).resolves.toMatchObject({ storageKey: existing.storageKey });
    expect(createStaged).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("schedules derivatives with the finalized source hash", async () => {
    const scheduleDerivatives = vi.fn(async () => undefined);
    const append = vi.fn(async (_event: OutboxEventInput, _tx: unknown) => undefined);
    const identity = { planeKey: "neon" as const, tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", principalId: "33333333-3333-4333-8333-333333333333" };
    const lifecycle = createAttachmentLifecycle({
      transactions: { run: async (_plane, _actor, work) => work({}) },
      repository: { createStaged: async () => { throw new Error("unused"); }, load: async () => ({ id: identity.attachmentId, status: "uploaded" as const, storageKey: "quarantine/source", isCurrent: true, isActive: true, hasLegalHold: false }), finalizeClean: async () => ({ id: identity.attachmentId, status: "active" as const, storageKey: "attachments/source", isCurrent: true, isActive: true, hasLegalHold: false }), quarantine: async () => undefined, deactivate: async () => undefined, expire: async () => undefined, markPurged: async () => undefined },
      storage: { get: async () => new TextEncoder().encode("source"), getStream: async () => (async function*(){yield new TextEncoder().encode("source");})(), put: async () => undefined, delete: async () => undefined, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "", copy: async () => undefined },
      scanner: { scan: async ({content}) => { for await (const _chunk of content) { /* consume the scan stream */ } return { status: "clean" as const, scanner: "fixture", scannedAt: new Date().toISOString(), durationMs: 1 }; } },
      quota: { reserve: async () => "created" as const, commit: async () => undefined, release: async () => false, expire: async () => [] }, quotaPolicies: { resolve: async () => ({ kind: "attachment.storage", limitBytes: 1_000, limitItems: 10, reservationTtlSeconds: 60, retryAfterSeconds: 60 }) },
      outbox: { append },
      scheduler: { scheduleExtraction: async () => undefined, scheduleDerivatives, schedulePurge: async () => undefined },
    });
    await lifecycle.finalize(identity, "application/pdf");
    expect(scheduleDerivatives).toHaveBeenCalledWith(expect.objectContaining({ ...identity, sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }), expect.objectContaining({ jobId: expect.stringMatching(/^attachment:.*:derivatives:/) }));
    expect(append).toHaveBeenCalledTimes(3);
    expect(append.mock.calls.map(([event]) => event.eventType)).toEqual(["attachments.finalized", "attachments.extraction.requested", "attachments.derivatives.requested"]);
  });

  it("uses the privileged tenant-scoped lookup during retention cleanup", async () => {
    const load = vi.fn(async () => null);
    const loadForMaintenance = vi.fn(async () => ({ id: "attachment-1", status: "expired" as const, storageKey: "attachments/old", isCurrent: false, isActive: false, hasLegalHold: false }));
    const markPurgedForMaintenance = vi.fn(async () => undefined);
    const lifecycle = createAttachmentLifecycle({
      transactions: { run: async (_plane, _actor, work) => work({}) },
      repository: { createStaged: async () => { throw new Error("unused"); }, load, loadForMaintenance, finalizeClean: async () => { throw new Error("unused"); }, quarantine: async () => undefined, deactivate: async () => undefined, expire: async () => undefined, markPurged: async () => undefined, markPurgedForMaintenance, listRetentionCandidates: async () => ["attachment-1"] },
      storage: { get: async () => new Uint8Array(), put: async () => undefined, delete: async () => undefined, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "", copy: async () => undefined },
      scanner: { scan: async () => ({ status: "clean", scanner: "fixture", scannedAt: new Date().toISOString(), durationMs: 1 }) },
      quota: { reserve: async () => "created", commit: async () => undefined, release: async () => true, expire: async () => [] }, quotaPolicies: { resolve: async () => ({ kind: "attachment.storage", limitBytes: 1_000, limitItems: 10, reservationTtlSeconds: 60, retryAfterSeconds: 60 }) }, outbox: { append: async () => undefined },
    });
    await expect(lifecycle.cleanupRetention({ planeKey: "neon", tenantId: "tenant-1", principalId: "maintenance-1" })).resolves.toEqual({ examined: 1, purged: 1, deferred: 0 });
    expect(load).not.toHaveBeenCalled();
    expect(loadForMaintenance).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", attachmentId: "attachment-1" }), {});
    expect(markPurgedForMaintenance).toHaveBeenCalledOnce();
  });
});
