import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { JobHandler } from "@athyper/server-contract-jobs";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

describe("document extraction host wiring", () => {
  it.each([4, 5, 6])(
    "applies the configured four-byte extraction limit to a %s-byte document",
    async (size) => {
      const container = createContainer();
      const config = loadConfig();
      config.contentExtraction = {
        ...config.contentExtraction,
        maxInputBytes: 4,
      };
      registerPlatform(container, config, {
        auditSink: createInMemoryAuditSink(),
        tokenVerifier: {
          verify: async () => {
            throw new Error("Not used");
          },
        },
      });
      let handler: JobHandler | undefined;
      container.runtimes.jobs = {
        register: (_queue: string, name: string, value: JobHandler) => {
          if (name === "documents.extract-index") handler = value;
        },
        enqueue: vi.fn(async () => "job"),
      } as never;
      const bytes = new Uint8Array(size);
      const get = vi.fn(async () => bytes);
      const getStream = vi.fn(async () => Readable.from([bytes]));
      const extract = vi.fn(async () => ({
        text: "known text",
        metadata: {},
        provider: "tika",
        durationMs: 1,
      }));
      const markSkipped = vi.fn(async () => undefined);
      const saveExtracted = vi.fn(async () => undefined);
      const tenantId = "11111111-1111-4111-8111-111111111111";
      const principalId = "22222222-2222-4222-8222-222222222222";
      const attachmentId = "33333333-3333-4333-8333-333333333333";
      registerServices(
        container,
        {
          metadata: {
            getEntityDescriptor: async () => {
              throw new Error("Not used");
            },
          },
          contentExtractor: { extract },
          searchIndex: {
            upsert: async () => undefined,
            remove: async () => undefined,
            search: async () => ({ hits: [], total: 0, processingMs: 0 }),
          },
          objectStorageDocuments: {
            get,
            getStream,
            put: async () => undefined,
            delete: async () => undefined,
            exists: async () => true,
            createDownloadUrl: async () => "",
          },
          documentProcessingRepository: {
            load: async () => ({
              attachmentId,
              tenantId,
              fileName: "a.txt",
              contentType: "text/plain",
              sizeBytes: size === 6 ? 4 : size, // Six-byte case deliberately understates metadata.
              sha256: createHash("sha256").update(bytes).digest("hex"),
              storageKey: "a.txt",
              entityType: "invoice",
              entityId: attachmentId,
              extractionStatus: null,
              extractedText: null,
              piiTypes: [],
              updatedAt: "2026-09-11T00:00:00Z",
            }),
            markSkipped,
            saveExtracted,
            markFailed: async () => undefined,
          },
          transactions: {
            run: async (_plane, _actor, work) => work({}),
          },
          outbox: { append: async () => undefined },
        },
        config,
      );
      expect(handler).toBeDefined();
      const pending = handler!.handle(
        {
          id: "job",
          name: "documents.extract-index",
          queue: "documents.processing",
          data: { planeKey: "neon", tenantId, principalId, attachmentId },
          attempt: 1,
          maxAttempts: 5,
          enqueuedAt: "2026-09-11T00:00:00Z",
        },
        {
          signal: new AbortController().signal,
          attempt: 1,
          reportProgress: async () => undefined,
        },
      );
      if (size === 6) {
        await expect(pending).rejects.toThrow("exceeds extraction limit");
        expect(getStream).toHaveBeenCalledOnce();
        expect(get).not.toHaveBeenCalled();
        expect(extract).not.toHaveBeenCalled();
        return;
      }
      const result = await pending;
      expect(get).not.toHaveBeenCalled();
      if (size === 4) {
        expect(getStream).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ status: "completed" });
        expect(extract).toHaveBeenCalledOnce();
        expect(saveExtracted).toHaveBeenCalledOnce();
        expect(markSkipped).not.toHaveBeenCalled();
      } else {
        expect(result).toMatchObject({
          status: "discarded",
          reason: "size_limit",
        });
        expect(getStream).not.toHaveBeenCalled();
        expect(extract).not.toHaveBeenCalled();
        expect(markSkipped).toHaveBeenCalledOnce();
      }
    },
  );
});
