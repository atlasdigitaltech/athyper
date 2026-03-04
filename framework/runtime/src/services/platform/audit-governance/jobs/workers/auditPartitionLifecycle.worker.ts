/**
 * Audit Partition Lifecycle Worker
 *
 * BullMQ handler (daily schedule) that manages audit table partitions:
 *   1. Pre-create partitions N months ahead (from config partitionPreCreateMonths)
 *   2. Index drift detection via pg_indexes query
 *   3. Retention: drop partitions older than retentionDays
 *   4. Post-drop: VACUUM ANALYZE
 *
 * Schedule: daily at 3 AM via cron
 */

import { sql } from "kysely";

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface PartitionLifecyclePayload {
  /** Months ahead to pre-create (default: 3 from config) */
  preCreateMonths?: number;
  /** Retention in days (default: 90 from config) */
  retentionDays?: number;
  /** Dry run mode — log actions but don't execute */
  dryRun?: boolean;
}

export interface PartitionLifecycleResult {
  partitionsCreated: string[];
  partitionsDropped: string[];
  indexDriftDetected: Array<{ partition: string; missingIndexes: string[] }>;
  vacuumRan: boolean;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createPartitionLifecycleHandler(
  db: Kysely<DB>,
  logger: Logger,
) {
  return async (
    payload: PartitionLifecyclePayload,
  ): Promise<PartitionLifecycleResult> => {
    const { preCreateMonths = 3, retentionDays = 90, dryRun = false } = payload;

    logger.info(
      { preCreateMonths, retentionDays, dryRun },
      "[audit:partition] Starting partition lifecycle",
    );

    const result: PartitionLifecycleResult = {
      partitionsCreated: [],
      partitionsDropped: [],
      indexDriftDetected: [],
      vacuumRan: false,
    };

    // ── Step 1: Pre-create future partitions ──────────────────────
    for (let i = 0; i <= preCreateMonths; i++) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + i);
      targetDate.setDate(1);

      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, "0");
      const partitionName = `workflow_event_log_${year}_${month}`;

      try {
        if (!dryRun) {
          await sql`SELECT core.create_audit_partition_for_month(${targetDate.toISOString()}::date)`.execute(
            db,
          );
        }
        result.partitionsCreated.push(partitionName);
        logger.info(
          { partition: partitionName, dryRun },
          "[audit:partition] Pre-created partition",
        );
      } catch (err) {
        // Partition may already exist — that's fine
        logger.debug(
          {
            partition: partitionName,
            error: err instanceof Error ? err.message : String(err),
          },
          "[audit:partition] Partition already exists or creation failed",
        );
      }
    }

    // ── Step 2: Index drift detection ─────────────────────────────
    try {
      const partitions = await sql<{ partition_name: string }>`
        SELECT c.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        JOIN pg_namespace n ON n.oid = p.relnamespace
        WHERE n.nspname = 'core' AND p.relname = 'workflow_event_log'
        ORDER BY c.relname
      `.execute(db);

      for (const row of partitions.rows) {
        const indexCheck = await sql<{
          expected_index: string;
          exists_: boolean;
        }>`
          SELECT * FROM core.check_audit_partition_indexes(${row.partition_name})
        `.execute(db);

        const missing = indexCheck.rows
          .filter((r) => !r.exists_)
          .map((r) => r.expected_index);

        if (missing.length > 0) {
          result.indexDriftDetected.push({
            partition: row.partition_name,
            missingIndexes: missing,
          });
          logger.warn(
            { partition: row.partition_name, missingIndexes: missing },
            "[audit:partition] Index drift detected",
          );
        }
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "[audit:partition] Could not check index drift",
      );
    }

    // ── Step 3: Retention — drop old partitions ───────────────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffMonth = new Date(
      cutoffDate.getFullYear(),
      cutoffDate.getMonth(),
      1,
    );

    try {
      const partitions = await sql<{ partition_name: string }>`
        SELECT c.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        JOIN pg_namespace n ON n.oid = p.relnamespace
        WHERE n.nspname = 'core' AND p.relname = 'workflow_event_log'
        ORDER BY c.relname
      `.execute(db);

      for (const row of partitions.rows) {
        // Extract year_month from partition name: workflow_event_log_YYYY_MM
        const match = row.partition_name.match(/_(\d{4})_(\d{2})$/);
        if (!match) continue;

        const partYear = parseInt(match[1], 10);
        const partMonth = parseInt(match[2], 10) - 1; // 0-indexed
        const partDate = new Date(partYear, partMonth, 1);

        if (partDate < cutoffMonth) {
          if (!dryRun) {
            await sql`SELECT core.drop_audit_partition(${partYear}, ${partMonth + 1})`.execute(
              db,
            );
          }
          result.partitionsDropped.push(row.partition_name);
          logger.info(
            {
              partition: row.partition_name,
              cutoff: cutoffMonth.toISOString(),
              dryRun,
            },
            "[audit:partition] Dropped old partition",
          );
        }
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "[audit:partition] Could not drop old partitions",
      );
    }

    // ── Step 4: VACUUM ANALYZE if we dropped partitions ───────────
    if (result.partitionsDropped.length > 0 && !dryRun) {
      try {
        await sql`VACUUM ANALYZE core.workflow_event_log`.execute(db);
        result.vacuumRan = true;
        logger.info({}, "[audit:partition] VACUUM ANALYZE complete");
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err) },
          "[audit:partition] VACUUM ANALYZE failed (non-critical)",
        );
      }
    }

    logger.info(
      {
        created: result.partitionsCreated.length,
        dropped: result.partitionsDropped.length,
        indexDrift: result.indexDriftDetected.length,
        vacuum: result.vacuumRan,
      },
      "[audit:partition] Partition lifecycle complete",
    );

    return result;
  };
}
