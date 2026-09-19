import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createDerivativeScanBackfillHandler,
  DERIVATIVE_SCAN_BACKFILL_JOB,
  DERIVATIVE_SCAN_BACKFILL_QUEUE,
  submitDerivativeScanBackfill,
} from "./derivative-scan-backfill.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const principalId = "33333333-3333-4333-8333-333333333333";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function job(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job-1",
    queue: DERIVATIVE_SCAN_BACKFILL_QUEUE,
    name: DERIVATIVE_SCAN_BACKFILL_JOB,
    data: {
      planeKey: "neon" as const,
      tenantId,
      principalId,
      requestId: "req-1",
      dryRun: false,
      batchSize: 10,
      concurrency: 2,
      ...overrides,
    },
    attempt: 1,
    maxAttempts: 3,
    enqueuedAt: new Date().toISOString(),
  };
}

function context(signal?: AbortSignal) {
  return {
    signal: signal ?? new AbortController().signal,
    attempt: 1,
    reportProgress: vi.fn(async () => undefined),
  };
}

const transactions = {
  run: async (_plane: never, _actor: never, work: (tx: {}) => unknown) =>
    work({}),
} as never;
const cleanScanner = {
  scan: async () => ({
    status: "clean" as const,
    scanner: "fixture",
    scannedAt: new Date().toISOString(),
    durationMs: 1,
  }),
};
const infectedScanner = {
  scan: async () => ({
    status: "infected" as const,
    scanner: "fixture",
    threatNames: ["Eicar-Signature"],
    scannedAt: new Date().toISOString(),
    durationMs: 1,
  }),
};

/** Fills in the repository methods a given test doesn't care about with safe no-op defaults. */
function repo(overrides: {
  loadBatch?: unknown;
  recordScanEvidence?: unknown;
  quarantine?: unknown;
  loadPendingCleanup?: unknown;
  confirmDeleted?: unknown;
}) {
  return {
    loadBatch: vi.fn().mockResolvedValueOnce([]),
    recordScanEvidence: vi.fn(async () => ({ updated: true })),
    quarantine: vi.fn(async () => ({ updated: true })),
    loadPendingCleanup: vi.fn().mockResolvedValueOnce([]),
    confirmDeleted: vi.fn(async () => ({ updated: true })),
    ...overrides,
  } as never;
}

describe("derivative scan backfill", () => {
  it("records scan evidence for clean derivatives, bound to the exact object scanned", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const expectedSha256 = sha256(bytes);
    const recordScanEvidence = vi.fn(async () => ({ updated: true }));
    const quarantine = vi.fn(async () => ({ updated: true }));
    const deleteObject = vi.fn(async () => undefined);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "derivatives/neon/t/a/thumbnail_sm/spec",
              contentType: "image/webp",
              expectedSha256,
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence,
        quarantine,
      }),
      transactions,
      storage: { get: async () => bytes, delete: deleteObject },
      scanner: cleanScanner,
    });

    const result = await handler.handle(job() as never, context());
    expect(result).toMatchObject({
      status: "completed",
      output: {
        processed: 1,
        clean: 1,
        quarantined: 0,
        changed: 0,
        cleaned: 0,
      },
    });
    expect(recordScanEvidence).toHaveBeenCalledWith(
      {
        id: "d1",
        tenantId,
        expectedStorageKey: "derivatives/neon/t/a/thumbnail_sm/spec",
        expectedSha256,
        principalId,
      },
      {},
    );
    expect(quarantine).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("quarantines infected derivatives, persisting quarantine before deleting the object, then confirms deletion", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const expectedSha256 = sha256(bytes);
    const callOrder: string[] = [];
    const quarantine = vi.fn(async () => {
      callOrder.push("quarantine");
      return { updated: true };
    });
    const deleteObject = vi.fn(async () => {
      callOrder.push("delete");
    });
    const confirmDeleted = vi.fn(async () => {
      callOrder.push("confirmDeleted");
      return { updated: true };
    });
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "derivatives/neon/t/a/thumbnail_sm/spec",
              contentType: "image/webp",
              expectedSha256,
            },
          ])
          .mockResolvedValueOnce([]),
        quarantine,
        confirmDeleted,
      }),
      transactions,
      storage: { get: async () => bytes, delete: deleteObject },
      scanner: infectedScanner,
    });

    const result = await handler.handle(job() as never, context());
    expect(result).toMatchObject({
      status: "completed",
      output: { processed: 1, clean: 0, quarantined: 1 },
    });
    expect(quarantine).toHaveBeenCalledWith(
      {
        id: "d1",
        tenantId,
        reason: "malware_detected",
        expectedStorageKey: "derivatives/neon/t/a/thumbnail_sm/spec",
        expectedSha256,
        principalId,
      },
      {},
    );
    expect(deleteObject).toHaveBeenCalledWith(
      "derivatives/neon/t/a/thumbnail_sm/spec",
    );
    expect(confirmDeleted).toHaveBeenCalledWith(
      {
        id: "d1",
        tenantId,
        expectedStorageKey: "derivatives/neon/t/a/thumbnail_sm/spec",
        principalId,
      },
      {},
    );
    // Quarantine must be durable before the object is touched, and confirmed only after deletion.
    expect(callOrder).toEqual(["quarantine", "delete", "confirmDeleted"]);
  });

  it("reports failure but leaves the row safely quarantined when object deletion fails", async () => {
    const bytes = new Uint8Array([9]);
    const expectedSha256 = sha256(bytes);
    const quarantine = vi.fn(async () => ({ updated: true }));
    const confirmDeleted = vi.fn(async () => ({ updated: true }));
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256,
            },
          ])
          .mockResolvedValueOnce([]),
        quarantine,
        confirmDeleted,
      }),
      transactions,
      storage: {
        get: async () => bytes,
        delete: async () => {
          throw new Error("storage unavailable");
        },
      },
      scanner: infectedScanner,
    });

    await expect(handler.handle(job() as never, context())).rejects.toThrow(
      /1 failed candidate/,
    );
    // The security decision is already durable even though cleanup failed.
    expect(quarantine).toHaveBeenCalledOnce();
    expect(confirmDeleted).not.toHaveBeenCalled();
  });

  it("retries a previously failed deletion via the cleanup sweep and confirms once it succeeds", async () => {
    // Simulates a second run: the row is already quarantined (from a prior run whose deletion
    // failed) and no longer surfaces from loadBatch (it's not "ready" anymore) — only the
    // cleanup sweep, which selects quarantined rows with a lingering storage_key, can retry it.
    const deleteObject = vi.fn(async () => undefined);
    const confirmDeleted = vi.fn(async () => ({ updated: true }));
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadPendingCleanup: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: "a".repeat(64),
            },
          ])
          .mockResolvedValueOnce([]),
        confirmDeleted,
      }),
      transactions,
      storage: { get: async () => new Uint8Array(), delete: deleteObject },
      scanner: cleanScanner,
    });

    const result = await handler.handle(job() as never, context());
    expect(result).toMatchObject({
      status: "completed",
      output: { cleaned: 1 },
    });
    expect(deleteObject).toHaveBeenCalledWith("key");
    expect(confirmDeleted).toHaveBeenCalledWith(
      { id: "d1", tenantId, expectedStorageKey: "key", principalId },
      {},
    );
  });

  it("keeps failing the cleanup sweep (and the job) when deletion keeps failing, without confirming", async () => {
    const confirmDeleted = vi.fn(async () => ({ updated: true }));
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadPendingCleanup: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: "a".repeat(64),
            },
          ])
          .mockResolvedValueOnce([]),
        confirmDeleted,
      }),
      transactions,
      storage: {
        get: async () => new Uint8Array(),
        delete: async () => {
          throw new Error("still unavailable");
        },
      },
      scanner: cleanScanner,
    });

    await expect(handler.handle(job() as never, context())).rejects.toThrow(
      /1 failed candidate/,
    );
    expect(confirmDeleted).not.toHaveBeenCalled();
  });

  it("skips the cleanup sweep entirely on a dry run", async () => {
    const loadPendingCleanup = vi.fn().mockResolvedValueOnce([]);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({ loadPendingCleanup }),
      transactions,
      storage: {
        get: async () => new Uint8Array(),
        delete: async () => undefined,
      },
      scanner: cleanScanner,
    });

    await handler.handle(job({ dryRun: true }) as never, context());
    expect(loadPendingCleanup).not.toHaveBeenCalled();
  });

  it("treats a concurrent rebuild (checksum mismatch) as changed, never certifying or deleting the wrong bytes", async () => {
    const originalBytes = new Uint8Array([1, 2, 3]);
    const rebuiltBytes = new Uint8Array([9, 9, 9]);
    const recordScanEvidence = vi.fn(async () => ({ updated: true }));
    const quarantine = vi.fn(async () => ({ updated: true }));
    const deleteObject = vi.fn(async () => undefined);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: sha256(originalBytes),
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence,
        quarantine,
      }),
      transactions,
      // A concurrent render replaced the object at this key before we read it (or the read raced
      // a write in flight) — content-addressing means this can only happen for a key reused by
      // identical bytes, but the checksum check still guards a corrupted/partial read.
      storage: { get: async () => rebuiltBytes, delete: deleteObject },
      scanner: cleanScanner,
    });

    const result = await handler.handle(job() as never, context());
    expect(result).toMatchObject({
      status: "completed",
      output: { processed: 1, clean: 0, quarantined: 0, changed: 1 },
    });
    expect(recordScanEvidence).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("treats a row changed between the checksum check and the write as changed, not success", async () => {
    // The repository's conditional UPDATE reports no match: something modified the row's
    // status/storage identity between our verification and the write (e.g. a concurrent render
    // committed first), even though our in-memory check passed.
    const bytes = new Uint8Array([1]);
    const expectedSha256 = sha256(bytes);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256,
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence: vi.fn(async () => ({ updated: false })),
        quarantine: vi.fn(async () => ({ updated: false })),
      }),
      transactions,
      storage: { get: async () => bytes, delete: async () => undefined },
      scanner: cleanScanner,
    });

    const result = await handler.handle(job() as never, context());
    expect(result).toMatchObject({
      status: "completed",
      output: { processed: 1, clean: 0, changed: 1 },
    });
  });

  it("dry run scans but writes nothing", async () => {
    const bytes = new Uint8Array([1]);
    const recordScanEvidence = vi.fn(async () => ({ updated: true }));
    const quarantine = vi.fn(async () => ({ updated: true }));
    const deleteObject = vi.fn(async () => undefined);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: sha256(bytes),
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence,
        quarantine,
      }),
      transactions,
      storage: { get: async () => bytes, delete: deleteObject },
      scanner: infectedScanner,
    });

    const result = await handler.handle(
      job({ dryRun: true }) as never,
      context(),
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { processed: 1, quarantined: 1, dryRun: true },
    });
    expect(recordScanEvidence).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("rejects a request whose dryRun is not an explicit boolean rather than defaulting to mutation", async () => {
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({}),
      transactions,
      storage: {
        get: async () => new Uint8Array(),
        delete: async () => undefined,
      },
      scanner: cleanScanner,
    });
    const malformed = job();
    delete (malformed.data as { dryRun?: boolean }).dryRun;
    await expect(handler.handle(malformed as never, context())).rejects.toThrow(
      /dryRun/,
    );
  });

  it("walks multiple batches by cursor until a short page ends the loop", async () => {
    const bytes = new Uint8Array([1]);
    const expectedSha256 = sha256(bytes);
    const loadBatch = vi
      .fn()
      .mockResolvedValueOnce([
        {
          cursor: "d1",
          id: "d1",
          tenantId,
          storageKey: "k1",
          contentType: "image/webp",
          expectedSha256,
        },
        {
          cursor: "d2",
          id: "d2",
          tenantId,
          storageKey: "k2",
          contentType: "image/webp",
          expectedSha256,
        },
      ])
      .mockResolvedValueOnce([
        {
          cursor: "d3",
          id: "d3",
          tenantId,
          storageKey: "k3",
          contentType: "image/webp",
          expectedSha256,
        },
      ]);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({ loadBatch }),
      transactions,
      storage: { get: async () => bytes, delete: async () => undefined },
      scanner: cleanScanner,
    });

    const result = await handler.handle(
      job({ batchSize: 2 }) as never,
      context(),
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { processed: 3, clean: 3 },
    });
    expect(loadBatch).toHaveBeenCalledTimes(2);
    expect(loadBatch.mock.calls[1]?.[1]).toBe("d2");
  });

  it("throws after completing the batch when a candidate fails, so the job is retried without silent data loss", async () => {
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "missing",
              contentType: "image/webp",
              expectedSha256: "a".repeat(64),
            },
          ])
          .mockResolvedValueOnce([]),
      }),
      transactions,
      storage: {
        get: async () => {
          throw new Error("object not found");
        },
        delete: async () => undefined,
      },
      scanner: cleanScanner,
    });

    await expect(handler.handle(job() as never, context())).rejects.toThrow(
      /1 failed candidate/,
    );
  });

  it("treats a scanner operational failure as a candidate failure, not a security verdict", async () => {
    const bytes = new Uint8Array([1]);
    const recordScanEvidence = vi.fn(async () => ({ updated: true }));
    const quarantine = vi.fn(async () => ({ updated: true }));
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: sha256(bytes),
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence,
        quarantine,
      }),
      transactions,
      storage: { get: async () => bytes, delete: async () => undefined },
      scanner: {
        scan: async () => {
          throw new Error("scanner unavailable");
        },
      },
    });

    await expect(handler.handle(job() as never, context())).rejects.toThrow(
      /1 failed candidate/,
    );
    expect(recordScanEvidence).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
  });

  it("propagates cancellation instead of counting it as a candidate failure", async () => {
    const controller = new AbortController();
    const recordScanEvidence = vi.fn(async () => ({ updated: true }));
    const quarantine = vi.fn(async () => ({ updated: true }));
    const bytes = new Uint8Array([1]);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({
        loadBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              cursor: "d1",
              id: "d1",
              tenantId,
              storageKey: "key",
              contentType: "image/webp",
              expectedSha256: sha256(bytes),
            },
          ])
          .mockResolvedValueOnce([]),
        recordScanEvidence,
        quarantine,
      }),
      transactions,
      storage: { get: async () => bytes, delete: async () => undefined },
      scanner: {
        scan: async () => {
          controller.abort(new Error("cancelled by caller"));
          return {
            status: "clean" as const,
            scanner: "fixture",
            scannedAt: new Date().toISOString(),
            durationMs: 1,
          };
        },
      },
    });

    await expect(
      handler.handle(job() as never, context(controller.signal)),
    ).rejects.toThrow("cancelled by caller");
    // Cancellation must win over any mutation the scan result would otherwise trigger.
    expect(recordScanEvidence).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
  });

  it("checks cancellation before starting the next batch", async () => {
    const controller = new AbortController();
    const loadBatch = vi.fn().mockResolvedValueOnce([]);
    const handler = createDerivativeScanBackfillHandler({
      repository: repo({ loadBatch }),
      transactions,
      storage: {
        get: async () => new Uint8Array(),
        delete: async () => undefined,
      },
      scanner: cleanScanner,
    });
    controller.abort(new Error("cancelled before start"));

    await expect(
      handler.handle(job() as never, context(controller.signal)),
    ).rejects.toThrow("cancelled before start");
    expect(loadBatch).not.toHaveBeenCalled();
  });

  it("derives a stable, per-tenant job id for resubmission", async () => {
    const enqueue = vi.fn(
      async (
        _queue: string,
        _name: string,
        _data: unknown,
        options?: { jobId?: string },
      ) => options?.jobId ?? "job",
    );
    await submitDerivativeScanBackfill(
      { enqueue },
      {
        planeKey: "neon",
        tenantId,
        principalId,
        requestId: "req-1",
        dryRun: false,
        batchSize: 100,
        concurrency: 4,
      },
    );
    expect(enqueue).toHaveBeenCalledWith(
      DERIVATIVE_SCAN_BACKFILL_QUEUE,
      DERIVATIVE_SCAN_BACKFILL_JOB,
      expect.objectContaining({ tenantId }),
      expect.objectContaining({
        jobId: `derivative-scan-backfill-neon-${tenantId}-req-1`,
      }),
    );
  });
});
