/**
 * DLQ Middleware — Phase 3.3
 *
 * Dead-letter queue insert helper for failed background job processing.
 * Notification delivery retains its dedicated DLQ. Audit delivery failures are
 * tracked by ops.job_execution, while render failures live on render_output.
 *
 * DlqRecord interface matches the common columns across all three tables.
 * insertDlq() handles insert against the appropriate table.
 *
 * Usage (in the notification worker's failed handler):
 *   await insertDlq(db, DLQ_TABLE.NOTIFICATION, {
 *     tenantId:          job.data.tenantId,
 *     queueName:         "jobs-domain-outbox",
 *     jobName:           job.name,
 *     payload:           job.data,
 *     errorMessage:      err.message,
 *     retryCount:        job.attemptsMade,
 *     lastAttemptedAt:   new Date().toISOString(),
 *   });
 *
 * Retry from DLQ:
 *   Use retryFromDlq() to re-enqueue a DLQ record.
 *   The record is marked `retried_at` and the job is added back to the queue.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Common DLQ record interface — matches all three DLQ table schemas. */
export interface DlqRecord {
  tenantId:        string;
  queueName:       string;
  jobName:         string;
  payload:         unknown;
  errorMessage:    string;
  retryCount:      number;
  lastAttemptedAt: string;
}

/** Well-known DLQ table names */
export const DLQ_TABLE = {
  NOTIFICATION: "log.notification_dlq",
} as const;

export type DlqTableName = (typeof DLQ_TABLE)[keyof typeof DLQ_TABLE];

// ── insertDlq ─────────────────────────────────────────────────────────────────

/**
 * Insert a failed job record into the specified DLQ table.
 * Best-effort — errors in DLQ insert are caught and returned as null.
 */
export async function insertDlq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  table: string,
  record: DlqRecord,
): Promise<string | null> {
  try {
    const row = await db
      .insertInto(table as never)
      .values({
        tenant_id:         record.tenantId,
        queue_name:        record.queueName,
        job_name:          record.jobName,
        payload:           JSON.stringify(record.payload),
        error_message:     record.errorMessage.substring(0, 2048),
        retry_count:       record.retryCount,
        last_attempted_at: record.lastAttemptedAt,
        created_at:        new Date().toISOString(),
      } as never)
      .returning("id" as never)
      .executeTakeFirst() as { id: string } | undefined;

    return row?.id ?? null;
  } catch {
    return null;
  }
}

// ── retryFromDlq ──────────────────────────────────────────────────────────────

/**
 * Re-enqueue a DLQ record. Marks the DLQ row as retried.
 * Returns the new BullMQ job ID.
 */
export async function retryFromDlq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:         Kysely<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue:      Queue<Record<string, unknown>>,
  table:      string,
  dlqId:      string,
  tenantId:   string,
): Promise<string | null> {
  const row = await db
    .selectFrom(table as never)
    .selectAll()
    .where("id" as never, "=", dlqId as never)
    .where("tenant_id" as never, "=", tenantId as never)
    .where("retried_at" as never, "is", null as never)
    .executeTakeFirst() as Record<string, unknown> | undefined;

  if (!row) return null;

  const payload = JSON.parse(row["payload"] as string ?? "{}") as Record<string, unknown>;
  const jobName = row["job_name"] as string;

  const job = await queue.add(jobName, payload, {
    attempts: 3,
    backoff:  { type: "exponential", delay: 2000 },
  });

  // Mark as retried
  await db
    .updateTable(table as never)
    .set({
      retried_at: new Date().toISOString() as never,
      retried_job_id: job.id as never,
    } as never)
    .where("id" as never, "=", dlqId as never)
    .execute()
    .catch(() => { /* best-effort */ });

  return job.id ?? null;
}

// ── listDlq ───────────────────────────────────────────────────────────────────

export interface DlqListParams {
  table:      string;
  tenantId:   string;
  queueName?: string;
  limit?:     number;
  offset?:    number;
  unretried?: boolean;
}

/**
 * List DLQ records for a tenant, optionally filtered by queue.
 */
export async function listDlq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  params: DlqListParams,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db
    .selectFrom(params.table as never)
    .selectAll()
    .where("tenant_id" as never, "=", params.tenantId as never);

  if (params.queueName) {
    q = q.where("queue_name" as never, "=", params.queueName as never);
  }

  if (params.unretried) {
    q = q.where("retried_at" as never, "is", null as never);
  }

  const [items, countRow] = await Promise.all([
    q.orderBy("created_at" as never, "desc").limit(limit).offset(offset).execute() as Promise<Record<string, unknown>[]>,
    db
      .selectFrom(params.table as never)
      .select(sql<string>`COUNT(*)`.as("cnt") as never)
      .where("tenant_id" as never, "=", params.tenantId as never)
      .executeTakeFirst() as Promise<{ cnt: string | number } | undefined>,
  ]);

  return {
    items,
    total: parseInt(String(countRow?.cnt ?? "0"), 10),
  };
}
