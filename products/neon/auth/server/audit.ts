import "server-only";

import { createHash } from "node:crypto";

// ─── Auth Audit Event Types ─────────────────────────────────────
//
// These map 1:1 with the framework-level AuthAuditEvent enum in
// framework/runtime/src/services/platform/foundation/security/auth-audit.ts
//
// The BFF writes audit records directly to Redis (list-based log)
// for lightweight, low-latency recording. A background worker can
// drain the list into PostgreSQL core.audit_log for long-term storage.

export const AuthAuditEvent = {
  LOGIN_INITIATED: "auth.login_initiated",
  LOGIN_SUCCESS: "auth.login_success",
  LOGIN_FAILED: "auth.login_failed",
  LOGOUT: "auth.logout",
  REFRESH_SUCCESS: "auth.refresh_success",
  REFRESH_FAILED: "auth.refresh_failed",
  REFRESH_IDLE_BLOCKED: "auth.refresh_idle_blocked",
  SESSION_BINDING_MISMATCH: "auth.session_binding_mismatch",
  SESSION_DESTROYED: "auth.session_destroyed",
  IDLE_TOUCH_REJECTED: "auth.idle_touch_rejected",
  // MFA events
  MFA_VERIFY_SUCCESS: "auth.mfa_verify_success",
  MFA_VERIFY_FAILED: "auth.mfa_verify_failed",
  // Platform admin events
  PLATFORM_LOGIN_SUCCESS: "platform.login_success",
  PLATFORM_LOGIN_FAILED: "platform.login_failed",
  PLATFORM_TENANT_SWITCH: "platform.tenant_switch",
  PLATFORM_TENANT_SWITCH_FAILED: "platform.tenant_switch_failed",
  PLATFORM_LOGOUT: "platform.logout",
  // Diagnostics actions
  DIAG_CACHE_CLEAR: "diag.cache_clear",
  DIAG_AUTOFIX: "diag.autofix",
  DIAG_SESSION_REBUILD: "diag.session_rebuild",
  DIAG_PROFILE_SYNC: "diag.profile_sync",
  DIAG_REPORT_DOWNLOAD: "diag.report_download",
  DIAG_HEALTH_CHECK: "diag.health_check",
} as const;

export type AuthAuditEventType =
  (typeof AuthAuditEvent)[keyof typeof AuthAuditEvent];

// ─── Audit Record ───────────────────────────────────────────────

export interface AuthAuditRecord {
  ts: string;
  event: AuthAuditEventType;
  tenantId: string;
  userId?: string;
  /** First 8 chars of SHA-256(sid) — never log full session IDs */
  sidHash?: string;
  ip?: string;
  userAgent?: string;
  realm?: string;
  workbench?: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Hash a session ID for audit logging.
 * We log only a prefix of the hash — enough for correlation, not enough to replay.
 */
export function hashSidForAudit(sid: string): string {
  return createHash("sha256").update(sid).digest("hex").slice(0, 16);
}

// ─── Writer ─────────────────────────────────────────────────────

/**
 * Write an auth audit record to Redis.
 *
 * Storage strategy:
 *   - Key: `audit:auth:{tenantId}` (Redis LIST, capped via LTRIM)
 *   - TTL: 7 days (auto-cleanup if drain worker is down)
 *   - Records are JSON-serialized and LPUSH'd for FIFO drain
 *
 * This is best-effort — audit failures must never break auth flows.
 * If Redis is unavailable the record is silently dropped.
 *
 * @param redis - Connected Redis client (caller manages lifecycle)
 * @param record - The audit record to write
 */
export async function writeAuthAudit(
  redis: {
    lPush(key: string, value: string): Promise<unknown>;
    lTrim?(key: string, start: number, stop: number): Promise<unknown>;
  },
  record: AuthAuditRecord,
): Promise<void> {
  try {
    const key = `audit:auth:${record.tenantId}`;
    await redis.lPush(key, JSON.stringify(record));

    // Cap the list at 10,000 entries to prevent unbounded growth
    // Oldest entries (beyond 10k) are trimmed. The drain worker should
    // process faster than this to avoid data loss.
    if (redis.lTrim) {
      await redis.lTrim(key, 0, 9999);
    }
  } catch {
    // Best-effort — never let audit failures break auth flows
  }
}

/**
 * Convenience: build and write an audit record in one call.
 */
export async function emitBffAudit(
  redis: {
    lPush(key: string, value: string): Promise<unknown>;
    lTrim?(key: string, start: number, stop: number): Promise<unknown>;
  },
  event: AuthAuditEventType,
  details: Omit<AuthAuditRecord, "ts" | "event">,
): Promise<void> {
  await writeAuthAudit(redis, {
    ts: new Date().toISOString(),
    event,
    ...details,
  });
}
