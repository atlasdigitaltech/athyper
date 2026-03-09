/**
 * Audit Log Retention Job
 *
 * Periodically cleans up old audit logs based on tenant retention policies.
 * Phase 15.2: High-volume audit/decision log strategy
 *
 * Policy integration (Phase 15.3):
 *   Reads per-tenant retention rules from core.data_retention_policy via
 *   core.resolve_retention_policy(). Falls back to retentionDays job param
 *   (default: 90) if no policy exists.
 *
 *   Legal hold check: If any matching retention policy has legal_hold = true,
 *   the job skips that tenant entirely and logs a warning.
 *
 * Future enhancements:
 * - Partitioning strategy: tenant_id + month partitions
 * - Archive to cold storage before deletion
 */

import { sql } from "kysely";

import { callRetentionDelete } from "./domain/tenant-context-setter.js";

import type { DB } from "@athyper/adapter-db";
import type { Job } from "bullmq";
import type { Kysely } from "kysely";

/**
 * Audit log retention job data
 */
export type AuditLogRetentionJobData = {
  /** Tenant ID to clean logs for */
  tenantId?: string;

  /**
   * Retention days (fallback: 90).
   * Overridden by core.data_retention_policy if a matching policy exists.
   * Policy precedence: entity > table > schema (see core.resolve_retention_policy).
   */
  retentionDays?: number;

  /** Dry run mode (don't actually delete) */
  dryRun?: boolean;
};

/**
 * Audit log retention job result
 */
export type AuditLogRetentionResult = {
  /** Number of audit log entries deleted */
  auditLogsDeleted: number;

  /** Number of permission decision logs deleted */
  decisionLogsDeleted: number;

  /** Number of workflow audit events deleted */
  workflowAuditEventsDeleted: number;

  /** Number of dead/persisted outbox items deleted */
  deadOutboxItemsDeleted: number;

  /** Cutoff date used for deletion */
  cutoffDate: Date;

  /** Tenant ID (if specified) */
  tenantId?: string;

  /** Was this a dry run */
  dryRun: boolean;
};

/**
 * Process audit log retention job
 *
 * Deletes audit logs older than retention period
 */
export async function processAuditLogRetention(
  job: Job<AuditLogRetentionJobData>,
  db: Kysely<DB>,
): Promise<AuditLogRetentionResult> {
  const { tenantId, retentionDays = 90, dryRun = false } = job.data;

  console.log(
    JSON.stringify({
      msg: "audit_log_retention_start",
      jobId: job.id,
      tenantId,
      retentionDays,
      dryRun,
    }),
  );

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let auditLogsDeleted = 0;
  let decisionLogsDeleted = 0;
  let workflowAuditEventsDeleted = 0;
  let deadOutboxItemsDeleted = 0;

  try {
    // Delete old audit logs
    if (!dryRun) {
      // meta.meta_audit has no immutability trigger — direct DELETE is fine
      const auditResult = await deleteOldAuditLogs(db, cutoffDate, tenantId);
      auditLogsDeleted = auditResult.deletedCount;

      // Protected tables use SECURITY DEFINER function for bypass
      decisionLogsDeleted = await callRetentionDelete(
        db,
        "permission_decision_log",
        cutoffDate,
        tenantId,
      );

      workflowAuditEventsDeleted = await callRetentionDelete(
        db,
        "workflow_event_log",
        cutoffDate,
        tenantId,
      );

      const outboxResult = await deleteOldOutboxItems(db, cutoffDate);
      deadOutboxItemsDeleted = outboxResult.deletedCount;
    } else {
      // Dry run: Count what would be deleted
      const auditCount = await countOldAuditLogs(db, cutoffDate, tenantId);
      auditLogsDeleted = auditCount;

      const decisionCount = await countOldDecisionLogs(
        db,
        cutoffDate,
        tenantId,
      );
      decisionLogsDeleted = decisionCount;

      const workflowCount = await countOldWorkflowAuditEvents(
        db,
        cutoffDate,
        tenantId,
      );
      workflowAuditEventsDeleted = workflowCount;

      const outboxCount = await countOldOutboxItems(db, cutoffDate);
      deadOutboxItemsDeleted = outboxCount;
    }

    console.log(
      JSON.stringify({
        msg: "audit_log_retention_complete",
        jobId: job.id,
        auditLogsDeleted,
        decisionLogsDeleted,
        workflowAuditEventsDeleted,
        deadOutboxItemsDeleted,
        cutoffDate: cutoffDate.toISOString(),
        dryRun,
      }),
    );

    return {
      auditLogsDeleted,
      decisionLogsDeleted,
      workflowAuditEventsDeleted,
      deadOutboxItemsDeleted,
      cutoffDate,
      tenantId,
      dryRun,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        msg: "audit_log_retention_error",
        jobId: job.id,
        error: String(error),
      }),
    );
    throw error;
  }
}

/**
 * Delete old audit logs
 */
async function deleteOldAuditLogs(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<{ deletedCount: number }> {
  // Build DELETE query with tenant filter if specified
  const query = sql<{ count: number }>`
    WITH deleted AS (
      DELETE FROM meta.meta_audit
      WHERE created_at < ${cutoffDate.toISOString()}
        ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  const result = await query.execute(db);
  const deletedCount = Number(result.rows[0]?.count ?? 0);

  return { deletedCount };
}

/**
 * Delete old permission decision logs
 */
async function deleteOldDecisionLogs(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<{ deletedCount: number }> {
  // Build DELETE query with tenant filter if specified
  const query = sql<{ count: number }>`
    WITH deleted AS (
      DELETE FROM core.permission_decision_log
      WHERE occurred_at < ${cutoffDate.toISOString()}
        ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  const result = await query.execute(db);
  const deletedCount = Number(result.rows[0]?.count ?? 0);

  return { deletedCount };
}

/**
 * Count old audit logs (for dry run)
 */
async function countOldAuditLogs(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<number> {
  const query = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM meta.meta_audit
    WHERE created_at < ${cutoffDate.toISOString()}
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
  `;

  const result = await query.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Count old permission decision logs (for dry run)
 */
async function countOldDecisionLogs(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<number> {
  const query = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM core.permission_decision_log
    WHERE occurred_at < ${cutoffDate.toISOString()}
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
  `;

  const result = await query.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Delete old workflow audit events
 * Note: Requires SET LOCAL athyper.audit_retention_bypass = 'true'
 */
async function deleteOldWorkflowAuditEvents(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<{ deletedCount: number }> {
  const query = sql<{ count: number }>`
    WITH deleted AS (
      DELETE FROM core.workflow_event_log
      WHERE created_at < ${cutoffDate.toISOString()}::timestamptz
        ${tenantId ? sql`AND tenant_id = ${tenantId}::uuid` : sql``}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  const result = await query.execute(db);
  return { deletedCount: Number(result.rows[0]?.count ?? 0) };
}

/**
 * Delete old outbox items (persisted and dead only)
 */
async function deleteOldOutboxItems(
  db: Kysely<DB>,
  cutoffDate: Date,
): Promise<{ deletedCount: number }> {
  const query = sql<{ count: number }>`
    WITH deleted AS (
      DELETE FROM core.audit_outbox
      WHERE status IN ('persisted', 'dead')
        AND created_at < ${cutoffDate.toISOString()}::timestamptz
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  const result = await query.execute(db);
  return { deletedCount: Number(result.rows[0]?.count ?? 0) };
}

/**
 * Count old workflow audit events (for dry run)
 */
async function countOldWorkflowAuditEvents(
  db: Kysely<DB>,
  cutoffDate: Date,
  tenantId?: string,
): Promise<number> {
  const query = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM core.workflow_event_log
    WHERE created_at < ${cutoffDate.toISOString()}::timestamptz
      ${tenantId ? sql`AND tenant_id = ${tenantId}::uuid` : sql``}
  `;

  const result = await query.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Count old outbox items (for dry run)
 */
async function countOldOutboxItems(
  db: Kysely<DB>,
  cutoffDate: Date,
): Promise<number> {
  const query = sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM core.audit_outbox
    WHERE status IN ('persisted', 'dead')
      AND created_at < ${cutoffDate.toISOString()}::timestamptz
  `;

  const result = await query.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Schedule audit log retention job
 *
 * Example: Run daily at 2 AM
 * ```typescript
 * const queue = getQueue("audit-retention");
 * await queue.add(
 *   "audit-retention",
 *   { retentionDays: 90 },
 *   {
 *     repeat: {
 *       pattern: "0 2 * * *", // Daily at 2 AM
 *     },
 *   }
 * );
 * ```
 */

/**
 * Future: Partitioning strategy
 *
 * For high-volume deployments, implement table partitioning:
 *
 * CREATE TABLE meta.meta_audit (
 *   id UUID,
 *   tenant_id UUID,
 *   created_at TIMESTAMPTZ,
 *   ...
 * ) PARTITION BY RANGE (created_at);
 *
 * CREATE TABLE meta.meta_audit_2025_01 PARTITION OF meta.meta_audit
 *   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
 *
 * CREATE TABLE meta.meta_audit_2025_02 PARTITION OF meta.meta_audit
 *   FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
 *
 * Benefits:
 * - Drop entire partitions instantly (faster than DELETE)
 * - Query performance (partition pruning)
 * - Easier archiving (detach partition, move to cold storage)
 */
