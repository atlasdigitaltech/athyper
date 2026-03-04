/**
 * Tests for Orphaned Upload Cleanup Worker
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { createCleanupOrphanedUploadsHandler } from "./cleanupOrphanedUploads.worker.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import type { Kysely } from "kysely";

describe("cleanupOrphanedUploads worker", () => {
  let mockDb: Kysely<DB>;
  let mockStorage: ObjectStorageAdapter;
  let mockLogger: Logger;

  beforeEach(() => {
    // Mock database
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      deleteFrom: vi.fn().mockReturnThis(),
    } as any;

    // Mock storage adapter
    mockStorage = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
  });

  it("should skip when no orphaned uploads found", async () => {
    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "[content:worker:cleanup-orphaned] No orphaned uploads found",
    );
  });

  it("should delete orphaned uploads from DB and S3", async () => {
    const mockOrphanedUploads = [
      {
        id: "upload-1",
        tenant_id: "tenant-123",
        storage_bucket: "athyper",
        storage_key:
          "tenants/tenant-123/invoice/inv-1/attachment/2026/01/001/file-1",
        original_filename: "invoice.pdf",
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    // Mock DB query to return orphaned uploads
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi
        .fn()
        .mockResolvedValueOnce(mockOrphanedUploads) // SELECT query
        .mockResolvedValueOnce([{ numDeletedRows: 1 }]), // DELETE query
      deleteFrom: vi.fn().mockReturnThis(),
    } as any;

    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    // Verify S3 deletion (adapter takes key only, bucket is configured at adapter level)
    expect(mockStorage.delete).toHaveBeenCalledWith(
      "tenants/tenant-123/invoice/inv-1/attachment/2026/01/001/file-1",
    );

    // Verify summary log
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        found: 1,
        deletedFromStorage: 1,
        deletedFromDb: 1,
        errors: 0,
      },
      "[content:worker:cleanup-orphaned] Cleanup completed",
    );
  });

  it("should handle S3 deletion failures gracefully", async () => {
    const mockOrphanedUploads = [
      {
        id: "upload-1",
        tenant_id: "tenant-123",
        storage_bucket: "athyper",
        storage_key:
          "tenants/tenant-123/invoice/inv-1/attachment/2026/01/001/file-1",
        original_filename: "invoice.pdf",
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi
        .fn()
        .mockResolvedValueOnce(mockOrphanedUploads)
        .mockResolvedValueOnce([{ numDeletedRows: 1 }]),
      deleteFrom: vi.fn().mockReturnThis(),
    } as any;

    // Mock S3 delete failure (object doesn't exist)
    mockStorage.delete = vi.fn().mockRejectedValue(new Error("NoSuchKey"));

    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    // Should log debug (not error) for missing S3 object
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "upload-1",
        error: expect.stringContaining("NoSuchKey"),
      }),
      "[content:worker:cleanup-orphaned] S3 delete failed (object may not exist)",
    );

    // Should still delete DB record
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedFromDb: 1,
        deletedFromStorage: 0, // S3 delete failed
      }),
      "[content:worker:cleanup-orphaned] Cleanup completed",
    );
  });

  it("should respect maxCleanupPerRun limit", async () => {
    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 50, // limit to 50
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    // Verify limit was applied in query
    expect(mockDb.limit).toHaveBeenCalledWith(50);
  });

  it("should only delete uploads older than threshold", async () => {
    const now = new Date();
    const expectedCutoff = new Date(now.getTime() - 24 * 3600 * 1000);

    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    // Verify threshold was applied in query
    const whereCalls = (mockDb.where as any).mock.calls;
    const timeFilter = whereCalls.find(
      (call: any[]) => call[0] === "created_at" && call[1] === "<",
    );

    expect(timeFilter).toBeDefined();
    const actualCutoff = timeFilter?.[2] as Date;

    // Allow 1 second tolerance for test execution time
    expect(
      Math.abs(actualCutoff.getTime() - expectedCutoff.getTime()),
    ).toBeLessThan(1000);
  });

  it("should skip S3 deletion when deleteFromStorage is false", async () => {
    const mockOrphanedUploads = [
      {
        id: "upload-1",
        tenant_id: "tenant-123",
        storage_bucket: "athyper",
        storage_key:
          "tenants/tenant-123/invoice/inv-1/attachment/2026/01/001/file-1",
        original_filename: "invoice.pdf",
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi
        .fn()
        .mockResolvedValueOnce(mockOrphanedUploads)
        .mockResolvedValueOnce([{ numDeletedRows: 1 }]),
      deleteFrom: vi.fn().mockReturnThis(),
    } as any;

    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: false, // Skip S3 deletion
      },
      mockLogger,
    );

    await handler();

    // S3 delete should NOT be called
    expect(mockStorage.delete).not.toHaveBeenCalled();

    // DB delete should still happen
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedFromDb: 1,
        deletedFromStorage: 0,
      }),
      "[content:worker:cleanup-orphaned] Cleanup completed",
    );
  });

  it("should warn on high error rate", async () => {
    const mockOrphanedUploads = Array.from({ length: 10 }, (_, i) => ({
      id: `upload-${i}`,
      tenant_id: "tenant-123",
      storage_bucket: "athyper",
      storage_key: `key-${i}`,
      original_filename: `file-${i}.pdf`,
      created_at: new Date("2026-01-01T00:00:00Z"),
    }));

    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi
        .fn()
        .mockResolvedValueOnce(mockOrphanedUploads)
        // All deletes fail
        .mockRejectedValue(new Error("DB error")),
      deleteFrom: vi.fn().mockReturnThis(),
    } as any;

    const handler = createCleanupOrphanedUploadsHandler(
      mockDb,
      mockStorage,
      {
        orphanedThresholdHours: 24,
        maxCleanupPerRun: 100,
        deleteFromStorage: true,
      },
      mockLogger,
    );

    await handler();

    // Should log high error rate warning (>50% errors)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCount: 10,
        totalCount: 10,
      }),
      "[content:worker:cleanup-orphaned] High error rate during cleanup",
    );
  });
});
