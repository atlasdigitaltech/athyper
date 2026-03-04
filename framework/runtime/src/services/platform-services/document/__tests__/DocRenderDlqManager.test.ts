/**
 * DocRenderDlqManager — unit tests.
 *
 * Covers: moveToDlq, list, inspect, retry, bulkReplay.
 * Uses inline mock repo and mock job queue (no cross-workspace imports).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  DocRenderDlqManager,
  type MoveToDlqInput,
} from "../domain/services/DocRenderDlqManager.js";

import type { DocRenderDlqEntry } from "../domain/models/DocRenderDlqEntry.js";
import type { OutputId, RenderJobId } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Inline mock helpers
// ---------------------------------------------------------------------------

function mockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as any;
}

function createMockDlqEntry(
  overrides?: Partial<DocRenderDlqEntry>,
): DocRenderDlqEntry {
  return {
    id: "dlq-1",
    tenantId: "tenant-1",
    outputId: "output-1" as OutputId,
    renderJobId: "job-1" as RenderJobId,
    errorCode: "RENDER_TIMEOUT",
    errorDetail: "timed out after 30s",
    errorCategory: "timeout",
    attemptCount: 3,
    payload: {
      templateCode: "invoice",
      entityName: "order",
      entityId: "ord-1",
    },
    replayedAt: null,
    replayedBy: null,
    replayCount: 0,
    deadAt: new Date("2025-01-01T10:00:00Z"),
    createdAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

function createMockRepo() {
  const store = new Map<string, DocRenderDlqEntry>();

  return {
    _store: store,

    create: vi.fn(async (input: any) => {
      const entry = createMockDlqEntry({
        id: `dlq-${Date.now()}`,
        tenantId: input.tenantId,
        outputId: input.outputId,
        renderJobId: input.renderJobId ?? null,
        errorCode: input.errorCode,
        errorDetail: input.errorDetail ?? null,
        errorCategory: input.errorCategory,
        attemptCount: input.attemptCount,
        payload: input.payload,
      });
      store.set(entry.id, entry);
      return entry;
    }),

    getById: vi.fn(async (tenantId: string, id: string) => {
      const entry = store.get(id);
      return entry && entry.tenantId === tenantId ? entry : undefined;
    }),

    list: vi.fn(async (tenantId: string, options?: any) => {
      let entries = [...store.values()].filter((e) => e.tenantId === tenantId);
      if (options?.unreplayedOnly) {
        entries = entries.filter((e) => e.replayedAt === null);
      }
      return entries.slice(0, options?.limit ?? 100);
    }),

    markReplayed: vi.fn(
      async (tenantId: string, id: string, replayedBy: string) => {
        const entry = store.get(id);
        if (entry && entry.tenantId === tenantId) {
          entry.replayedAt = new Date();
          entry.replayedBy = replayedBy;
          entry.replayCount += 1;
        }
      },
    ),
  };
}

function createMockJobQueue() {
  return {
    add: vi.fn(async () => ({ id: "new-job-id" })),
    getJob: vi.fn(),
    remove: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DocRenderDlqManager", () => {
  let repo: ReturnType<typeof createMockRepo>;
  let jobQueue: ReturnType<typeof createMockJobQueue>;
  let logger: ReturnType<typeof mockLogger>;
  let manager: DocRenderDlqManager;

  beforeEach(() => {
    repo = createMockRepo();
    jobQueue = createMockJobQueue();
    logger = mockLogger();
    manager = new DocRenderDlqManager(repo as any, jobQueue as any, logger);
  });

  // -----------------------------------------------------------------------
  // moveToDlq
  // -----------------------------------------------------------------------

  describe("moveToDlq", () => {
    it("should create a DLQ entry and log it", async () => {
      const input: MoveToDlqInput = {
        tenantId: "tenant-1",
        outputId: "output-1" as OutputId,
        renderJobId: "job-1" as RenderJobId,
        errorCode: "RENDER_TIMEOUT",
        errorDetail: "timed out",
        errorCategory: "timeout",
        attemptCount: 3,
        payload: { foo: "bar" },
      };

      const entry = await manager.moveToDlq(input);

      expect(repo.create).toHaveBeenCalledOnce();
      expect(entry.tenantId).toBe("tenant-1");
      expect(entry.outputId).toBe("output-1");
      expect(entry.errorCode).toBe("RENDER_TIMEOUT");
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ dlqId: entry.id, outputId: "output-1" }),
        expect.stringContaining("moved to DLQ"),
      );
    });

    it("should store the full payload for later replay", async () => {
      const payload = {
        templateCode: "receipt",
        entityName: "payment",
        entityId: "pay-123",
      };
      const input: MoveToDlqInput = {
        tenantId: "tenant-1",
        outputId: "output-2" as OutputId,
        errorCode: "CHROMIUM_CRASH",
        errorCategory: "crash",
        attemptCount: 1,
        payload,
      };

      const entry = await manager.moveToDlq(input);

      expect(entry.payload).toEqual(payload);
    });
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe("list", () => {
    it("should delegate to repo.list", async () => {
      await manager.list("tenant-1", { unreplayedOnly: true, limit: 50 });

      expect(repo.list).toHaveBeenCalledWith("tenant-1", {
        unreplayedOnly: true,
        limit: 50,
      });
    });

    it("should return only entries for the given tenant", async () => {
      repo._store.set(
        "dlq-a",
        createMockDlqEntry({ id: "dlq-a", tenantId: "tenant-1" }),
      );
      repo._store.set(
        "dlq-b",
        createMockDlqEntry({ id: "dlq-b", tenantId: "tenant-2" }),
      );

      const results = await manager.list("tenant-1");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("dlq-a");
    });
  });

  // -----------------------------------------------------------------------
  // inspect
  // -----------------------------------------------------------------------

  describe("inspect", () => {
    it("should return entry if found", async () => {
      repo._store.set(
        "dlq-x",
        createMockDlqEntry({ id: "dlq-x", tenantId: "tenant-1" }),
      );

      const entry = await manager.inspect("tenant-1", "dlq-x");
      expect(entry).toBeDefined();
      expect(entry!.id).toBe("dlq-x");
    });

    it("should return undefined if not found", async () => {
      const entry = await manager.inspect("tenant-1", "nonexistent");
      expect(entry).toBeUndefined();
    });

    it("should not return entry from another tenant", async () => {
      repo._store.set(
        "dlq-y",
        createMockDlqEntry({ id: "dlq-y", tenantId: "tenant-2" }),
      );

      const entry = await manager.inspect("tenant-1", "dlq-y");
      expect(entry).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // retry
  // -----------------------------------------------------------------------

  describe("retry", () => {
    it("should re-enqueue the render job and mark as replayed", async () => {
      const dlqEntry = createMockDlqEntry({
        id: "dlq-retry",
        tenantId: "tenant-1",
        payload: {
          templateCode: "invoice",
          entityName: "order",
          entityId: "ord-5",
        },
      });
      repo._store.set("dlq-retry", dlqEntry);

      const ok = await manager.retry("tenant-1", "dlq-retry", "admin-user");

      expect(ok).toBe(true);
      expect(jobQueue.add).toHaveBeenCalledOnce();
      expect(jobQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "render-document",
          payload: dlqEntry.payload,
        }),
        expect.objectContaining({
          priority: "normal",
          attempts: 3,
        }),
      );
      expect(repo.markReplayed).toHaveBeenCalledWith(
        "tenant-1",
        "dlq-retry",
        "admin-user",
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ dlqId: "dlq-retry" }),
        expect.stringContaining("replayed"),
      );
    });

    it("should return false when entry not found", async () => {
      const ok = await manager.retry("tenant-1", "nonexistent", "admin");
      expect(ok).toBe(false);
      expect(jobQueue.add).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // bulkReplay
  // -----------------------------------------------------------------------

  describe("bulkReplay", () => {
    it("should replay all unreplayed entries up to limit", async () => {
      repo._store.set(
        "dlq-1",
        createMockDlqEntry({ id: "dlq-1", tenantId: "tenant-1" }),
      );
      repo._store.set(
        "dlq-2",
        createMockDlqEntry({ id: "dlq-2", tenantId: "tenant-1" }),
      );
      repo._store.set(
        "dlq-3",
        createMockDlqEntry({ id: "dlq-3", tenantId: "tenant-1" }),
      );

      const result = await manager.bulkReplay("tenant-1", "admin", 10);

      expect(result.replayed).toBe(3);
      expect(result.errors).toBe(0);
      expect(jobQueue.add).toHaveBeenCalledTimes(3);
    });

    it("should count errors when retry fails", async () => {
      repo._store.set(
        "dlq-fail",
        createMockDlqEntry({ id: "dlq-fail", tenantId: "tenant-1" }),
      );
      // Make jobQueue.add throw on first call
      jobQueue.add.mockRejectedValueOnce(new Error("Queue unavailable"));

      const result = await manager.bulkReplay("tenant-1", "admin");

      expect(result.errors).toBe(1);
      expect(result.replayed).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should log summary after bulk replay", async () => {
      repo._store.set(
        "dlq-b1",
        createMockDlqEntry({ id: "dlq-b1", tenantId: "tenant-1" }),
      );

      await manager.bulkReplay("tenant-1", "admin");

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          replayed: expect.any(Number),
        }),
        expect.stringContaining("Bulk replay complete"),
      );
    });

    it("should return zero when no unreplayed entries exist", async () => {
      const result = await manager.bulkReplay("tenant-1", "admin");

      expect(result.replayed).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});
