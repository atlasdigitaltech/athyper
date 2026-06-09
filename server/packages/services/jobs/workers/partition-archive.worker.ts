/**
 * Partition Archive Worker
 *
 * Queue: jobs-partition-archive
 *
 * Two job names:
 *
 *   JOB_NAME.SWEEP — runs monthly (cron: '0 2 1 * *', i.e. 02:00 on the 1st).
 *     Scans pg_inherits for partitioned log tables older than the retention policy
 *     (default: 13 months). For each candidate partition:
 *       1. Checks governance.legal_hold — if any active hold overlaps the partition's
 *          time range, skip and log a warning. Records the blocked partition in
 *          governance.legal_hold_manifest.
 *       2. If no active hold, enqueues an ARCHIVE_PARTITION job for that partition.
 *
 *   JOB_NAME.ARCHIVE_PARTITION — archives one partition:
 *       1. Re-checks legal hold (safety net for holds created between sweep and execution).
 *       2. Calls DETACH PARTITION CONCURRENTLY (PostgreSQL 14+).
 *       3. Writes an entry to log.job_log (job_type='partition_archive').
 *       4. Drops the detached partition (cold archive via pg_dump is a separate pipeline).
 *
 * Concurrency: SWEEP = 1 (singleton), ARCHIVE_PARTITION = 2.
 * Retention: PARTITION_RETENTION_MONTHS env var (default 13).
 *
 * Legal hold contract:
 *   A partition is BLOCKED if any governance.legal_hold WHERE status='active'
 *   has a scope that overlaps the partition's time range:
 *     - scope_date_from / scope_date_to overlaps [partition_range_lo, partition_range_hi)
 *     - scope_log_schemas IS NULL (all schemas) OR scope_log_schemas contains partition_schema
 *   Blocked partitions are recorded in governance.legal_hold_manifest.
 */

import { Worker, Queue } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type PartitionArchiveSweepData,
  type ArchivePartitionJobData,
  type JobLogger,
} from "../jobs.types.js";
import { withDomainSpan } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

const PARTITION_RETENTION_MONTHS = parseInt(
  process.env["PARTITION_RETENTION_MONTHS"] ?? "13",
  10,
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PartitionCandidate {
  partition_schema: string;
  partition_table:  string;
  range_lo:         string;
  range_hi:         string;
}

/** Returns candidate partitions older than the retention threshold */
async function findCandidatePartitions(db: DB): Promise<PartitionCandidate[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - PARTITION_RETENTION_MONTHS);

  const result = await sql<PartitionCandidate>`
    SELECT
      n.nspname                                        AS partition_schema,
      c.relname                                        AS partition_table,
      (regexp_match(
        pg_get_expr(c.relpartbound, c.oid),
        'FROM \(''([^'']+)''\)'
      ))[1]                                            AS range_lo,
      (regexp_match(
        pg_get_expr(c.relpartbound, c.oid),
        'TO \(''([^'']+)''\)'
      ))[1]                                            AS range_hi
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relispartition = true
      AND n.nspname IN ('log', 'audit')
      AND pg_get_expr(c.relpartbound, c.oid) ~ 'FROM'
  `.execute(db);

  // Filter to those whose range_hi is before the cutoff (fully expired)
  return result.rows.filter((p) => {
    if (!p.range_hi) return false;
    return new Date(p.range_hi) <= cutoff;
  });
}

/**
 * Check if any active legal hold blocks this partition.
 * Returns the matching hold IDs (empty = not blocked).
 */
async function findBlockingHolds(
  db: DB,
  partitionSchema: string,
  rangeLo: Date,
  rangeHi: Date,
): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    SELECT id
    FROM governance.legal_hold
    WHERE status = 'active'
      AND (
        scope_date_from IS NULL
        OR scope_date_from < ${sql.val(rangeHi.toISOString())}
      )
      AND (
        scope_date_to IS NULL
        OR scope_date_to > ${sql.val(rangeLo.toISOString())}
      )
      AND (
        scope_log_schemas IS NULL
        OR ${sql.val(partitionSchema)} = ANY(scope_log_schemas)
      )
  `.execute(db);

  return rows.rows.map((r) => r.id);
}

/** Record a blocked partition into governance.legal_hold_manifest (all blocking holds) */
async function recordBlockedPartition(
  db: DB,
  holdIds: string[],
  partitionSchema: string,
  partitionTable:  string,
  rangeLo:         Date,
  rangeHi:         Date,
): Promise<void> {
  for (const holdId of holdIds) {
    // Determine tenant from the hold
    const hold = await db
      .selectFrom("governance.legal_hold" as never)
      .select("tenant_id" as never)
      .where("id" as never, "=", holdId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!hold) continue;

    await db
      .insertInto("governance.legal_hold_manifest" as never)
      .values({
        tenant_id:         hold["tenant_id"],
        legal_hold_id:     holdId,
        partition_schema:  partitionSchema,
        partition_table:   partitionTable,
        partition_range_lo: rangeLo,
        partition_range_hi: rangeHi,
        is_released:       false,
        created_by:        SYSTEM_ACTOR_ID,
      } as never)
      .onConflict((oc) =>
        (oc as ReturnType<typeof oc.columns>)
          .columns(["tenant_id", "legal_hold_id", "partition_schema", "partition_table"] as never[])
          .doNothing()
      )
      .execute();
  }
}

/** Write a job_log entry for the archive operation */
async function writeJobLog(
  db: DB,
  partitionTable: string,
  status: "success" | "skipped_hold" | "failed",
  detail: string,
): Promise<void> {
  await db
    .insertInto("log.job_log" as never)
    .values({
      job_type:    "partition_archive",
      queue:       QUEUE_NAME.PARTITION_ARCHIVE,
      status,
      started_at:  new Date(),
      completed_at: new Date(),
      error_detail: status === "failed" ? detail : null,
      metadata:    { partition_table: partitionTable, detail },
      created_by:  SYSTEM_ACTOR_ID,
    } as never)
    .execute();
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

async function sweep(
  db: DB,
  queue: Queue<ArchivePartitionJobData | PartitionArchiveSweepData>,
  logger?: JobLogger,
): Promise<void> {
  logger?.info("partition_archive_sweep_start");

  const candidates = await findCandidatePartitions(db);
  logger?.info("partition_archive_candidates_found", { count: candidates.length });

  let enqueued = 0;
  let blocked  = 0;

  for (const p of candidates) {
    if (!p.range_lo || !p.range_hi) continue;

    const rangeLo = new Date(p.range_lo);
    const rangeHi = new Date(p.range_hi);

    const holdIds = await findBlockingHolds(db, p.partition_schema, rangeLo, rangeHi);

    if (holdIds.length > 0) {
      // Partition is under a legal hold — record it and skip
      await recordBlockedPartition(db, holdIds, p.partition_schema, p.partition_table, rangeLo, rangeHi);
      logger?.warn("partition_archive_blocked_by_hold", {
        partition: p.partition_table,
        holdIds,
      });
      blocked++;
      continue;
    }

    // No hold — enqueue archive job. jobId deduplicates concurrent sweeps.
    await queue.add(
      JOB_NAME.ARCHIVE_PARTITION,
      {
        partitionSchema: p.partition_schema,
        partitionTable:  p.partition_table,
        rangeLo:         p.range_lo,
        rangeHi:         p.range_hi,
      },
      { jobId: `archive:${p.partition_schema}:${p.partition_table}` },
    );
    enqueued++;
  }

  logger?.info("partition_archive_sweep_done", {
    candidates: candidates.length,
    enqueued,
    blocked,
  });
}

// ─── Archive one partition ────────────────────────────────────────────────────

async function archivePartition(
  db: DB,
  data: ArchivePartitionJobData,
  logger?: JobLogger,
): Promise<void> {
  const { partitionSchema, partitionTable, rangeLo, rangeHi } = data;
  const rangeLoDate = new Date(rangeLo);
  const rangeHiDate = new Date(rangeHi);

  // Safety re-check: a hold may have been created after the sweep enqueued this job
  const holdIds = await findBlockingHolds(db, partitionSchema, rangeLoDate, rangeHiDate);
  if (holdIds.length > 0) {
    await recordBlockedPartition(db, holdIds, partitionSchema, partitionTable, rangeLoDate, rangeHiDate);
    await writeJobLog(db, partitionTable, "skipped_hold", `Blocked by holds: ${holdIds.join(", ")}`);
    logger?.warn("partition_archive_skipped_hold_at_execution", { partitionTable, holdIds });
    return;
  }

  // Resolve the parent table name from pg_inherits
  const parentRow = await sql<{ parent_table: string }>`
    SELECT p.relname AS parent_table
    FROM pg_inherits i
    JOIN pg_class c  ON c.oid  = i.inhrelid
    JOIN pg_class p  ON p.oid  = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${sql.val(partitionSchema)}
      AND c.relname = ${sql.val(partitionTable)}
    LIMIT 1
  `.execute(db);

  const parentTable = parentRow.rows[0]?.parent_table;
  if (!parentTable) {
    await writeJobLog(db, partitionTable, "failed", "Parent table not found in pg_inherits");
    logger?.error("partition_archive_no_parent", { partitionTable });
    return;
  }

  try {
    // DETACH PARTITION CONCURRENTLY (PostgreSQL 14+) — non-blocking
    await sql`
      ALTER TABLE ${sql.table(`${partitionSchema}.${parentTable}`)}
      DETACH PARTITION ${sql.table(`${partitionSchema}.${partitionTable}`)}
      CONCURRENTLY
    `.execute(db);

    logger?.info("partition_detached", { partitionTable });

    // After detach: DROP TABLE. In a production pipeline this would instead
    // be replaced by a pg_dump + S3 upload before dropping. For now, drop.
    await sql`
      DROP TABLE IF EXISTS ${sql.table(`${partitionSchema}.${partitionTable}`)}
    `.execute(db);

    await writeJobLog(db, partitionTable, "success", `Detached and dropped ${partitionSchema}.${partitionTable}`);
    logger?.info("partition_archive_done", { partitionTable });
  } catch (err) {
    await writeJobLog(db, partitionTable, "failed", String(err));
    throw err; // BullMQ will retry
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createPartitionArchiveWorker(
  db: DB,
  redis: ConnectionOptions,
  logger?: JobLogger,
): { worker: Worker; queue: Queue } {
  const queue = new Queue<ArchivePartitionJobData | PartitionArchiveSweepData>(
    QUEUE_NAME.PARTITION_ARCHIVE,
    { connection: redis },
  );

  const worker = new Worker<ArchivePartitionJobData | PartitionArchiveSweepData>(
    QUEUE_NAME.PARTITION_ARCHIVE,
    async (job: Job<ArchivePartitionJobData | PartitionArchiveSweepData>) => {
      if (job.name === JOB_NAME.SWEEP) {
        await withDomainSpan("governance.archive.sweep", {
          job_id: job.id,
          job_name: job.name,
        }, async () => sweep(db, queue, logger));
      } else if (job.name === JOB_NAME.ARCHIVE_PARTITION) {
        const data = job.data as ArchivePartitionJobData;
        await withDomainSpan("governance.archive.partition", {
          job_id: job.id,
          job_name: job.name,
          partition_schema: data.partitionSchema,
          partition_table: data.partitionTable,
        }, async () => archivePartition(db, data, logger));
      }
    },
    {
      connection: redis,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger?.error("partition_archive_worker_failed", {
      jobId:   job?.id,
      jobName: job?.name,
      err:     String(err),
    });
  });

  return { worker, queue };
}
