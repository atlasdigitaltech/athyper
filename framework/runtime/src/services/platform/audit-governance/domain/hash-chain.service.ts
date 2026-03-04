/**
 * Audit Hash Chain Service
 *
 * Provides cryptographic tamper evidence for audit events.
 * Each event's hash depends on the previous event's hash, forming
 * an append-only chain that can be verified for integrity.
 *
 * hash_curr = SHA-256(hash_prev + canonical_event_payload)
 *
 * Daily anchors are written to core.hash_anchor for external
 * verification and efficient chain validation.
 */

import { createHash } from "crypto";

import type { AuditEvent } from "../../workflow-engine/audit/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Constants
// ============================================================================

/** Genesis hash for the first event in a tenant's chain */
export const GENESIS_HASH =
  "GENESIS_0000000000000000000000000000000000000000000000000000000000000000";

const ANCHOR_TABLE = "audit.hash_anchor" as keyof DB & string;

// ============================================================================
// Types
// ============================================================================

export interface HashResult {
  hash_prev: string;
  hash_curr: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  eventsChecked: number;
  brokenAtEventId?: string;
  brokenAtIndex?: number;
  message: string;
}

// ============================================================================
// Hash Chain Service
// ============================================================================

export class AuditHashChainService {
  /**
   * In-memory cache of the latest hash per tenant.
   * Populated from DB on first use, then kept in sync by writes.
   */
  private lastHashByTenant = new Map<string, string>();

  /**
   * Compute hash chain values for a new audit event.
   *
   * Thread-safety note: this is safe for single-process workers.
   * For multi-worker deployments, the outbox drain worker should be
   * the sole writer with concurrency=1 per tenant to preserve ordering.
   */
  async computeHash(
    tenantId: string,
    event: Omit<AuditEvent, "id">,
  ): Promise<HashResult> {
    const prev = this.lastHashByTenant.get(tenantId) ?? GENESIS_HASH;

    const payload = stableJsonStringify({
      tenant_id: tenantId,
      event_timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : String(event.timestamp),
      instance_id: event.instanceId,
      event_type: event.eventType,
      actor_user_id: event.actor?.userId,
      action: event.action ?? null,
      entity_id: event.entity?.id ?? null,
    });

    const curr = sha256(prev + "|" + payload);
    this.lastHashByTenant.set(tenantId, curr);

    return { hash_prev: prev, hash_curr: curr };
  }

  /**
   * Initialize the hash chain for a tenant by loading the latest hash from DB.
   * Call this during startup or on first write for a tenant.
   */
  async initFromDb(db: Kysely<DB>, tenantId: string): Promise<void> {
    // Try to get the latest hash from the audit events table
    const latest = (await db
      .selectFrom("audit.workflow_event_log" as any)
      .select(["hash_curr"])
      .where("tenant_id", "=", tenantId)
      .where("hash_curr", "is not", null)
      .orderBy("event_timestamp", "desc")
      .limit(1)
      .executeTakeFirst()) as { hash_curr: string } | undefined;

    if (latest?.hash_curr) {
      this.lastHashByTenant.set(tenantId, latest.hash_curr);
    }
    // If no events exist, GENESIS_HASH will be used on first write
  }

  /**
   * Verify the integrity of a chain of events.
   * Events must be ordered by event_timestamp ASC.
   */
  verifyChain(
    tenantId: string,
    events: Array<
      {
        id: string;
        hash_prev: string | null;
        hash_curr: string | null;
      } & Partial<AuditEvent>
    >,
  ): ChainVerificationResult {
    if (events.length === 0) {
      return { valid: true, eventsChecked: 0, message: "No events to verify" };
    }

    let expectedPrev = GENESIS_HASH;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Skip events without hash (pre-hash-chain era)
      if (!event.hash_prev || !event.hash_curr) {
        continue;
      }

      // Verify the chain link
      if (event.hash_prev !== expectedPrev) {
        return {
          valid: false,
          eventsChecked: i + 1,
          brokenAtEventId: event.id,
          brokenAtIndex: i,
          message: `Chain broken at event ${event.id} (index ${i}): expected prev=${expectedPrev}, got prev=${event.hash_prev}`,
        };
      }

      // Recompute the hash to verify it wasn't tampered
      const payload = stableJsonStringify({
        tenant_id: tenantId,
        event_timestamp:
          event.timestamp instanceof Date
            ? event.timestamp.toISOString()
            : String(event.timestamp),
        instance_id: event.instanceId,
        event_type: event.eventType,
        actor_user_id: event.actor?.userId,
        action: event.action ?? null,
        entity_id: event.entity?.id ?? null,
      });

      const recomputed = sha256(event.hash_prev + "|" + payload);
      if (recomputed !== event.hash_curr) {
        return {
          valid: false,
          eventsChecked: i + 1,
          brokenAtEventId: event.id,
          brokenAtIndex: i,
          message: `Hash mismatch at event ${event.id} (index ${i}): stored=${event.hash_curr}, recomputed=${recomputed}`,
        };
      }

      expectedPrev = event.hash_curr;
    }

    return {
      valid: true,
      eventsChecked: events.length,
      message: `Chain verified: ${events.length} events OK`,
    };
  }

  /**
   * Write a daily anchor checkpoint.
   * The anchor records the last hash and event count for a given day,
   * enabling efficient verification windows and external archival.
   */
  async writeAnchor(
    db: Kysely<DB>,
    tenantId: string,
    anchorDate: Date,
  ): Promise<void> {
    const lastHash = this.lastHashByTenant.get(tenantId) ?? GENESIS_HASH;

    // Count events for the day
    const dayStart = new Date(anchorDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(anchorDate);
    dayEnd.setHours(23, 59, 59, 999);

    const countResult = (await db
      .selectFrom("audit.workflow_event_log" as any)
      .select(db.fn.countAll().as("count"))
      .where("tenant_id", "=", tenantId)
      .where("event_timestamp", ">=", dayStart)
      .where("event_timestamp", "<=", dayEnd)
      .executeTakeFirst()) as { count: string | number } | undefined;

    const eventCount = Number(countResult?.count ?? 0);

    await db
      .insertInto(ANCHOR_TABLE as any)
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        anchor_date: dayStart,
        last_hash: lastHash,
        event_count: eventCount,
        created_at: new Date(),
      })
      .onConflict((oc) =>
        (oc as any).constraint("hash_anchor_uniq").doNothing(),
      )
      .execute();
  }

  /**
   * Clear cached state for a tenant (for testing or reinitialization).
   */
  resetTenant(tenantId: string): void {
    this.lastHashByTenant.delete(tenantId);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compute SHA-256 hash of a string.
 */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic JSON stringify with sorted keys.
 * Ensures the same object always produces the same string.
 */
function stableJsonStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Factory function.
 */
export function createHashChainService(): AuditHashChainService {
  return new AuditHashChainService();
}
