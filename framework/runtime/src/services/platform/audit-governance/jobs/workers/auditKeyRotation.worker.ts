/**
 * Audit Key Rotation Worker
 *
 * BullMQ handler that batch re-encrypts audit event rows from an old
 * key version to the current key version. Processes rows in batches
 * to avoid long-running transactions.
 *
 * Uses SECURITY DEFINER function `core.audit_key_rotation_update()` for
 * immutability bypass (replaces ad-hoc SET LOCAL pattern).
 */

import { callKeyRotationUpdate } from "../../domain/tenant-context-setter.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { AuditColumnEncryptionService } from "../../domain/column-encryption.service.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";



// ============================================================================
// Types
// ============================================================================

export interface KeyRotationPayload {
  tenantId: string;
  fromKeyVersion: number;
  batchSize?: number;
}

export interface KeyRotationResult {
  rowsProcessed: number;
  errors: number;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createAuditKeyRotationHandler(
  db: Kysely<DB>,
  encryption: AuditColumnEncryptionService,
  logger: Logger,
) {
  const TABLE = "audit.workflow_event_log" as keyof DB & string;
  const DEFAULT_BATCH_SIZE = 100;

  return async (payload: KeyRotationPayload): Promise<KeyRotationResult> => {
    const { tenantId, fromKeyVersion, batchSize = DEFAULT_BATCH_SIZE } = payload;

    logger.info(
      { tenantId, fromKeyVersion, batchSize },
      "[audit:key-rotation] Starting key rotation batch",
    );

    let rowsProcessed = 0;
    let errors = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch a batch of rows with the old key version
      // Note: event_timestamp is needed for the partitioned PK
      const rows = await db
        .selectFrom(TABLE as any)
        .select(["id", "event_timestamp", "ip_address", "user_agent", "comment", "attachments", "key_version"])
        .where("tenant_id", "=", tenantId)
        .where("key_version", "=", fromKeyVersion)
        .limit(batchSize)
        .execute() as Array<{
          id: string;
          event_timestamp: Date;
          ip_address: string | null;
          user_agent: string | null;
          comment: string | null;
          attachments: string | null;
          key_version: number;
        }>;

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      // Re-encrypt each row via SECURITY DEFINER function
      for (const row of rows) {
        try {
          const reEncrypted = await encryption.encryptColumns(tenantId, {
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            comment: row.comment,
            attachments: row.attachments,
          });

          await callKeyRotationUpdate(db, {
            tenantId,
            rowId: row.id,
            eventTimestamp: row.event_timestamp instanceof Date
              ? row.event_timestamp
              : new Date(row.event_timestamp),
            ip_address: reEncrypted.ip_address,
            user_agent: reEncrypted.user_agent,
            comment: reEncrypted.comment,
            attachments: reEncrypted.attachments,
            key_version: reEncrypted.key_version,
          });

          rowsProcessed++;
        } catch (err) {
          errors++;
          logger.error(
            { tenantId, rowId: row.id, error: err instanceof Error ? err.message : String(err) },
            "[audit:key-rotation] Failed to re-encrypt row",
          );
        }
      }

      logger.info(
        { tenantId, processed: rowsProcessed, errors, batchRemaining: rows.length },
        "[audit:key-rotation] Batch progress",
      );
    }

    logger.info(
      { tenantId, fromKeyVersion, rowsProcessed, errors },
      "[audit:key-rotation] Key rotation complete",
    );

    return { rowsProcessed, errors };
  };
}
