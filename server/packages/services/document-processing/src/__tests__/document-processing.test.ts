import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createDocumentProcessingHandler,
  classifyPii,
  EXTRACT_AND_INDEX_JOB,
} from "../index.js";
const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  attachment: "22222222-2222-4222-8222-222222222222",
  principal: "33333333-3333-4333-8333-333333333333",
  entity: "44444444-4444-4444-8444-444444444444",
};
describe("document processing", () => {
  it("extracts a clean attachment, persists PII labels, and indexes it", async () => {
    const bytes = new TextEncoder().encode("pdf");
    const saveExtracted = vi.fn();
    const upsert = vi.fn();
    const handler = createDocumentProcessingHandler({
      repository: {
        load: async () => candidate(bytes),
        saveExtracted,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
      },
      transactions: { run: async (_plane, _actor, work) => work({}) },
      storage: {
        getStream: async () => stream(bytes),
        get: async () => bytes,
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      extractor: {
        extract: async () => ({
          text: "Contact a@example.com",
          metadata: {},
          provider: "tika",
          durationMs: 3,
        }),
      },
      searchIndex: {
        upsert,
        remove: async () => undefined,
        search: async () => ({ hits: [], total: 0, processingMs: 0 }),
      },
    });
    await expect(handler.handle(job(), context())).resolves.toMatchObject({
      status: "completed",
    });
    expect(saveExtracted).toHaveBeenCalledWith(
      expect.objectContaining({ piiTypes: ["email"] }),
      {},
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planeKey: "neon",
        tenantId: ids.tenant,
        attachmentId: ids.attachment,
      }),
    );
  });
  it("rejects checksum drift before extraction", async () => {
    const handler = createDocumentProcessingHandler({
      repository: {
        load: async () => candidate(new Uint8Array([9])),
        saveExtracted: async () => undefined,
        markSkipped: async () => undefined,
        markFailed: async () => undefined,
      },
      transactions: { run: async (_plane, _actor, work) => work({}) },
      storage: {
        getStream: async () => stream(new Uint8Array([1])),
        get: async () => new Uint8Array([1]),
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      extractor: {
        extract: async () => {
          throw new Error("must not run");
        },
      },
      searchIndex: {
        upsert: async () => undefined,
        remove: async () => undefined,
        search: async () => ({ hits: [], total: 0, processingMs: 0 }),
      },
    });
    await expect(handler.handle(job(), context())).rejects.toThrow(
      "checksum mismatch",
    );
  });
  it("skips an attachment above a configured maxExtractBytes without ever downloading it", async () => {
    const get = vi.fn(async () => {
      throw new Error("must not be called");
    });
    const markSkipped = vi.fn();
    const remove = vi.fn();
    const handler = createDocumentProcessingHandler({
      repository: {
        load: async () => ({
          ...candidate(new Uint8Array([1])),
          sizeBytes: 2 * 1_024 * 1_024,
        }),
        saveExtracted: async () => undefined,
        markSkipped,
        markFailed: async () => undefined,
      },
      transactions: { run: async (_plane, _actor, work) => work({}) },
      storage: {
        get,
        put: async () => undefined,
        delete: async () => undefined,
        exists: async () => true,
        createDownloadUrl: async () => "",
        createUploadUrl: async () => "",
        copy: async () => undefined,
      },
      extractor: {
        extract: async () => {
          throw new Error("must not run");
        },
      },
      searchIndex: {
        upsert: async () => undefined,
        remove,
        search: async () => ({ hits: [], total: 0, processingMs: 0 }),
      },
      maxExtractBytes: 1_024 * 1_024,
    });
    await expect(handler.handle(job(), context())).resolves.toMatchObject({
      status: "discarded",
      reason: "size_limit",
    });
    expect(markSkipped).toHaveBeenCalledWith(
      ids.tenant,
      ids.attachment,
      ids.principal,
      "size_limit",
      {},
    );
    expect(get).not.toHaveBeenCalled();
  });
  it("classifies labels without retaining matched values", () =>
    expect(classifyPii("a@example.com 192.168.1.1")).toEqual([
      "email",
      "ip_address",
    ]));
});
function candidate(bytes: Uint8Array) {
  return {
    attachmentId: ids.attachment,
    tenantId: ids.tenant,
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storageKey: "generated/neon/x",
    entityType: "invoice",
    entityId: ids.entity,
    extractionStatus: null,
    extractedText: null,
    piiTypes: [],
    updatedAt: "2026-08-09T00:00:00Z",
  };
}
function job() {
  return {
    id: "job-1",
    name: EXTRACT_AND_INDEX_JOB as typeof EXTRACT_AND_INDEX_JOB,
    queue: "documents.processing",
    data: {
      planeKey: "neon" as const,
      tenantId: ids.tenant,
      attachmentId: ids.attachment,
      principalId: ids.principal,
    },
    attempt: 1,
    maxAttempts: 5,
    enqueuedAt: "2026-08-09T00:00:00Z",
  };
}
function context() {
  return {
    signal: new AbortController().signal,
    attempt: 1,
    reportProgress: async () => undefined,
  };
}

async function* stream(bytes: Uint8Array) {
  yield bytes;
}
