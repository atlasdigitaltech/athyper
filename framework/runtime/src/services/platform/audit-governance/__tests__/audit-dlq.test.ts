/**
 * Audit DLQ Tests — DLQ Manager + Repo behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AuditDlqManager } from "../domain/AuditDlqManager.js";

import type { AuditHashChainService } from "../domain/hash-chain.service.js";
import type { AuditDlqEntry } from "../domain/models/AuditDlqEntry.js";
import type { AuditDlqRepo } from "../persistence/AuditDlqRepo.js";
import type {
  AuditOutboxRepo,
  AuditOutboxEntry,
} from "../persistence/AuditOutboxRepo.js";

function createMockDlqRepo(): AuditDlqRepo {
  return {
    create: vi.fn().mockResolvedValue({
      id: "dlq-1",
      tenantId: "t-1",
      outboxId: "outbox-1",
      eventType: "workflow.created",
      payload: {},
      lastError: "DB error",
      errorCategory: "persist_failure",
      attemptCount: 5,
      deadAt: new Date(),
      replayedAt: null,
      replayedBy: null,
      replayCount: 0,
      correlationId: null,
      createdAt: new Date(),
    } satisfies AuditDlqEntry),
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    markReplayed: vi.fn().mockResolvedValue(undefined),
    countUnreplayed: vi.fn().mockResolvedValue(0),
    countAllUnreplayed: vi.fn().mockResolvedValue(0),
  } as unknown as AuditDlqRepo;
}

function createMockOutboxRepo(): AuditOutboxRepo {
  return {
    enqueue: vi.fn().mockResolvedValue("new-outbox-id"),
  } as unknown as AuditOutboxRepo;
}

function createMockHashChain(): AuditHashChainService {
  return {
    resetTenant: vi.fn(),
  } as unknown as AuditHashChainService;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function createOutboxEntry(
  overrides: Partial<AuditOutboxEntry> = {},
): AuditOutboxEntry {
  return {
    id: "outbox-1",
    tenantId: "t-1",
    eventType: "workflow.created",
    payload: { instanceId: "inst-1", entity: { type: "PO", id: "po-1" } },
    status: "dead",
    attempts: 5,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: "DB error",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("AuditDlqManager", () => {
  let dlqRepo: ReturnType<typeof createMockDlqRepo>;
  let outboxRepo: ReturnType<typeof createMockOutboxRepo>;
  let hashChain: ReturnType<typeof createMockHashChain>;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: AuditDlqManager;

  beforeEach(() => {
    dlqRepo = createMockDlqRepo();
    outboxRepo = createMockOutboxRepo();
    hashChain = createMockHashChain();
    logger = createMockLogger();
    manager = new AuditDlqManager(dlqRepo, outboxRepo, hashChain, logger);
  });

  describe("moveToDlq", () => {
    it("should create a DLQ entry from outbox entry", async () => {
      const entry = createOutboxEntry();
      const result = await manager.moveToDlq(
        entry,
        "DB error",
        "persist_failure",
      );

      expect(dlqRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          outboxId: "outbox-1",
          eventType: "workflow.created",
          lastError: "DB error",
          errorCategory: "persist_failure",
          attemptCount: 5,
        }),
      );
      expect(result.id).toBe("dlq-1");
    });

    it("should extract correlation_id from payload", async () => {
      const entry = createOutboxEntry({
        payload: { instanceId: "inst-1", correlation_id: "corr-123" },
      });
      await manager.moveToDlq(entry, "error");

      expect(dlqRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: "corr-123",
        }),
      );
    });

    it("should log the DLQ move", async () => {
      const entry = createOutboxEntry();
      await manager.moveToDlq(entry, "error");

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ dlqId: "dlq-1", outboxId: "outbox-1" }),
        "[audit:dlq] Outbox entry moved to DLQ",
      );
    });
  });

  describe("retry", () => {
    it("should re-enqueue to outbox and mark as replayed", async () => {
      const dlqEntry: AuditDlqEntry = {
        id: "dlq-1",
        tenantId: "t-1",
        outboxId: "outbox-1",
        eventType: "workflow.created",
        payload: { instanceId: "inst-1" },
        lastError: "error",
        errorCategory: null,
        attemptCount: 5,
        deadAt: new Date(),
        replayedAt: null,
        replayedBy: null,
        replayCount: 0,
        correlationId: null,
        createdAt: new Date(),
      };
      (dlqRepo.getById as any).mockResolvedValue(dlqEntry);

      const result = await manager.retry("t-1", "dlq-1", "admin@test.com");

      expect(result).toBe(true);
      expect(outboxRepo.enqueue).toHaveBeenCalledWith(
        "t-1",
        "workflow.created",
        { instanceId: "inst-1" },
      );
      expect(dlqRepo.markReplayed).toHaveBeenCalledWith(
        "t-1",
        "dlq-1",
        "admin@test.com",
      );
    });

    it("should reset hash chain for tenant after replay", async () => {
      const dlqEntry: AuditDlqEntry = {
        id: "dlq-1",
        tenantId: "t-1",
        outboxId: "outbox-1",
        eventType: "workflow.created",
        payload: {},
        lastError: null,
        errorCategory: null,
        attemptCount: 3,
        deadAt: new Date(),
        replayedAt: null,
        replayedBy: null,
        replayCount: 0,
        correlationId: null,
        createdAt: new Date(),
      };
      (dlqRepo.getById as any).mockResolvedValue(dlqEntry);

      await manager.retry("t-1", "dlq-1", "admin");

      expect(hashChain.resetTenant).toHaveBeenCalledWith("t-1");
    });

    it("should return false if DLQ entry not found", async () => {
      (dlqRepo.getById as any).mockResolvedValue(undefined);

      const result = await manager.retry("t-1", "nonexistent", "admin");
      expect(result).toBe(false);
    });
  });

  describe("bulkReplay", () => {
    it("should replay all unreplayed entries up to limit", async () => {
      const entries: AuditDlqEntry[] = [
        {
          id: "dlq-1",
          tenantId: "t-1",
          outboxId: "ob-1",
          eventType: "workflow.created",
          payload: {},
          lastError: null,
          errorCategory: null,
          attemptCount: 3,
          deadAt: new Date(),
          replayedAt: null,
          replayedBy: null,
          replayCount: 0,
          correlationId: null,
          createdAt: new Date(),
        },
        {
          id: "dlq-2",
          tenantId: "t-1",
          outboxId: "ob-2",
          eventType: "workflow.started",
          payload: {},
          lastError: null,
          errorCategory: null,
          attemptCount: 5,
          deadAt: new Date(),
          replayedAt: null,
          replayedBy: null,
          replayCount: 0,
          correlationId: null,
          createdAt: new Date(),
        },
      ];
      (dlqRepo.list as any).mockResolvedValue(entries);
      (dlqRepo.getById as any)
        .mockResolvedValueOnce(entries[0])
        .mockResolvedValueOnce(entries[1]);

      const result = await manager.bulkReplay("t-1", "admin", 100);

      expect(result.replayed).toBe(2);
      expect(result.errors).toBe(0);
    });

    it("should count errors for failed replays", async () => {
      const entries: AuditDlqEntry[] = [
        {
          id: "dlq-1",
          tenantId: "t-1",
          outboxId: "ob-1",
          eventType: "wf.created",
          payload: {},
          lastError: null,
          errorCategory: null,
          attemptCount: 3,
          deadAt: new Date(),
          replayedAt: null,
          replayedBy: null,
          replayCount: 0,
          correlationId: null,
          createdAt: new Date(),
        },
      ];
      (dlqRepo.list as any).mockResolvedValue(entries);
      (dlqRepo.getById as any).mockResolvedValue(undefined); // entry not found on retry

      const result = await manager.bulkReplay("t-1", "admin");

      expect(result.replayed).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe("list", () => {
    it("should delegate to repo", async () => {
      await manager.list("t-1", { unreplayedOnly: true });
      expect(dlqRepo.list).toHaveBeenCalledWith("t-1", {
        unreplayedOnly: true,
      });
    });
  });

  describe("inspect", () => {
    it("should delegate to repo", async () => {
      await manager.inspect("t-1", "dlq-1");
      expect(dlqRepo.getById).toHaveBeenCalledWith("t-1", "dlq-1");
    });
  });

  describe("countUnreplayed", () => {
    it("should delegate to repo with tenant", async () => {
      await manager.countUnreplayed("t-1");
      expect(dlqRepo.countUnreplayed).toHaveBeenCalledWith("t-1");
    });

    it("should delegate to countAllUnreplayed without tenant", async () => {
      await manager.countUnreplayed();
      expect(dlqRepo.countAllUnreplayed).toHaveBeenCalled();
    });
  });
});
