/**
 * Outbox Drain Worker Tests
 */
import { describe, it, expect, vi } from "vitest";

import { createDrainAuditOutboxHandler } from "../jobs/workers/drainAuditOutbox.worker.js";

import type { AuditOutboxRepo, AuditOutboxEntry } from "../persistence/AuditOutboxRepo.js";
import type { WorkflowAuditRepository } from "../persistence/WorkflowAuditRepository.js";
import type { Job } from "@athyper/core";

function createMockOutboxRepo(batch: AuditOutboxEntry[] = []): AuditOutboxRepo {
  return {
    pick: vi.fn().mockResolvedValue(batch),
    markPersisted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markDead: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue("id"),
    countPending: vi.fn().mockResolvedValue(0),
    countDead: vi.fn().mockResolvedValue(0),
    cleanup: vi.fn().mockResolvedValue(0),
  } as unknown as AuditOutboxRepo;
}

function createMockAuditRepo(shouldFail = false): WorkflowAuditRepository {
  return {
    recordEvent: shouldFail
      ? vi.fn().mockRejectedValue(new Error("DB write failed"))
      : vi.fn().mockResolvedValue({ id: "persisted-id" }),
  } as unknown as WorkflowAuditRepository;
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;
}

function makeOutboxEntry(overrides: Partial<AuditOutboxEntry> = {}): AuditOutboxEntry {
  return {
    id: "outbox-1",
    tenantId: "t-1",
    eventType: "workflow.created",
    payload: {
      instanceId: "inst-1",
      entity: { type: "PO", id: "po-1" },
      workflow: { templateId: "t1", templateCode: "WF1", templateVersion: 1, templateName: "Test" },
      actor: { userId: "u-1" },
      timestamp: new Date().toISOString(),
    },
    status: "processing",
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "drain-worker",
    lastError: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeJob(payload: any = {}): Job<any> {
  return {
    id: "job-1",
    data: { type: "drain-audit-outbox", payload },
    status: "active",
    attempts: 1,
    maxAttempts: 3,
    priority: 0,
    createdAt: new Date(),
  } as Job<any>;
}

describe("drainAuditOutbox worker", () => {
  it("should process a batch successfully", async () => {
    const batch = [
      makeOutboxEntry({ id: "o-1" }),
      makeOutboxEntry({ id: "o-2" }),
    ];
    const outboxRepo = createMockOutboxRepo(batch);
    const auditRepo = createMockAuditRepo();
    const logger = createMockLogger();

    const handler = createDrainAuditOutboxHandler(outboxRepo, auditRepo, logger);
    await handler(makeJob());

    expect(outboxRepo.pick).toHaveBeenCalledTimes(1);
    expect(auditRepo.recordEvent).toHaveBeenCalledTimes(2);
    expect(outboxRepo.markPersisted).toHaveBeenCalledWith(["o-1", "o-2"]);
  });

  it("should do nothing for empty batch", async () => {
    const outboxRepo = createMockOutboxRepo([]);
    const auditRepo = createMockAuditRepo();
    const logger = createMockLogger();

    const handler = createDrainAuditOutboxHandler(outboxRepo, auditRepo, logger);
    await handler(makeJob());

    expect(auditRepo.recordEvent).not.toHaveBeenCalled();
    expect(outboxRepo.markPersisted).not.toHaveBeenCalled();
  });

  it("should mark failed items individually", async () => {
    const batch = [
      makeOutboxEntry({ id: "o-1" }),
      makeOutboxEntry({ id: "o-2" }),
      makeOutboxEntry({ id: "o-3" }),
    ];
    const outboxRepo = createMockOutboxRepo(batch);

    // Make recordEvent fail for second item
    let callCount = 0;
    const auditRepo = {
      recordEvent: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error("DB write failed");
        return { id: "persisted" };
      }),
    } as unknown as WorkflowAuditRepository;
    const logger = createMockLogger();

    const handler = createDrainAuditOutboxHandler(outboxRepo, auditRepo, logger);
    await handler(makeJob());

    // 2 succeeded, 1 failed
    expect(outboxRepo.markPersisted).toHaveBeenCalledWith(["o-1", "o-3"]);
    expect(outboxRepo.markFailed).toHaveBeenCalledWith("o-2", "DB write failed");
  });

  it("should throw when all items fail", async () => {
    const batch = [makeOutboxEntry({ id: "o-1" })];
    const outboxRepo = createMockOutboxRepo(batch);
    const auditRepo = createMockAuditRepo(true); // All fail
    const logger = createMockLogger();

    const handler = createDrainAuditOutboxHandler(outboxRepo, auditRepo, logger);
    await expect(handler(makeJob())).rejects.toThrow("All 1 outbox items failed");
  });

  it("should respect custom batch size", async () => {
    const outboxRepo = createMockOutboxRepo([]);
    const auditRepo = createMockAuditRepo();
    const logger = createMockLogger();

    const handler = createDrainAuditOutboxHandler(outboxRepo, auditRepo, logger);
    await handler(makeJob({ batchSize: 100 }));

    expect(outboxRepo.pick).toHaveBeenCalledWith(100, expect.any(String));
  });
});
