import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createDerivativeRenderHandler,
  createDerivativeScheduler,
  DOCUMENT_DERIVATIVES_QUEUE,
  RENDER_DERIVATIVE_JOB,
} from "./document-derivatives.js";

describe("document derivative scheduler", () => {
  it("enqueues every governed rendition with deterministic identities", async () => {
    const enqueue = vi.fn(
      async (
        _queue: string,
        _name: string,
        _data: object,
        options?: { jobId?: string },
      ) => options?.jobId ?? "job",
    );
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
      expect(call[3]?.jobId).toContain(
        "derivative-neon-11111111-1111-4111-8111-111111111111",
      );
    }
  });

  it("changes the idempotency identity when source bytes change", async () => {
    const enqueue = vi.fn(
      async (
        _queue: string,
        _name: string,
        _data: object,
        options?: { jobId?: string },
      ) => options?.jobId ?? "job",
    );
    const scheduler = createDerivativeScheduler({ enqueue });
    const request = {
      planeKey: "neon" as const,
      tenantId: "11111111-1111-4111-8111-111111111111",
      attachmentId: "22222222-2222-4222-8222-222222222222",
      principalId: "33333333-3333-4333-8333-333333333333",
    };
    await scheduler.schedule({ ...request, sourceSha256: "a".repeat(64) });
    const first = enqueue.mock.calls[0]?.[3]?.jobId;
    enqueue.mockClear();
    await scheduler.schedule({ ...request, sourceSha256: "b".repeat(64) });
    expect(enqueue.mock.calls[0]?.[3]?.jobId).not.toBe(first);
  });

  it("renders, persists, and stores a derivative exactly once", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 =
      "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const markReady = vi.fn(async () => undefined);
    const markProcessing = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    const scan = vi.fn(async () => ({
      status: "clean" as const,
      scanner: "fixture",
      scannedAt: new Date().toISOString(),
      durationMs: 1,
    }));
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing,
        markReady,
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => ({
          bytes: new TextEncoder().encode("preview"),
          contentType: "image/webp",
          width: 256,
          height: 256,
          pageNumber: 1,
          provider: "fixture",
          providerVersion: "1",
          durationMs: 1,
        }),
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: { scan },
    });
    const result = await handler.handle(
      {
        id: "job-1",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: {
          planeKey: "neon",
          tenantId: "11111111-1111-4111-8111-111111111111",
          attachmentId: "22222222-2222-4222-8222-222222222222",
          principalId: "33333333-3333-4333-8333-333333333333",
          sourceSha256,
          derivativeType: "thumbnail",
          renditionCode: "thumbnail_sm",
          specificationHash: "a".repeat(64),
          expectedContentType: "image/webp",
        },
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { renditionCode: "thumbnail_sm" },
    });
    expect(scan).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(markReady).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "fixture", width: 256, height: 256 }),
      {},
    );
    // Every mutating call must carry the audit actor — a NOT NULL updated_at with a NULL
    // updated_by violates the table's audit-pair constraint in real Postgres.
    expect(markProcessing).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
      {},
    );
    // The scan must run before the object is ever written to storage.
    const scanCallOrder = scan.mock.invocationCallOrder[0]!;
    const putCallOrder = put.mock.invocationCallOrder[0]!;
    expect(scanCallOrder).toBeLessThan(putCallOrder);
  });

  it("stores under a content-addressed key, so different rendered bytes never collide on the same key", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 =
      "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const put = vi.fn(async (_key: string, ..._rest: unknown[]) => undefined);
    const outputBytes = new TextEncoder().encode("preview-v1");
    const expectedSha256 = createHash("sha256")
      .update(outputBytes)
      .digest("hex");
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady: async () => undefined,
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => ({
          bytes: outputBytes,
          contentType: "image/webp",
          width: 1,
          height: 1,
          pageNumber: 1,
          provider: "fixture",
          providerVersion: "1",
          durationMs: 1,
        }),
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "clean" as const,
          scanner: "fixture",
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    const result = await handler.handle(
      {
        id: "job-1",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: {
          planeKey: "neon",
          tenantId: "11111111-1111-4111-8111-111111111111",
          attachmentId: "22222222-2222-4222-8222-222222222222",
          principalId: "33333333-3333-4333-8333-333333333333",
          sourceSha256,
          derivativeType: "thumbnail",
          renditionCode: "thumbnail_sm",
          specificationHash: "a".repeat(64),
          expectedContentType: "image/webp",
        },
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(result).toMatchObject({ status: "completed" });
    const storageKey = put.mock.calls[0]![0];
    expect(storageKey).toContain(expectedSha256);
    expect(storageKey).not.toContain("a".repeat(8)); // not the old specification-hash-derived key
  });

  it("quarantines a derivative whose rendered bytes fail the scan, without ever storing them", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 =
      "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const markReady = vi.fn(async () => undefined);
    const markQuarantined = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady,
        markQuarantined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => ({
          bytes: new TextEncoder().encode("preview"),
          contentType: "image/webp",
          width: 256,
          height: 256,
          pageNumber: 1,
          provider: "fixture",
          providerVersion: "1",
          durationMs: 1,
        }),
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "infected" as const,
          scanner: "fixture",
          threatNames: ["Eicar-Signature"],
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    const result = await handler.handle(
      {
        id: "job-1",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: {
          planeKey: "neon",
          tenantId: "11111111-1111-4111-8111-111111111111",
          attachmentId: "22222222-2222-4222-8222-222222222222",
          principalId: "33333333-3333-4333-8333-333333333333",
          sourceSha256,
          derivativeType: "thumbnail",
          renditionCode: "thumbnail_sm",
          specificationHash: "a".repeat(64),
          expectedContentType: "image/webp",
        },
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(result).toMatchObject({
      status: "discarded",
      reason: "malware_detected",
    });
    expect(put).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
    expect(markQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "44444444-4444-4444-8444-444444444444",
        tenantId: "11111111-1111-4111-8111-111111111111",
        reason: "malware_detected",
      }),
      {},
    );
  });

  it("does not treat a legacy 'ready' row lacking scan evidence as usable, and re-renders it", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 =
      "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const render = vi.fn(async () => ({
      bytes: new TextEncoder().encode("preview"),
      contentType: "image/webp",
      width: 1,
      height: 1,
      pageNumber: 1,
      provider: "fixture",
      providerVersion: "1",
      durationMs: 1,
    }));
    const markReady = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({
      repository: {
        // A pre-Stage-3 row: status is "ready" but it was never scanned.
        loadBySpec: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "ready",
          scanStatus: null,
        }),
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
          scanStatus: null,
        }),
        markProcessing: async () => undefined,
        markReady,
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render,
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "clean" as const,
          scanner: "fixture",
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    const result = await handler.handle(
      {
        id: "job-1",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: {
          planeKey: "neon",
          tenantId: "11111111-1111-4111-8111-111111111111",
          attachmentId: "22222222-2222-4222-8222-222222222222",
          principalId: "33333333-3333-4333-8333-333333333333",
          sourceSha256,
          derivativeType: "thumbnail",
          renditionCode: "thumbnail_sm",
          specificationHash: "a".repeat(64),
          expectedContentType: "image/webp",
        },
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { renditionCode: "thumbnail_sm" },
    });
    expect(render).toHaveBeenCalledOnce();
    expect(markReady).toHaveBeenCalledOnce();
  });

  it("still skips a legacy 'ready' row once it carries clean scan evidence", async () => {
    const render = vi.fn();
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "ready",
          scanStatus: "clean",
        }),
        upsertPending: async () => {
          throw new Error("must not be called");
        },
        markProcessing: async () => undefined,
        markReady: async () => undefined,
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => {
          throw new Error("must not be called");
        },
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => new Uint8Array(),
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render,
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => {
          throw new Error("must not be called");
        },
      },
    });
    const result = await handler.handle(
      {
        id: "job-1",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: {
          planeKey: "neon",
          tenantId: "11111111-1111-4111-8111-111111111111",
          attachmentId: "22222222-2222-4222-8222-222222222222",
          principalId: "33333333-3333-4333-8333-333333333333",
          sourceSha256: "a".repeat(64),
          derivativeType: "thumbnail",
          renditionCode: "thumbnail_sm",
          specificationHash: "a".repeat(64),
          expectedContentType: "image/webp",
        },
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      {
        signal: new AbortController().signal,
        attempt: 1,
        reportProgress: async () => undefined,
      },
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { skipped: true, reason: "already_ready" },
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("propagates scan cancellation without storing or marking ready", async () => {
    const source = new TextEncoder().encode("source");
    const sourceSha256 =
      "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d";
    const controller = new AbortController();
    const put = vi.fn(async () => undefined);
    const markReady = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady,
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
        load: async () => null,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => ({
          bytes: new TextEncoder().encode("preview"),
          contentType: "image/webp",
          width: 1,
          height: 1,
          pageNumber: 1,
          provider: "fixture",
          providerVersion: "1",
          durationMs: 1,
        }),
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async ({ signal }) => {
          controller.abort(new Error("cancelled by caller"));
          expect(signal?.aborted).toBe(true);
          throw signal?.reason instanceof Error
            ? signal.reason
            : new Error("aborted");
        },
      },
    });
    await expect(
      handler.handle(
        {
          id: "job-1",
          queue: DOCUMENT_DERIVATIVES_QUEUE,
          name: RENDER_DERIVATIVE_JOB,
          data: {
            planeKey: "neon",
            tenantId: "11111111-1111-4111-8111-111111111111",
            attachmentId: "22222222-2222-4222-8222-222222222222",
            principalId: "33333333-3333-4333-8333-333333333333",
            sourceSha256,
            derivativeType: "thumbnail",
            renditionCode: "thumbnail_sm",
            specificationHash: "a".repeat(64),
            expectedContentType: "image/webp",
          },
          attempt: 1,
          maxAttempts: 5,
          enqueuedAt: new Date().toISOString(),
        },
        {
          signal: controller.signal,
          attempt: 1,
          reportProgress: async () => undefined,
        },
      ),
    ).rejects.toThrow("cancelled by caller");
    expect(put).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
  });

  it("removes an uploaded derivative when durable completion fails", async () => {
    const source = new TextEncoder().encode("source");
    const deleted = vi.fn(async () => undefined);
    const handler = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady: async () => {
          throw new Error("database unavailable");
        },
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256:
            "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d",
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put: async () => undefined,
        delete: deleted,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => ({
          bytes: new TextEncoder().encode("preview"),
          contentType: "image/webp",
          width: 1,
          height: 1,
          pageNumber: 1,
          provider: "fixture",
          providerVersion: "1",
          durationMs: 1,
        }),
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "clean" as const,
          scanner: "fixture",
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    await expect(
      handler.handle(
        {
          id: "job-1",
          queue: DOCUMENT_DERIVATIVES_QUEUE,
          name: RENDER_DERIVATIVE_JOB,
          data: {
            planeKey: "neon",
            tenantId: "11111111-1111-4111-8111-111111111111",
            attachmentId: "22222222-2222-4222-8222-222222222222",
            principalId: "33333333-3333-4333-8333-333333333333",
            sourceSha256:
              "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d",
            derivativeType: "thumbnail",
            renditionCode: "thumbnail_sm",
            specificationHash: "a".repeat(64),
            expectedContentType: "image/webp",
          },
          attempt: 1,
          maxAttempts: 5,
          enqueuedAt: new Date().toISOString(),
        },
        {
          signal: new AbortController().signal,
          attempt: 1,
          reportProgress: async () => undefined,
        },
      ),
    ).rejects.toThrow("database unavailable");
    expect(deleted).toHaveBeenCalledOnce();
  });

  it("gives two attempts that render byte-identical output different storage keys, so a failing attempt's cleanup can never touch the other's committed object", async () => {
    // Two independent attempts for the same attachment+rendition (a duplicate job delivery, or a
    // retry) render byte-identical output. Content alone would put them at the same key; each
    // attempt must still get its own exclusive key, so one attempt's cleanup can never be able to
    // delete the object another attempt's row depends on — by construction, not by a runtime
    // check that could itself fail or race.
    const source = new TextEncoder().encode("source");
    const identicalOutput = {
      bytes: new TextEncoder().encode("identical-output"),
      contentType: "image/webp",
      width: 1,
      height: 1,
      pageNumber: 1,
      provider: "fixture",
      providerVersion: "1",
      durationMs: 1,
    };
    const jobData = {
      planeKey: "neon" as const,
      tenantId: "11111111-1111-4111-8111-111111111111",
      attachmentId: "22222222-2222-4222-8222-222222222222",
      principalId: "33333333-3333-4333-8333-333333333333",
      sourceSha256:
        "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d",
      derivativeType: "thumbnail",
      renditionCode: "thumbnail_sm",
      specificationHash: "a".repeat(64),
      expectedContentType: "image/webp",
    };
    const context = {
      signal: new AbortController().signal,
      attempt: 1,
      reportProgress: async () => undefined,
    };

    // Attempt A: succeeds and commits.
    const putA = vi.fn(async () => undefined);
    let committedKey: string | undefined;
    const handlerA = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "44444444-4444-4444-8444-444444444444",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady: async (input: { storageKey: string }) => {
          committedKey = input.storageKey;
        },
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: jobData.sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put: putA,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => identicalOutput,
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "clean" as const,
          scanner: "fixture",
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    await handlerA.handle(
      {
        id: "job-a",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        data: jobData,
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: new Date().toISOString(),
      },
      context,
    );
    expect(committedKey).toBeDefined();

    // Attempt B: renders the exact same bytes, but its own markReady() fails.
    const deletedB = vi.fn(async () => undefined);
    let attemptBKey: string | undefined;
    const handlerB = createDerivativeRenderHandler({
      repository: {
        loadBySpec: async () => null,
        upsertPending: async () => ({
          id: "55555555-5555-4555-8555-555555555555",
          status: "pending",
        }),
        markProcessing: async () => undefined,
        markReady: async () => {
          throw new Error("transient database error");
        },
        markQuarantined: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
      } as never,
      sourceRepository: {
        loadSource: async () => ({
          storageKey: "attachments/source",
          contentType: "application/pdf",
          sha256: jobData.sourceSha256,
          sizeBytes: source.byteLength,
        }),
      },
      transactions: {
        run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
          work({}),
      } as never,
      storage: {
        get: async () => source,
        put: async (key: string) => {
          attemptBKey = key;
        },
        delete: deletedB,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      renderer: {
        render: async () => identicalOutput,
        health: async () => ({ status: "healthy" as const, latencyMs: 1 }),
      },
      scanner: {
        scan: async () => ({
          status: "clean" as const,
          scanner: "fixture",
          scannedAt: new Date().toISOString(),
          durationMs: 1,
        }),
      },
    });
    await expect(
      handlerB.handle(
        {
          id: "job-b",
          queue: DOCUMENT_DERIVATIVES_QUEUE,
          name: RENDER_DERIVATIVE_JOB,
          data: jobData,
          attempt: 1,
          maxAttempts: 5,
          enqueuedAt: new Date().toISOString(),
        },
        context,
      ),
    ).rejects.toThrow("transient database error");

    expect(attemptBKey).toBeDefined();
    expect(attemptBKey).not.toBe(committedKey);
    expect(deletedB).toHaveBeenCalledWith(attemptBKey);
    expect(deletedB).not.toHaveBeenCalledWith(committedKey);
  });
});
