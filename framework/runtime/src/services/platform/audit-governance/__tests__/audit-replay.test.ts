/**
 * Audit Replay + Daily Backup — Test Suite
 *
 * Tests for the AuditReplayService: NDJSON replay, DLQ replay,
 * deduplication, hash chain rebuild, and daily backup worker.
 */

import { describe, it, expect, vi } from "vitest";

import { AuditReplayService } from "../domain/audit-replay.service.js";
import { createAuditDailyBackupHandler } from "../jobs/workers/auditDailyBackup.worker.js";

import type { ReplayObjectStorage } from "../domain/audit-replay.service.js";
import type { AuditHashChainService } from "../domain/hash-chain.service.js";
import type { AuditDlqEntry } from "../domain/models/AuditDlqEntry.js";
import type { AuditDlqRepo } from "../persistence/AuditDlqRepo.js";

// ============================================================================
// Mock helpers
// ============================================================================

function createKyselyMockDb(executeImpl: (...args: any[]) => Promise<any>) {
  const mockExecutor = {
    transformQuery: (node: any) => node,
    compileQuery: () => ({ sql: "", parameters: [] }),
    executeQuery: executeImpl,
    withConnectionProvider: function() { return this; },
    withPlugin: function() { return this; },
    withPluginAtFront: function() { return this; },
    withoutPlugins: function() { return this; },
  };

  return {
    getExecutor: () => mockExecutor,
  } as any;
}

function createMockObjectStorage(files: Record<string, string>): ReplayObjectStorage {
  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      const content = files[key];
      if (content === undefined) return null;
      return { body: content };
    }),
  };
}

function createMockDlqRepo(entries: Partial<AuditDlqEntry>[] = []): AuditDlqRepo {
  const markedReplayed: string[] = [];

  return {
    list: vi.fn().mockResolvedValue(
      entries.map((e) => ({
        id: e.id ?? crypto.randomUUID(),
        tenantId: e.tenantId ?? "t1",
        outboxId: e.outboxId ?? "outbox-1",
        eventType: e.eventType ?? "workflow.started",
        payload: e.payload ?? { eventType: "workflow.started" },
        lastError: e.lastError ?? null,
        errorCategory: e.errorCategory ?? null,
        attemptCount: e.attemptCount ?? 3,
        deadAt: e.deadAt ?? new Date(),
        replayedAt: null,
        replayedBy: null,
        replayCount: 0,
        correlationId: e.correlationId ?? null,
        createdAt: e.createdAt ?? new Date(),
      })),
    ),
    markReplayed: vi.fn().mockImplementation(async (_t: string, id: string) => {
      markedReplayed.push(id);
    }),
    countUnreplayed: vi.fn().mockResolvedValue(entries.length),
    countAllUnreplayed: vi.fn().mockResolvedValue(entries.length),
    __markedReplayed: markedReplayed,
  } as unknown as AuditDlqRepo & { __markedReplayed: string[] };
}

function createMockHashChain() {
  return {
    resetTenant: vi.fn(),
    initFromDb: vi.fn().mockResolvedValue(undefined),
    computeHash: vi.fn().mockResolvedValue({ hash_prev: "prev", hash_curr: "curr" }),
    verifyChain: vi.fn().mockReturnValue({ valid: true, eventsChecked: 0, message: "OK" }),
    writeAnchor: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditHashChainService;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// ============================================================================
// AuditReplayService — NDJSON replay
// ============================================================================

describe("AuditReplayService", () => {
  const TENANT = "00000000-0000-0000-0000-000000000001";

  describe("replayFromNdjson", () => {
    it("should throw if object storage is not available", async () => {
      const hashChain = createMockHashChain();
      const service = new AuditReplayService({} as any, hashChain, null, null);

      await expect(
        service.replayFromNdjson({
          tenantId: TENANT,
          ndjsonKey: "test.ndjson",
          replayedBy: "admin",
        }),
      ).rejects.toThrow("Object storage not available");
    });

    it("should throw if NDJSON file is not found", async () => {
      const hashChain = createMockHashChain();
      const objectStorage = createMockObjectStorage({});
      const db = createKyselyMockDb(async () => ({ rows: [] }));
      const service = new AuditReplayService(db, hashChain, null, objectStorage);

      await expect(
        service.replayFromNdjson({
          tenantId: TENANT,
          ndjsonKey: "nonexistent.ndjson",
          replayedBy: "admin",
        }),
      ).rejects.toThrow("NDJSON file not found");
    });

    it("should handle empty NDJSON (0 events)", async () => {
      const hashChain = createMockHashChain();
      const objectStorage = createMockObjectStorage({ "empty.ndjson": "" });
      const db = createKyselyMockDb(async () => ({ rows: [], numAffectedRows: 0n }));
      const service = new AuditReplayService(db, hashChain, null, objectStorage);

      const result = await service.replayFromNdjson({
        tenantId: TENANT,
        ndjsonKey: "empty.ndjson",
        replayedBy: "admin",
      });

      expect(result.total).toBe(0);
      expect(result.inserted).toBe(0);
      expect(result.duplicates).toBe(0);
    });

    it("should report progress via callback", async () => {
      const ndjson = [
        '{"id":"evt-1","event_type":"workflow.started","event_timestamp":"2025-01-01T00:00:00Z"}',
        '{"id":"evt-2","event_type":"workflow.approved","event_timestamp":"2025-01-01T01:00:00Z"}',
      ].join("\n");

      const hashChain = createMockHashChain();
      const objectStorage = createMockObjectStorage({ "test.ndjson": ndjson });
      const db = createKyselyMockDb(async () => ({ rows: [], numAffectedRows: 1n }));
      const service = new AuditReplayService(db, hashChain, null, objectStorage);

      const progressCalls: any[] = [];
      const result = await service.replayFromNdjson({
        tenantId: TENANT,
        ndjsonKey: "test.ndjson",
        replayedBy: "admin",
        batchSize: 10,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      expect(result.total).toBe(2);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1].processed).toBe(2);
    });

    it("should rebuild hash chain after replay", async () => {
      const ndjson = '{"id":"evt-1","event_type":"workflow.started","event_timestamp":"2025-01-01T00:00:00Z"}\n';
      const hashChain = createMockHashChain();
      const objectStorage = createMockObjectStorage({ "test.ndjson": ndjson });
      const db = createKyselyMockDb(async () => ({ rows: [], numAffectedRows: 1n }));
      const service = new AuditReplayService(db, hashChain, null, objectStorage);

      await service.replayFromNdjson({
        tenantId: TENANT,
        ndjsonKey: "test.ndjson",
        replayedBy: "admin",
      });

      expect(hashChain.resetTenant).toHaveBeenCalledWith(TENANT);
      expect(hashChain.initFromDb).toHaveBeenCalledWith(db, TENANT);
    });
  });

  // ============================================================================
  // DLQ replay
  // ============================================================================

  describe("replayFromDlq", () => {
    it("should throw if DLQ repo is not available", async () => {
      const hashChain = createMockHashChain();
      const service = new AuditReplayService({} as any, hashChain, null, null);

      await expect(
        service.replayFromDlq({
          tenantId: TENANT,
          replayedBy: "admin",
        }),
      ).rejects.toThrow("DLQ repository not available");
    });

    it("should mark DLQ entries as replayed", async () => {
      const dlqEntries = [
        {
          id: "dlq-1",
          eventType: "workflow.started",
          payload: { event_type: "workflow.started", event_timestamp: "2025-01-01T00:00:00Z" },
        },
        {
          id: "dlq-2",
          eventType: "workflow.approved",
          payload: { event_type: "workflow.approved", event_timestamp: "2025-01-01T01:00:00Z" },
        },
      ];

      const dlqRepo = createMockDlqRepo(dlqEntries);
      const hashChain = createMockHashChain();
      const db = createKyselyMockDb(async () => ({ rows: [], numAffectedRows: 1n }));
      const service = new AuditReplayService(db, hashChain, dlqRepo, null);

      const result = await service.replayFromDlq({
        tenantId: TENANT,
        replayedBy: "admin",
      });

      expect(result.total).toBe(2);
      expect(dlqRepo.markReplayed).toHaveBeenCalledTimes(2);
    });

    it("should rebuild hash chain after DLQ replay with inserts", async () => {
      const dlqEntries = [
        {
          id: "dlq-1",
          payload: { event_type: "workflow.started", event_timestamp: "2025-01-01T00:00:00Z" },
        },
      ];

      const dlqRepo = createMockDlqRepo(dlqEntries);
      const hashChain = createMockHashChain();
      const db = createKyselyMockDb(async () => ({ rows: [], numAffectedRows: 1n }));
      const service = new AuditReplayService(db, hashChain, dlqRepo, null);

      await service.replayFromDlq({
        tenantId: TENANT,
        replayedBy: "admin",
      });

      expect(hashChain.resetTenant).toHaveBeenCalledWith(TENANT);
      expect(hashChain.initFromDb).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Daily Backup Worker
// ============================================================================

describe("auditDailyBackup.worker", () => {
  it("should export and write anchor for each tenant", async () => {
    const logger = createMockLogger();
    const hashChain = createMockHashChain();

    const exportService = {
      export: vi.fn().mockResolvedValue({ manifest: {}, ndjsonKey: "key", manifestKey: "mkey" }),
    } as any;

    const db = createKyselyMockDb(async () => ({
      rows: [{ tenant_id: "00000000-0000-0000-0000-000000000001" }],
    }));

    const handler = createAuditDailyBackupHandler(db, exportService, hashChain, logger as any);

    const result = await handler({});

    expect(result.tenantsProcessed).toBe(1);
    expect(result.tenantsSucceeded).toBe(1);
    expect(result.tenantsFailed).toBe(0);
    expect(exportService.export).toHaveBeenCalledTimes(1);
    expect(hashChain.writeAnchor).toHaveBeenCalledTimes(1);
  });

  it("should handle per-tenant errors without affecting others", async () => {
    const logger = createMockLogger();
    const hashChain = createMockHashChain();

    let callCount = 0;
    const exportService = {
      export: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("Export failed");
        return { manifest: {}, ndjsonKey: "key", manifestKey: "mkey" };
      }),
    } as any;

    const db = createKyselyMockDb(async () => ({
      rows: [
        { tenant_id: "00000000-0000-0000-0000-000000000001" },
        { tenant_id: "00000000-0000-0000-0000-000000000002" },
      ],
    }));

    const handler = createAuditDailyBackupHandler(db, exportService, hashChain, logger as any);

    const result = await handler({});

    expect(result.tenantsProcessed).toBe(2);
    expect(result.tenantsSucceeded).toBe(1);
    expect(result.tenantsFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Export failed");
  });

  it("should backup specific tenant when tenantId provided", async () => {
    const logger = createMockLogger();
    const hashChain = createMockHashChain();

    const exportService = {
      export: vi.fn().mockResolvedValue({ manifest: {}, ndjsonKey: "k", manifestKey: "m" }),
    } as any;

    const db = {} as any; // Not used when tenantId is provided

    const handler = createAuditDailyBackupHandler(db, exportService, hashChain, logger as any);

    const result = await handler({
      tenantId: "00000000-0000-0000-0000-000000000099",
    });

    expect(result.tenantsProcessed).toBe(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "00000000-0000-0000-0000-000000000099",
      }),
    );
  });
});
