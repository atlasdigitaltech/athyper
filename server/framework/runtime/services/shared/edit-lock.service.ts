/**
 * Edit Lock Service — pessimistic aggregate-root locking
 *
 * Controls which user may edit a record at any given time.
 * Pairs with the row_version optimistic-check to form the full
 * lease-plus-version concurrency model.
 *
 * Lock lifecycle:
 *   acquire  → POST   /api/records/:entity/:id/lock
 *   heartbeat → PUT   /api/records/:entity/:id/lock/heartbeat  (every 30 s)
 *   release  → DELETE /api/records/:entity/:id/lock
 *   force    → DELETE /api/records/:entity/:id/lock/force  (admin only)
 *
 * Acquisition is atomic: the service deletes any expired lock then inserts
 * a new one inside a transaction. The UNIQUE constraint catches the rare
 * simultaneous-acquire race without advisory locks.
 */

import { type Kysely, sql } from "kysely";
import { randomUUID } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export const DEFAULT_LOCK_TTL_SECONDS = 300;   // 5 minutes
export const DEFAULT_HEARTBEAT_SECONDS = 30;

// ── Public types ──────────────────────────────────────────────────────────────

export interface LockAcquireParams {
  tenantId:     string;
  entityName:   string;
  recordId:     string;
  lockedBy:     string;   // master.principal UUID
  sessionId?:   string;   // optional browser tab id
  lockReason?:  string;
  ttlSeconds?:  number;
}

export interface LockAcquireResult {
  acquired:       boolean;
  lockToken?:     string;   // present when acquired=true
  expiresAt?:     string;   // ISO string, present in all outcomes
  lockedBy?:      string;   // principal UUID of the holder when acquired=false
  isLockedBySelf?: boolean; // same principal holds the lock (different tab)
}

export interface LockVerifyParams {
  tenantId:   string;
  entityName: string;
  recordId:   string;
  lockedBy:   string;
  lockToken:  string;
}

export type LockVerifyReason = "not_found" | "expired" | "wrong_owner" | "wrong_token";

export interface LockVerifyResult {
  valid:    boolean;
  reason?:  LockVerifyReason;
}

export interface LockRenewParams {
  tenantId:   string;
  entityName: string;
  recordId:   string;
  lockedBy:   string;
  lockToken:  string;
  ttlSeconds?: number;
}

export interface LockRenewResult {
  renewed:   boolean;
  expiresAt?: string;
  reason?:   LockVerifyReason;
}

export interface LockStatusResult {
  locked:      boolean;
  lockedBy?:   string;
  expiresAt?:  string;
  acquiredAt?: string;
  sessionId?:  string;
  isExpired?:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  return (
    (typeof e["code"] === "string" && e["code"] === "23505") ||
    (typeof e["message"] === "string" && e["message"].includes("unique") && e["message"].includes("rel_one_lock_per_doc"))
  );
}

// ── acquireLock ───────────────────────────────────────────────────────────────

/**
 * Atomically acquires an edit-session lock for the given aggregate root.
 *
 * Algorithm (inside a transaction):
 *   1. DELETE any expired lock for this (tenant, entity, record) triple.
 *   2. INSERT a new lock row.
 *   3. If step 2 hits the UNIQUE constraint, a valid lock already exists —
 *      fetch its holder and return acquired=false.
 *
 * DB time (now()) is used for acquired_at and expires_at to avoid app-server
 * clock drift when API pods scale horizontally.
 */
export async function acquireLock(
  db:     AnyDb,
  params: LockAcquireParams,
): Promise<LockAcquireResult> {
  const { tenantId, entityName, recordId, lockedBy, sessionId, lockReason, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS } = params;
  const token = randomUUID();

  try {
    const row = await db.transaction().execute(async (trx) => {
      // Evict expired lock if present (avoids UNIQUE conflict on stale rows)
      await sql`
        DELETE FROM control.record_edit_lock
         WHERE tenant_id              = ${tenantId}
           AND aggregate_entity_name  = ${entityName}
           AND aggregate_record_id    = ${recordId}::uuid
           AND expires_at             < now()
      `.execute(trx);

      // Acquire — UNIQUE constraint catches simultaneous acquires
      const inserted = await sql<{
        lock_token: string;
        expires_at: string;
      }>`
        INSERT INTO control.record_edit_lock
          (tenant_id, aggregate_entity_name, aggregate_record_id,
           locked_by, lock_token, session_id, lock_reason,
           acquired_at, expires_at, last_heartbeat_at)
        VALUES
          (${tenantId}, ${entityName}, ${recordId}::uuid,
           ${lockedBy}::uuid, ${token},
           ${sessionId ?? null}, ${lockReason ?? null},
           now(), now() + (${ttlSeconds} || ' seconds')::interval, now())
        RETURNING lock_token, expires_at
      `.execute(trx);

      return inserted.rows[0] ?? null;
    });

    if (!row) return { acquired: false };

    return {
      acquired:  true,
      lockToken: row.lock_token,
      expiresAt: new Date(row.expires_at).toISOString(),
    };

  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Another valid lock exists — fetch it so the UI can show who holds it
    const existing = await sql<{
      locked_by: string;
      expires_at: string;
    }>`
      SELECT locked_by, expires_at
        FROM control.record_edit_lock
       WHERE tenant_id             = ${tenantId}
         AND aggregate_entity_name = ${entityName}
         AND aggregate_record_id   = ${recordId}::uuid
    `.execute(db);

    const holder = existing.rows[0];
    return {
      acquired:       false,
      expiresAt:      holder ? new Date(holder.expires_at).toISOString() : undefined,
      lockedBy:       holder?.locked_by,
      isLockedBySelf: holder?.locked_by === lockedBy,
    };
  }
}

// ── verifyLock ────────────────────────────────────────────────────────────────

/**
 * Validates that the caller holds a valid, non-expired lock with the correct token.
 * Called before every save / child-record mutation.
 */
export async function verifyLock(
  db:     AnyDb,
  params: LockVerifyParams,
): Promise<LockVerifyResult> {
  const { tenantId, entityName, recordId, lockedBy, lockToken } = params;

  const row = await sql<{
    locked_by:  string;
    lock_token: string;
    expires_at: string;
  }>`
    SELECT locked_by, lock_token, expires_at
      FROM control.record_edit_lock
     WHERE tenant_id             = ${tenantId}
       AND aggregate_entity_name = ${entityName}
       AND aggregate_record_id   = ${recordId}::uuid
  `.execute(db);

  const lock = row.rows[0];
  if (!lock)                           return { valid: false, reason: "not_found"    };
  if (new Date(lock.expires_at) < new Date()) return { valid: false, reason: "expired"     };
  if (lock.locked_by !== lockedBy)     return { valid: false, reason: "wrong_owner"  };
  if (lock.lock_token !== lockToken)   return { valid: false, reason: "wrong_token"  };

  return { valid: true };
}

// ── renewLock ─────────────────────────────────────────────────────────────────

/**
 * Extends the lock expiry. Called by the frontend heartbeat every 30 s.
 * Verifies ownership before renewing.
 */
export async function renewLock(
  db:     AnyDb,
  params: LockRenewParams,
): Promise<LockRenewResult> {
  const { tenantId, entityName, recordId, lockedBy, lockToken, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS } = params;

  const verify = await verifyLock(db, { tenantId, entityName, recordId, lockedBy, lockToken });
  if (!verify.valid) return { renewed: false, reason: verify.reason };

  const updated = await sql<{ expires_at: string }>`
    UPDATE control.record_edit_lock
       SET expires_at        = now() + (${ttlSeconds} || ' seconds')::interval,
           last_heartbeat_at = now()
     WHERE tenant_id             = ${tenantId}
       AND aggregate_entity_name = ${entityName}
       AND aggregate_record_id   = ${recordId}::uuid
       AND lock_token            = ${lockToken}
    RETURNING expires_at
  `.execute(db);

  const row = updated.rows[0];
  return { renewed: !!row, expiresAt: row ? new Date(row.expires_at).toISOString() : undefined };
}

// ── releaseLock ───────────────────────────────────────────────────────────────

/**
 * Releases the lock. The caller must present a matching lock_token.
 * Silent no-op when the lock does not exist (idempotent).
 */
export async function releaseLock(
  db:     AnyDb,
  params: { tenantId: string; entityName: string; recordId: string; lockedBy: string; lockToken: string },
): Promise<void> {
  const { tenantId, entityName, recordId, lockedBy, lockToken } = params;
  await sql`
    DELETE FROM control.record_edit_lock
     WHERE tenant_id             = ${tenantId}
       AND aggregate_entity_name = ${entityName}
       AND aggregate_record_id   = ${recordId}::uuid
       AND locked_by             = ${lockedBy}::uuid
       AND lock_token            = ${lockToken}
  `.execute(db);
}

// ── forceReleaseLock ──────────────────────────────────────────────────────────

/**
 * Admin force-release. No token check. Caller must have verified the
 * records.lock.force_release permission before invoking.
 */
export async function forceReleaseLock(
  db:     AnyDb,
  params: { tenantId: string; entityName: string; recordId: string },
): Promise<void> {
  const { tenantId, entityName, recordId } = params;
  await sql`
    DELETE FROM control.record_edit_lock
     WHERE tenant_id             = ${tenantId}
       AND aggregate_entity_name = ${entityName}
       AND aggregate_record_id   = ${recordId}::uuid
  `.execute(db);
}

// ── getLockStatus ─────────────────────────────────────────────────────────────

/**
 * Returns the current lock state for a record. Used by GET /lock and the
 * read-only lock banner in the UI.
 */
export async function getLockStatus(
  db:     AnyDb,
  params: { tenantId: string; entityName: string; recordId: string },
): Promise<LockStatusResult> {
  const { tenantId, entityName, recordId } = params;

  const row = await sql<{
    locked_by:  string;
    expires_at: string;
    acquired_at: string;
    session_id:  string | null;
  }>`
    SELECT locked_by, expires_at, acquired_at, session_id
      FROM control.record_edit_lock
     WHERE tenant_id             = ${tenantId}
       AND aggregate_entity_name = ${entityName}
       AND aggregate_record_id   = ${recordId}::uuid
  `.execute(db);

  const lock = row.rows[0];
  if (!lock) return { locked: false };

  const isExpired = new Date(lock.expires_at) < new Date();
  return {
    locked:     !isExpired,
    lockedBy:   lock.locked_by,
    expiresAt:  new Date(lock.expires_at).toISOString(),
    acquiredAt: new Date(lock.acquired_at).toISOString(),
    sessionId:  lock.session_id ?? undefined,
    isExpired,
  };
}

// ── resolveConcurrencyPolicy ──────────────────────────────────────────────────

export interface ConcurrencyPolicy {
  strategy:        "none" | "version_only" | "lease_plus_version";
  rollout:         "observe" | "optional" | "enforced";
  versionColumn:   string;
  lockTtlSeconds:  number;
  heartbeatSeconds: number;
}

const POLICY_DEFAULTS: ConcurrencyPolicy = {
  strategy:        "none",
  rollout:         "observe",
  versionColumn:   "row_version",
  lockTtlSeconds:  DEFAULT_LOCK_TTL_SECONDS,
  heartbeatSeconds: DEFAULT_HEARTBEAT_SECONDS,
};

function defaultConcurrencyPolicy(
  defaults?: Partial<Pick<ConcurrencyPolicy, "lockTtlSeconds" | "heartbeatSeconds">>,
): ConcurrencyPolicy {
  return {
    ...POLICY_DEFAULTS,
    lockTtlSeconds:  defaults?.lockTtlSeconds  ?? POLICY_DEFAULTS.lockTtlSeconds,
    heartbeatSeconds: defaults?.heartbeatSeconds ?? POLICY_DEFAULTS.heartbeatSeconds,
  };
}

/**
 * Parses the raw concurrency_policy JSON from control.entity.
 * Falls back to safe defaults when the field is absent or malformed.
 * Any unknown rollout/strategy value is treated as observe/none.
 */
export function resolveConcurrencyPolicy(
  raw: unknown,
  defaults?: Partial<Pick<ConcurrencyPolicy, "lockTtlSeconds" | "heartbeatSeconds">>,
): ConcurrencyPolicy {
  const fallback = defaultConcurrencyPolicy(defaults);
  if (!raw || typeof raw !== "object") return fallback;
  const p = raw as Record<string, unknown>;

  const strategy = ["none", "version_only", "lease_plus_version"].includes(String(p["strategy"] ?? ""))
    ? (p["strategy"] as ConcurrencyPolicy["strategy"])
    : "none";

  const rollout = ["observe", "optional", "enforced"].includes(String(p["rollout"] ?? ""))
    ? (p["rollout"] as ConcurrencyPolicy["rollout"])
    : "observe";

  return {
    strategy,
    rollout,
    versionColumn:   typeof p["version_column"]    === "string" ? p["version_column"]    : "row_version",
    lockTtlSeconds:  typeof p["lock_ttl_seconds"]  === "number" ? p["lock_ttl_seconds"]  : fallback.lockTtlSeconds,
    heartbeatSeconds: typeof p["heartbeat_seconds"] === "number" ? p["heartbeat_seconds"] : fallback.heartbeatSeconds,
  };
}
