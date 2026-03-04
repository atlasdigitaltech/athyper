/**
 * Audit Daily Backup Worker
 *
 * BullMQ handler (cron 1 AM) that performs daily backup operations:
 *   1. Export yesterday's audit events as NDJSON
 *   2. Write daily hash chain anchor
 *
 * Error isolation: failures for one tenant do not affect others.
 */

import { sql } from "kysely";

import type { Logger } from "../../../../../kernel/logger.js";
import type { AuditExportService } from "../../domain/audit-export.service.js";
import type { AuditHashChainService } from "../../domain/hash-chain.service.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface DailyBackupPayload {
  /** Specific tenant to backup (null = all tenants) */
  tenantId?: string;
  /** Override date (default: yesterday) */
  date?: string;
}

export interface DailyBackupResult {
  tenantsProcessed: number;
  tenantsSucceeded: number;
  tenantsFailed: number;
  errors: Array<{ tenantId: string; error: string }>;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createAuditDailyBackupHandler(
  db: Kysely<DB>,
  exportService: AuditExportService,
  hashChain: AuditHashChainService,
  logger: Logger,
) {
  return async (payload: DailyBackupPayload): Promise<DailyBackupResult> => {
    // Determine date range (default: yesterday)
    const backupDate = payload.date ? new Date(payload.date) : getYesterday();

    const startDate = new Date(backupDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(backupDate);
    endDate.setHours(23, 59, 59, 999);

    logger.info(
      { date: backupDate.toISOString().split("T")[0] },
      "[audit:daily-backup] Starting daily backup",
    );

    // Get tenant list
    const tenantIds = payload.tenantId
      ? [payload.tenantId]
      : await getActiveTenants(db);

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ tenantId: string; error: string }> = [];

    for (const tenantId of tenantIds) {
      try {
        // 1. Export as NDJSON
        await exportService.export({
          tenantId,
          startDate,
          endDate,
          exportedBy: "system:daily-backup",
        });

        // 2. Write daily anchor
        await hashChain.writeAnchor(db, tenantId, backupDate);

        succeeded++;
        logger.info(
          { tenantId, date: backupDate.toISOString().split("T")[0] },
          "[audit:daily-backup] Tenant backup complete",
        );
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ tenantId, error: errorMsg });
        logger.error(
          { tenantId, error: errorMsg },
          "[audit:daily-backup] Tenant backup failed",
        );
      }
    }

    logger.info(
      { tenantsProcessed: tenantIds.length, succeeded, failed },
      "[audit:daily-backup] Daily backup complete",
    );

    return {
      tenantsProcessed: tenantIds.length,
      tenantsSucceeded: succeeded,
      tenantsFailed: failed,
      errors,
    };
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

async function getActiveTenants(db: Kysely<DB>): Promise<string[]> {
  try {
    const result = await sql<{ tenant_id: string }>`
      SELECT DISTINCT tenant_id::text
      FROM core.workflow_event_log
      WHERE event_timestamp >= now() - interval '30 days'
      LIMIT 1000
    `.execute(db);

    return (result.rows ?? []).map((r) => r.tenant_id);
  } catch {
    return [];
  }
}
