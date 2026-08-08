/**
 * HashChainIntegrityService — Phase 4.1
 *
 * Computes and verifies tamper-evident hash chains over audit.audit_log.
 * Uses SHA-256 to chain daily audit batches:
 *
 *   anchor(day N) = SHA-256(anchor(day N-1).last_hash || events(day N))
 *
 * where events(day N) = SHA-256 of each audit_log.id sorted by occurred_at,
 * concatenated in order.
 *
 * The chain is stored in audit.hash_anchor (one row per tenant per day).
 * Verification re-derives the hash from raw audit rows and compares to
 * the stored anchor — any modification to historical rows breaks the chain.
 *
 * Usage:
 *   1. Seal a day's audit log:
 *      await hashChain.sealDay(tenantId, "2026-04-14");
 *
 *   2. Verify a range of anchors:
 *      const result = await hashChain.verify(tenantId, "2026-04-01", "2026-04-14");
 *
 * Wired to: BullMQ cron job at 00:05 UTC daily (Phase 3.2 cron registry).
 * Key rotation worker (Phase 4.1): re-seals hot partition only.
 */

import { createHash } from "crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HashAnchor {
  id:         string;
  tenantId:   string;
  anchorDate: string;
  lastHash:   string;
  eventCount: number;
  createdAt:  string;
}

export interface SealResult {
  anchorDate: string;
  lastHash:   string;
  eventCount: number;
  isNew:      boolean;  // false = updated existing anchor (idempotent re-seal)
}

export interface VerifyResult {
  tenantId:    string;
  fromDate:    string;
  toDate:      string;
  anchorsChecked: number;
  intact:      boolean;
  brokenAt:    string | null;  // anchor_date of first broken link
  gaps:        string[];       // dates with missing anchors
}

// ── HashChainIntegrityService ─────────────────────────────────────────────────

export class HashChainIntegrityService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  private readonly GENESIS_HASH =
    "0000000000000000000000000000000000000000000000000000000000000000";

  private readonly SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Seal a day's audit log by computing and storing a hash anchor.
   * Idempotent — re-sealing the same day updates the anchor (for recovery).
   */
  async sealDay(tenantId: string, date: string): Promise<SealResult> {
    const prevAnchor = await this.getPreviousAnchor(tenantId, date);
    const prevHash   = prevAnchor?.lastHash ?? this.GENESIS_HASH;

    const { hash, count } = await this.computeDayHash(tenantId, date, prevHash);

    // Upsert anchor
    const existing = await this.db
      .selectFrom("audit.hash_anchor as ha" as never)
      .select("ha.id" as never)
      .where("ha.tenant_id" as never, "=", tenantId as never)
      .where("ha.anchor_date" as never, "=", date as never)
      .executeTakeFirst() as { id: string } | undefined;

    if (existing) {
      await this.db
        .updateTable("audit.hash_anchor" as never)
        .set({
          last_hash:   hash as never,
          event_count: count as never,
        } as never)
        .where("id" as never, "=", existing.id as never)
        .execute();

      return { anchorDate: date, lastHash: hash, eventCount: count, isNew: false };
    }

    await this.db
      .insertInto("audit.hash_anchor" as never)
      .values({
        tenant_id:   tenantId,
        anchor_date: date,
        last_hash:   hash,
        event_count: count,
        created_by:  this.SYSTEM_ACTOR,
      } as never)
      .execute();

    return { anchorDate: date, lastHash: hash, eventCount: count, isNew: true };
  }

  /**
   * Verify the hash chain for a tenant over a date range.
   * Re-derives each day's hash from raw audit_log rows and compares to anchor.
   */
  async verify(
    tenantId: string,
    fromDate: string,
    toDate:   string,
  ): Promise<VerifyResult> {
    const anchors = await this.db
      .selectFrom("audit.hash_anchor as ha" as never)
      .select(["ha.anchor_date", "ha.last_hash", "ha.event_count"] as never[])
      .where("ha.tenant_id" as never, "=", tenantId as never)
      .where("ha.anchor_date" as never, ">=", fromDate as never)
      .where("ha.anchor_date" as never, "<=", toDate as never)
      .orderBy("ha.anchor_date" as never, "asc")
      .execute() as Array<{ anchor_date: string; last_hash: string; event_count: number }>;

    if (anchors.length === 0) {
      return {
        tenantId,
        fromDate,
        toDate,
        anchorsChecked: 0,
        intact: true,
        brokenAt: null,
        gaps: [],
      };
    }

    // Seed prevHash from the anchor immediately before the range so that
    // verifying a sub-range (e.g. April 10–14) does not produce false-positive
    // failures caused by using GENESIS_HASH instead of the real predecessor hash.
    const preRangeAnchor = await this.getPreviousAnchor(tenantId, anchors[0]!.anchor_date);
    let prevHash    = preRangeAnchor?.lastHash ?? this.GENESIS_HASH;
    let brokenAt:   string | null = null;
    const gaps:     string[] = [];
    let prevDate:   string | null = null;

    for (const anchor of anchors) {
      // Check for gaps in the sequence
      if (prevDate) {
        const expected = nextDate(prevDate);
        if (expected !== anchor.anchor_date) {
          // There are dates between prevDate and anchor_date with no anchors
          let cur = expected;
          while (cur !== anchor.anchor_date) {
            gaps.push(cur);
            cur = nextDate(cur);
          }
        }
      }

      const { hash } = await this.computeDayHash(tenantId, anchor.anchor_date, prevHash);

      if (hash !== anchor.last_hash) {
        brokenAt = anchor.anchor_date;
        break;
      }

      prevHash  = hash;
      prevDate  = anchor.anchor_date;
    }

    return {
      tenantId,
      fromDate,
      toDate,
      anchorsChecked: anchors.length,
      intact:  brokenAt === null,
      brokenAt,
      gaps,
    };
  }

  /**
   * Get the most recent anchor for a tenant (for chain status display).
   */
  async getLatestAnchor(tenantId: string): Promise<HashAnchor | null> {
    const row = await this.db
      .selectFrom("audit.hash_anchor as ha" as never)
      .selectAll("ha" as never)
      .where("ha.tenant_id" as never, "=", tenantId as never)
      .orderBy("ha.anchor_date" as never, "desc")
      .limit(1)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.mapAnchorRow(row);
  }

  /**
   * List all anchors for a tenant in a date range.
   */
  async listAnchors(
    tenantId: string,
    fromDate: string,
    toDate:   string,
  ): Promise<HashAnchor[]> {
    const rows = await this.db
      .selectFrom("audit.hash_anchor as ha" as never)
      .selectAll("ha" as never)
      .where("ha.tenant_id" as never, "=", tenantId as never)
      .where("ha.anchor_date" as never, ">=", fromDate as never)
      .where("ha.anchor_date" as never, "<=", toDate as never)
      .orderBy("ha.anchor_date" as never, "asc")
      .execute() as Record<string, unknown>[];

    return rows.map(this.mapAnchorRow.bind(this));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async computeDayHash(
    tenantId: string,
    date: string,
    prevHash: string,
  ): Promise<{ hash: string; count: number }> {
    // Fetch all audit_log rows for this tenant on this date, sorted by occurred_at
    const rows = await this.db
      .selectFrom("audit.audit_log as al" as never)
      .select(["al.id", "al.operation", "al.entity_type", "al.entity_id", "al.occurred_at"] as never[])
      .where("al.tenant_id" as never, "=", tenantId as never)
      .where(sql`DATE(al.occurred_at)` as never, "=" as never, date as never)
      .orderBy("al.occurred_at" as never, "asc")
      .orderBy("al.id" as never, "asc")
      .execute() as Array<{
        id: string;
        operation: string;
        entity_type: string;
        entity_id: string;
        occurred_at: string;
      }>;

    // Chain: SHA-256(prevHash || event1_id || event2_id || ...)
    const hasher = createHash("sha256");
    hasher.update(prevHash);

    for (const row of rows) {
      // Include id + operation + entity identifiers for tamper detection
      hasher.update(`${row.id}:${row.operation}:${row.entity_type}:${row.entity_id}:${row.occurred_at}`);
    }

    return { hash: hasher.digest("hex"), count: rows.length };
  }

  private async getPreviousAnchor(
    tenantId: string,
    date: string,
  ): Promise<{ lastHash: string; anchorDate: string } | null> {
    const row = await this.db
      .selectFrom("audit.hash_anchor as ha" as never)
      .select(["ha.last_hash", "ha.anchor_date"] as never[])
      .where("ha.tenant_id" as never, "=", tenantId as never)
      .where("ha.anchor_date" as never, "<", date as never)
      .orderBy("ha.anchor_date" as never, "desc")
      .limit(1)
      .executeTakeFirst() as { last_hash: string; anchor_date: string } | undefined;

    if (!row) return null;
    return { lastHash: row.last_hash, anchorDate: row.anchor_date };
  }

  private mapAnchorRow(row: Record<string, unknown>): HashAnchor {
    return {
      id:         row["id"] as string,
      tenantId:   row["tenant_id"] as string,
      anchorDate: row["anchor_date"] as string,
      lastHash:   row["last_hash"] as string,
      eventCount: row["event_count"] as number,
      createdAt:  row["created_at"] as string,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHashChainIntegrityService(db: Kysely<any>): HashChainIntegrityService {
  return new HashChainIntegrityService(db);
}
