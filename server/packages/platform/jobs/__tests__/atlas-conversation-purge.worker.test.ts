import { describe, expect, it, vi } from "vitest";
import {
  processAtlasConversationPurge,
  type AtlasConversationPurgeService,
} from "../workers/atlas-conversation-purge.worker.js";

function makeService() {
  return {
    purgeEligible: vi.fn(() =>
      Promise.resolve({ expiredCount: 3, purgedCount: 2 }),
    ),
  } satisfies AtlasConversationPurgeService;
}

describe("Atlas conversation purge worker", () => {
  it("invokes the maintenance primitive with configured batch size only", async () => {
    const service = makeService();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const metrics = { observe: vi.fn() };

    await expect(processAtlasConversationPurge(
      {
        id: "job-1",
        name: "atlas-conversation-purge",
        data: {},
      } as never,
      service,
      500,
      logger,
      metrics,
    )).resolves.toEqual({ expiredCount: 3, purgedCount: 2 });

    expect(service.purgeEligible).toHaveBeenCalledWith({ batchSize: 500 });
    expect(logger.info).toHaveBeenCalledWith(
      "atlas_conversation_purge_completed",
      expect.objectContaining({
        jobId: "job-1",
        expiredCount: 3,
        purgedCount: 2,
      }),
    );
    expect(metrics.observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "completed",
      expiredCount: 3,
      purgedCount: 2,
    }));
  });

  it("emits a bounded failure signal for purge alerting", async () => {
    const failure = new Error("maintenance unavailable");
    const service = {
      purgeEligible: vi.fn(() => Promise.reject(failure)),
    } satisfies AtlasConversationPurgeService;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const metrics = { observe: vi.fn() };

    await expect(processAtlasConversationPurge(
      { id: "job-failed", name: "atlas-conversation-purge", data: {} } as never,
      service,
      500,
      logger,
      metrics,
    )).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith(
      "atlas_conversation_purge_failed",
      expect.objectContaining({ errorType: "Error" }),
    );
    expect(metrics.observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "failed",
      expiredCount: 0,
      purgedCount: 0,
    }));
  });

  it("rejects tenant, principal, plane, and thread selectors in payload", async () => {
    const service = makeService();

    await expect(processAtlasConversationPurge(
      {
        id: "job-2",
        name: "atlas-conversation-purge",
        data: {
          tenantId: "00000000-0000-0000-0000-000000000001",
          principalId: "00000000-0000-0000-0000-000000000002",
          plane: "neon",
          threadId: "00000000-0000-0000-0000-000000000003",
        },
      } as never,
      service,
      500,
    )).rejects.toThrow("payload must be empty");

    expect(service.purgeEligible).not.toHaveBeenCalled();
  });

  it("rejects unexpected job names and invalid batch sizes", async () => {
    const service = makeService();

    await expect(processAtlasConversationPurge(
      { id: "job-3", name: "sweep", data: {} } as never,
      service,
      500,
    )).rejects.toThrow("Unsupported Atlas conversation maintenance job");

    await expect(processAtlasConversationPurge(
      {
        id: "job-4",
        name: "atlas-conversation-purge",
        data: {},
      } as never,
      service,
      0,
    )).rejects.toThrow("batch size must be a positive integer");
  });
});
