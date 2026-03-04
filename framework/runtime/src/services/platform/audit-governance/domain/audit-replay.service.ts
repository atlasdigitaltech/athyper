/**
 * Audit Replay Service
 *
 * Idempotent replay of audit events from NDJSON exports or DLQ.
 * Uses INSERT ... ON CONFLICT DO NOTHING on the partial unique index
 * (tenant_id, correlation_id, event_timestamp, event_type, actor_user_id)
 * to guarantee deduplication.
 *
 * After replay, the hash chain is rebuilt for the tenant.
 */

import { sql } from "kysely";

import type { AuditHashChainService } from "./hash-chain.service.js";
import type { AuditDlqRepo } from "../persistence/AuditDlqRepo.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface ReplayFromNdjsonOptions {
  tenantId: string;
  ndjsonKey: string;
  replayedBy: string;
  batchSize?: number;
  onProgress?: (progress: ReplayProgress) => void;
}

export interface ReplayFromDlqOptions {
  tenantId: string;
  replayedBy: string;
  limit?: number;
  batchSize?: number;
}

export interface ReplayResult {
  inserted: number;
  duplicates: number;
  errors: number;
  total: number;
}

export interface ReplayProgress {
  processed: number;
  inserted: number;
  duplicates: number;
  total: number;
}

/**
 * Minimal object storage interface for reading NDJSON exports.
 */
export interface ReplayObjectStorage {
  get(key: string): Promise<{ body: string | Buffer } | null>;
}

// ============================================================================
// Service
// ============================================================================

export class AuditReplayService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly hashChain: AuditHashChainService,
    private readonly dlqRepo: AuditDlqRepo | null,
    private readonly objectStorage: ReplayObjectStorage | null,
  ) {}

  /**
   * Replay audit events from an NDJSON export in object storage.
   * Each event is inserted idempotently (ON CONFLICT DO NOTHING).
   * After replay, the hash chain is rebuilt for the tenant.
   */
  async replayFromNdjson(options: ReplayFromNdjsonOptions): Promise<ReplayResult> {
    const { tenantId, ndjsonKey, replayedBy, batchSize = 100, onProgress } = options;

    if (!this.objectStorage) {
      throw new Error("Object storage not available for NDJSON replay");
    }

    // 1. Fetch NDJSON
    const result = await this.objectStorage.get(ndjsonKey);
    if (!result) {
      throw new Error(`NDJSON file not found: ${ndjsonKey}`);
    }

    const content = typeof result.body === "string"
      ? result.body
      : result.body.toString("utf-8");

    // 2. Parse lines
    const lines = content.trim().split("\n").filter((l) => l.trim());
    const events = lines.map((line) => JSON.parse(line));

    // 3. Insert in batches
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const event of batch) {
        const outcome = await this.insertIdempotent(tenantId, event);
        if (outcome === "inserted") {
          inserted++;
        } else if (outcome === "duplicate") {
          duplicates++;
        } else {
          errors++;
        }
      }

      onProgress?.({
        processed: Math.min(i + batchSize, events.length),
        inserted,
        duplicates,
        total: events.length,
      });
    }

    // 4. Rebuild hash chain
    await this.rebuildHashChain(tenantId);

    // 5. Log security event
    await this.logReplayEvent(tenantId, replayedBy, "ndjson", {
      ndjsonKey,
      inserted,
      duplicates,
      errors,
      total: events.length,
    });

    return { inserted, duplicates, errors, total: events.length };
  }

  /**
   * Replay audit events from the DLQ.
   * Inserts idempotently and marks DLQ entries as replayed.
   */
  async replayFromDlq(options: ReplayFromDlqOptions): Promise<ReplayResult> {
    const { tenantId, replayedBy, limit = 100, batchSize = 50 } = options;

    if (!this.dlqRepo) {
      throw new Error("DLQ repository not available for replay");
    }

    // 1. Query unreplayed DLQ entries
    const entries = await this.dlqRepo.list(tenantId, {
      unreplayedOnly: true,
      limit,
    });

    let inserted = 0;
    let duplicates = 0;
    let errors = 0;

    // 2. Insert in batches
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      for (const entry of batch) {
        try {
          const event = typeof entry.payload === "string"
            ? JSON.parse(entry.payload as any)
            : entry.payload;

          const outcome = await this.insertIdempotent(tenantId, event);
          if (outcome === "inserted") {
            inserted++;
          } else if (outcome === "duplicate") {
            duplicates++;
          }

          // Mark DLQ entry as replayed regardless of insert/dup
          await this.dlqRepo.markReplayed(tenantId, entry.id, replayedBy);
        } catch {
          errors++;
        }
      }
    }

    // 3. Rebuild hash chain
    if (inserted > 0) {
      await this.rebuildHashChain(tenantId);
    }

    // 4. Log security event
    await this.logReplayEvent(tenantId, replayedBy, "dlq", {
      entriesProcessed: entries.length,
      inserted,
      duplicates,
      errors,
    });

    return { inserted, duplicates, errors, total: entries.length };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async insertIdempotent(
    tenantId: string,
    event: Record<string, any>,
  ): Promise<"inserted" | "duplicate" | "error"> {
    try {
      // Ensure correlation_id is set (required for dedup index)
      const correlationId = event.correlation_id ?? event.correlationId ?? event.id ?? crypto.randomUUID();

      const result = await sql`
        INSERT INTO core.workflow_event_log (
          id, tenant_id, instance_id, step_id, event_type, event_timestamp,
          actor_user_id, severity, entity_type, entity_id, correlation_id,
          comment, hash_prev, hash_curr, created_at
        ) VALUES (
          ${event.id ?? crypto.randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${event.instance_id ?? event.instanceId ?? null},
          ${event.step_id ?? event.stepId ?? null},
          ${event.event_type ?? event.eventType},
          ${(event.event_timestamp ?? event.timestamp ?? new Date().toISOString())}::timestamptz,
          ${event.actor_user_id ?? event.actor?.userId ?? null},
          ${event.severity ?? "info"},
          ${event.entity_type ?? event.entity?.type ?? null},
          ${event.entity_id ?? event.entity?.id ?? null},
          ${correlationId},
          ${event.comment ?? null},
          ${event.hash_prev ?? event.hashPrev ?? null},
          ${event.hash_curr ?? event.hashCurr ?? null},
          now()
        )
        ON CONFLICT DO NOTHING
      `.execute(this.db);

      // Check if row was actually inserted
      const numAffected = (result as any).numAffectedRows ?? (result as any).rowCount ?? 1;
      return Number(numAffected) > 0 ? "inserted" : "duplicate";
    } catch {
      return "error";
    }
  }

  private async rebuildHashChain(tenantId: string): Promise<void> {
    this.hashChain.resetTenant(tenantId);
    await this.hashChain.initFromDb(this.db, tenantId);
  }

  private async logReplayEvent(
    tenantId: string,
    replayedBy: string,
    source: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO core.security_event (
          id, tenant_id, event_type, severity, principal_id, details, occurred_at
        ) VALUES (
          gen_random_uuid(), ${tenantId}::uuid, 'AUDIT_REPLAYED', 'info',
          ${replayedBy}::uuid, ${JSON.stringify({ source, ...details })}::jsonb, now()
        )
      `.execute(this.db);
    } catch {
      // Best-effort
    }
  }
}
