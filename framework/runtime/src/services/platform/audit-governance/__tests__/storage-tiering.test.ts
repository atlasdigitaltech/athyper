/**
 * Storage Tiering — Test Suite
 *
 * Tests for AuditStorageTieringService, AuditArchiveMarkerRepo,
 * and the archive worker.
 */

import { describe, it, expect, vi } from "vitest";

import { AuditStorageTieringService } from "../domain/audit-storage-tiering.service.js";
import { createAuditArchiveHandler } from "../jobs/workers/auditArchive.worker.js";

import type {
  AuditArchiveMarkerRepo,
  AuditArchiveMarker,
} from "../persistence/AuditArchiveMarkerRepo.js";

// ============================================================================
// Helpers
// ============================================================================

/** Create a date N days ago, at the first of that month */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function createKyselyMockDb(executeImpl: (...args: any[]) => Promise<any>) {
  const mockExecutor = {
    transformQuery: (node: any) => node,
    compileQuery: () => ({ sql: "", parameters: [] }),
    executeQuery: executeImpl,
    withConnectionProvider: function () {
      return this;
    },
    withPlugin: function () {
      return this;
    },
    withPluginAtFront: function () {
      return this;
    },
    withoutPlugins: function () {
      return this;
    },
  };

  return {
    getExecutor: () => mockExecutor,
  } as any;
}

function createMockArchiveMarkerRepo(
  existing: Partial<AuditArchiveMarker>[] = [],
): AuditArchiveMarkerRepo & { __created: any[] } {
  const created: any[] = [];

  return {
    create: vi.fn().mockImplementation(async (input: any) => {
      const marker = {
        id: crypto.randomUUID(),
        ...input,
        detachedAt: null,
        createdAt: new Date(),
      };
      created.push(marker);
      return marker;
    }),
    getByMonth: vi.fn().mockImplementation(async (month: Date) => {
      return (
        existing.find((m) => {
          if (!m.partitionMonth) return false;
          // Compare year + month only
          return (
            m.partitionMonth.getFullYear() === month.getFullYear() &&
            m.partitionMonth.getMonth() === month.getMonth()
          );
        }) ?? undefined
      );
    }),
    isMonthArchived: vi.fn().mockImplementation(async (month: Date) => {
      return existing.some((m) => {
        if (!m.partitionMonth) return false;
        return (
          m.partitionMonth.getFullYear() === month.getFullYear() &&
          m.partitionMonth.getMonth() === month.getMonth()
        );
      });
    }),
    listArchived: vi.fn().mockResolvedValue(existing),
    getArchivedMonthsInRange: vi
      .fn()
      .mockImplementation(async (start: Date, end: Date) => {
        return existing.filter(
          (m) =>
            m.partitionMonth &&
            m.partitionMonth >= start &&
            m.partitionMonth <= end,
        );
      }),
    markDetached: vi.fn().mockResolvedValue(undefined),
    __created: created,
  } as unknown as AuditArchiveMarkerRepo & { __created: any[] };
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
// AuditStorageTieringService
// ============================================================================

describe("AuditStorageTieringService", () => {
  const DEFAULT_CONFIG = { warmAfterDays: 90, coldAfterDays: 365 };

  describe("getTargetTier", () => {
    it("should classify recent months as hot", () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      expect(service.getTargetTier(thisMonth)).toBe("hot");
    });

    it("should classify 30-day-old months as hot", () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);
      expect(service.getTargetTier(daysAgo(30))).toBe("hot");
    });

    it("should classify 120-day-old months as warm", () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);
      expect(service.getTargetTier(daysAgo(120))).toBe("warm");
    });

    it("should classify 400-day-old months as cold", () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);
      expect(service.getTargetTier(daysAgo(400))).toBe("cold");
    });

    it("should respect custom tier boundaries", () => {
      const service = new AuditStorageTieringService(null, {
        warmAfterDays: 30,
        coldAfterDays: 60,
      });

      // Use explicit dates instead of daysAgo to avoid month-boundary edge cases
      const now = new Date();
      const day10ago = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const day45ago = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const day75ago = new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000);

      expect(service.getTargetTier(day10ago)).toBe("hot");
      expect(service.getTargetTier(day45ago)).toBe("warm");
      expect(service.getTargetTier(day75ago)).toBe("cold");
    });
  });

  describe("assessPartitions", () => {
    it("should assign tiers and check archive status", async () => {
      const coldMonth = daysAgo(400);
      const existingMarker: Partial<AuditArchiveMarker> = {
        partitionMonth: coldMonth,
      };

      const repo = createMockArchiveMarkerRepo([existingMarker]);
      const service = new AuditStorageTieringService(repo, DEFAULT_CONFIG);

      const partitions = [
        { name: "wae_2025_01", month: daysAgo(30) },
        { name: "wae_2024_06", month: coldMonth },
      ];

      const assignments = await service.assessPartitions(partitions);

      expect(assignments).toHaveLength(2);
      expect(assignments[0].tier).toBe("hot");
      expect(assignments[0].isArchived).toBe(false);
      expect(assignments[1].tier).toBe("cold");
      expect(assignments[1].isArchived).toBe(true);
    });

    it("should work without archive marker repo", async () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);

      const partitions = [{ name: "wae_2025_01", month: daysAgo(30) }];

      const assignments = await service.assessPartitions(partitions);

      expect(assignments).toHaveLength(1);
      expect(assignments[0].isArchived).toBe(false);
    });
  });

  describe("getDateRangeTiers", () => {
    it("should classify a recent range as fully hot", async () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);

      const start = new Date();
      start.setDate(start.getDate() - 7);
      const end = new Date();

      const tiers = await service.getDateRangeTiers(start, end);

      expect(tiers.hotRange).not.toBeNull();
      expect(tiers.warmRange).toBeNull();
      expect(tiers.coldMonths).toHaveLength(0);
    });

    it("should include cold months for old ranges", async () => {
      const service = new AuditStorageTieringService(null, DEFAULT_CONFIG);

      const start = daysAgo(500);
      const end = daysAgo(400);

      const tiers = await service.getDateRangeTiers(start, end);

      expect(tiers.coldMonths.length).toBeGreaterThan(0);
      expect(tiers.hotRange).toBeNull();
    });
  });
});

// ============================================================================
// Archive Worker
// ============================================================================

describe("auditArchive.worker", () => {
  it("should skip already-archived partitions", async () => {
    const logger = createMockLogger();
    const coldMonth = new Date("2024-01-01");
    const existingMarker: Partial<AuditArchiveMarker> = {
      partitionMonth: coldMonth,
      ndjsonKey: "existing.ndjson",
      sha256: "abc",
      rowCount: 100,
      detachedAt: null,
    };
    const repo = createMockArchiveMarkerRepo([existingMarker]);

    const db = {} as any;
    const handler = createAuditArchiveHandler(
      db,
      repo as any,
      null,
      logger as any,
    );

    const result = await handler({
      partitionName: "wae_2024_01",
      partitionMonth: "2024-01-01",
    });

    expect(result.ndjsonKey).toBe("existing.ndjson");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("should skip empty partitions", async () => {
    const logger = createMockLogger();
    const repo = createMockArchiveMarkerRepo([]);

    const db = createKyselyMockDb(async () => ({ rows: [{ count: "0" }] }));

    const handler = createAuditArchiveHandler(
      db,
      repo as any,
      null,
      logger as any,
    );

    const result = await handler({
      partitionName: "wae_2024_01",
      partitionMonth: "2024-01-01",
    });

    expect(result.rowCount).toBe(0);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("should respect dry run mode", async () => {
    const logger = createMockLogger();
    const repo = createMockArchiveMarkerRepo([]);

    let callCount = 0;
    const db = createKyselyMockDb(async () => {
      callCount++;
      if (callCount === 1) return { rows: [{ count: "5" }] }; // count query
      if (callCount === 2) return { rows: [{ id: "1", event_type: "test" }] }; // data batch
      return { rows: [] }; // empty batch (end)
    });

    const objectStorage = { put: vi.fn() };

    const handler = createAuditArchiveHandler(
      db,
      repo as any,
      objectStorage as any,
      logger as any,
    );

    const result = await handler({
      partitionName: "wae_2024_01",
      partitionMonth: "2024-01-01",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(objectStorage.put).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });
});
