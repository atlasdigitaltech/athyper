import { describe, expect, it, vi } from "vitest";

import { createDerivativeRenderHandler, createDerivativeScheduler, DOCUMENT_DERIVATIVES_QUEUE, RENDER_DERIVATIVE_JOB } from "./document-derivatives.js";

describe("document derivative scheduler", () => {
  it("enqueues every governed rendition with deterministic identities", async () => {
    const enqueue = vi.fn(async (_queue: string, _name: string, _data: object, options?: { jobId?: string }) => options?.jobId ?? "job");
    const scheduler = createDerivativeScheduler({ enqueue });

    await scheduler.schedule({
      planeKey: "neon",
      tenantId: "11111111-1111-4111-8111-111111111111",
      attachmentId: "22222222-2222-4222-8222-222222222222",
      principalId: "33333333-3333-4333-8333-333333333333",
      sourceSha256: "a".repeat(64),
    });

    expect(enqueue).toHaveBeenCalledTimes(4);
    for (const call of enqueue.mock.calls) {
      expect(call[0]).toBe(DOCUMENT_DERIVATIVES_QUEUE);
      expect(call[1]).toBe(RENDER_DERIVATIVE_JOB);
      expect(call[3]?.jobId).toContain("derivative-neon-11111111-1111-4111-8111-111111111111");
    }
  });

  it("changes the idempotency identity when source bytes change", async () => {
    const enqueue = vi.fn(async (_queue: string, _name: string, _data: object, options?: { jobId?: string }) => options?.jobId ?? "job");
    const scheduler = createDerivativeScheduler({ enqueue });
    const request = { planeKey: "neon" as const, tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", principalId: "33333333-3333-4333-8333-333333333333" };
    await scheduler.schedule({ ...request, sourceSha256: "a".repeat(64) });
    const first = enqueue.mock.calls[0]?.[3]?.jobId;
    enqueue.mockClear();
    await scheduler.schedule({ ...request, sourceSha256: "b".repeat(64) });
    expect(enqueue.mock.calls[0]?.[3]?.jobId).not.toBe(first);
  });

  it("renders, persists, and stores a derivative exactly once", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 = "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const markReady = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({ id: "44444444-4444-4444-8444-444444444444", status: "pending" }),
        markProcessing: async () => undefined,
        markReady,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: { loadSource: async () => ({ storageKey: "attachments/source", contentType: "application/pdf", sha256: sourceSha256, sizeBytes: source.byteLength }) },
      transactions: { run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) => work({}) } as never,
      storage: { get: async () => source, put, delete: async () => undefined, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "", copy: async () => undefined },
      renderer: { render: async () => ({ bytes: new TextEncoder().encode("preview"), contentType: "image/webp", width: 256, height: 256, pageNumber: 1, provider: "fixture", providerVersion: "1", durationMs: 1 }), health: async () => ({ status: "healthy" as const, latencyMs: 1 }) },
    });
    const result = await handler.handle({ id: "job-1", queue: DOCUMENT_DERIVATIVES_QUEUE, name: RENDER_DERIVATIVE_JOB, data: { planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", principalId: "33333333-3333-4333-8333-333333333333", sourceSha256, derivativeType: "thumbnail", renditionCode: "thumbnail_sm", specificationHash: "a".repeat(64), expectedContentType: "image/webp" }, attempt: 1, maxAttempts: 5, enqueuedAt: new Date().toISOString() }, { signal: new AbortController().signal, attempt: 1, reportProgress: async () => undefined });
    expect(result).toMatchObject({ status: "completed", output: { renditionCode: "thumbnail_sm" } });
    expect(put).toHaveBeenCalledOnce();
    expect(markReady).toHaveBeenCalledWith(expect.objectContaining({ provider: "fixture", width: 256, height: 256 }), {});
  });

  it("removes an uploaded derivative when durable completion fails", async () => {
    const source = new TextEncoder().encode("source"); const deleted = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({ repository: { loadBySpec: async () => null, upsertPending: async () => ({ id: "44444444-4444-4444-8444-444444444444", status: "pending" }), markProcessing: async () => undefined, markReady: async () => { throw new Error("database unavailable"); }, markSkipped: async () => undefined, markFailed: async () => undefined } as never, sourceRepository: { loadSource: async () => ({ storageKey: "attachments/source", contentType: "application/pdf", sha256: "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d", sizeBytes: source.byteLength }) }, transactions: { run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) => work({}) } as never, storage: { get: async () => source, put: async () => undefined, delete: deleted, exists: async () => true, createDownloadUrl: async () => "", createUploadUrl: async () => "", copy: async () => undefined }, renderer: { render: async () => ({ bytes: new TextEncoder().encode("preview"), contentType: "image/webp", width: 1, height: 1, pageNumber: 1, provider: "fixture", providerVersion: "1", durationMs: 1 }), health: async () => ({ status: "healthy" as const, latencyMs: 1 }) } });
    await expect(handler.handle({ id: "job-1", queue: DOCUMENT_DERIVATIVES_QUEUE, name: RENDER_DERIVATIVE_JOB, data: { planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", principalId: "33333333-3333-4333-8333-333333333333", sourceSha256: "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d", derivativeType: "thumbnail", renditionCode: "thumbnail_sm", specificationHash: "a".repeat(64), expectedContentType: "image/webp" }, attempt: 1, maxAttempts: 5, enqueuedAt: new Date().toISOString() }, { signal: new AbortController().signal, attempt: 1, reportProgress: async () => undefined })).rejects.toThrow("database unavailable");
    expect(deleted).toHaveBeenCalledOnce();
  });
});
