import { describe, expect, it, vi } from "vitest";
import {
  createDocumentExtractionScheduler,
  createPendingExtractionRecoveryHandler,
  DOCUMENT_PROCESSING_QUEUE,
  EXTRACT_AND_INDEX_JOB,
  RECOVER_PENDING_EXTRACTION_JOB,
} from "../index.js";

const request = {
  planeKey: "neon" as const,
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  attachmentId: "33333333-3333-4333-8333-333333333333",
};

describe("extraction deadlines", () => {
  it.each([90_000, 240_000])(
    "uses the configured %s ms adapter budget on both enqueue paths",
    async (adapterTimeoutMs) => {
      const enqueue = vi.fn(async () => "job");
      const jobs = { enqueue };
      await createDocumentExtractionScheduler(jobs, adapterTimeoutMs).schedule(
        request,
      );
      const handler = createPendingExtractionRecoveryHandler({
        jobs,
        adapterTimeoutMs,
        repository: { listPending: async () => [request.attachmentId] },
        transactions: { run: async (_plane, _actor, work) => work({}) },
      });
      await handler.handle(
        {
          id: "recovery",
          queue: "documents.processing",
          name: RECOVER_PENDING_EXTRACTION_JOB,
          data: request,
          attempt: 1,
          maxAttempts: 1,
          enqueuedAt: "2026-09-11T00:00:00Z",
        },
        {
          signal: new AbortController().signal,
          attempt: 1,
          reportProgress: async () => undefined,
        },
      );
      expect(enqueue).toHaveBeenCalledTimes(2);
      for (const call of enqueue.mock.calls) {
        expect(call).toEqual([
          DOCUMENT_PROCESSING_QUEUE,
          EXTRACT_AND_INDEX_JOB,
          request,
          expect.objectContaining({
            timeoutMs: adapterTimeoutMs + 60_000,
            maxAttempts: 5,
          }),
        ]);
      }
    },
  );
});
