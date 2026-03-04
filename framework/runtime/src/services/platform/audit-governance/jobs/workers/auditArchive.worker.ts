/**
 * Audit Archive Worker
 *
 * BullMQ handler that archives cold-tier partitions to object storage:
 *   1. Count rows in the partition
 *   2. Export as NDJSON (batched SELECT, 10K at a time)
 *   3. Compute SHA-256
 *   4. Upload to audit-archives/{YYYY_MM}/
 *   5. Create archive marker
 *   6. Optionally DETACH partition (DDL)
 *   7. Log AUDIT_PARTITION_ARCHIVED to security_event
 */

import { createHash } from "crypto";

import { sql } from "kysely";

import type { Logger } from "../../../../../kernel/logger.js";
import type { AuditMetrics } from "../../observability/metrics.js";
import type { AuditArchiveMarkerRepo } from "../../persistence/AuditArchiveMarkerRepo.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface ArchivePartitionPayload {
  partitionName: string;
  partitionMonth: string; // ISO date string
  detachAfterArchive?: boolean;
  dryRun?: boolean;
}

export interface ArchivePartitionResult {
  partitionName: string;
  rowCount: number;
  ndjsonKey: string;
  sha256: string;
  detached: boolean;
  dryRun: boolean;
}

/**
 * Minimal object storage interface for uploads.
 */
export interface ArchiveObjectStorage {
  put(
    key: string,
    body: Buffer | string,
    opts?: {
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void>;
}

// ============================================================================
// Worker Factory
// ============================================================================

const BATCH_SIZE = 10_000;

export function createAuditArchiveHandler(
  db: Kysely<DB>,
  archiveMarkerRepo: AuditArchiveMarkerRepo,
  objectStorage: ArchiveObjectStorage | null,
  logger: Logger,
  metrics?: AuditMetrics,
) {
  return async (
    payload: ArchivePartitionPayload,
  ): Promise<ArchivePartitionResult> => {
    const {
      partitionName,
      partitionMonth: monthStr,
      detachAfterArchive = false,
      dryRun = false,
    } = payload;
    const partitionMonth = new Date(monthStr);

    logger.info(
      { partitionName, partitionMonth: monthStr, detachAfterArchive, dryRun },
      "[audit:archive] Starting partition archive",
    );

    // Check if already archived
    const existing = await archiveMarkerRepo.getByMonth(partitionMonth);
    if (existing) {
      logger.info(
        { partitionName, existingKey: existing.ndjsonKey },
        "[audit:archive] Partition already archived — skipping",
      );
      return {
        partitionName,
        rowCount: existing.rowCount,
        ndjsonKey: existing.ndjsonKey,
        sha256: existing.sha256,
        detached: existing.detachedAt !== null,
        dryRun,
      };
    }

    // 1. Count rows
    const countResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM core.${sql.ref(partitionName)}
    `.execute(db);
    const rowCount = Number(countResult.rows[0]?.count ?? 0);

    if (rowCount === 0) {
      logger.info(
        { partitionName },
        "[audit:archive] Partition is empty — skipping",
      );
      return {
        partitionName,
        rowCount: 0,
        ndjsonKey: "",
        sha256: "",
        detached: false,
        dryRun,
      };
    }

    // 2. Export as NDJSON (batched)
    let ndjson = "";
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await sql<any>`
        SELECT * FROM core.${sql.ref(partitionName)}
        ORDER BY event_timestamp ASC
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
      `.execute(db);

      const rows = batch.rows ?? [];
      for (const row of rows) {
        ndjson += JSON.stringify(row) + "\n";
      }

      offset += BATCH_SIZE;
      hasMore = rows.length === BATCH_SIZE;
    }

    // 3. Compute SHA-256
    const sha256 = createHash("sha256").update(ndjson, "utf8").digest("hex");

    // 4. Build storage key
    const yearMonth = partitionMonth
      .toISOString()
      .slice(0, 7)
      .replace("-", "_"); // YYYY_MM
    const ndjsonKey = `audit-archives/${yearMonth}/${partitionName}.ndjson`;

    if (!dryRun) {
      // 5. Upload to object storage
      if (objectStorage) {
        await objectStorage.put(ndjsonKey, ndjson, {
          contentType: "application/x-ndjson",
          metadata: {
            "x-audit-partition": partitionName,
            "x-audit-sha256": sha256,
            "x-audit-row-count": String(rowCount),
          },
        });
      }

      // 6. Create archive marker
      await archiveMarkerRepo.create({
        partitionName,
        partitionMonth,
        ndjsonKey,
        sha256,
        rowCount,
        archivedBy: "system:archive-worker",
      });

      // 7. Log security event
      try {
        await sql`
          INSERT INTO core.security_event (
            id, tenant_id, event_type, severity, details, occurred_at
          ) VALUES (
            gen_random_uuid(),
            '00000000-0000-0000-0000-000000000000'::uuid,
            'AUDIT_PARTITION_ARCHIVED',
            'info',
            ${JSON.stringify({ partitionName, ndjsonKey, sha256, rowCount })}::jsonb,
            now()
          )
        `.execute(db);
      } catch {
        // Best-effort
      }

      metrics?.partitionArchived({ partition: partitionName });
    }

    // 8. Optionally DETACH partition
    let detached = false;
    if (detachAfterArchive && !dryRun) {
      try {
        await sql`
          ALTER TABLE core.workflow_event_log
          DETACH PARTITION core.${sql.ref(partitionName)}
        `.execute(db);
        await archiveMarkerRepo.markDetached(partitionName);
        detached = true;
        logger.info({ partitionName }, "[audit:archive] Partition detached");
      } catch (err) {
        logger.error(
          {
            partitionName,
            error: err instanceof Error ? err.message : String(err),
          },
          "[audit:archive] Failed to detach partition",
        );
      }
    }

    logger.info(
      { partitionName, rowCount, ndjsonKey, sha256, detached, dryRun },
      "[audit:archive] Partition archive complete",
    );

    return { partitionName, rowCount, ndjsonKey, sha256, detached, dryRun };
  };
}
