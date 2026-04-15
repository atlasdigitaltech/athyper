/**
 * IAM Step-Up MFA Service — v1.0
 *
 * Manages short-lived MFA elevation state in Redis. Step-up MFA protects
 * high-risk write operations (IAM admin, tenant settings, delegation accept,
 * payment release, security changes) without requiring a full re-authentication.
 *
 * Flow:
 *   1. Service calls requireStepUp(cache, sub, 'iam_admin', res)
 *   2. If elevation key missing → 403 { error: 'STEP_UP_REQUIRED', action_class }
 *   3. Client redirects user to MFA challenge UI
 *   4. After successful MFA challenge, BFF calls POST /api/iam/mfa/elevate
 *      which calls stepUpService.grantElevation(sub, actionClass)
 *   5. Client retries the original request — elevation key now present → proceeds
 *
 * Redis key: `mfa_elevation:{sub}:{action_class}`
 * Default TTL: 600 seconds (10 minutes)
 *
 * Logout clears all mfa_elevation:{sub}:* keys (handled in logout.routes.ts).
 *
 * Binding rule: No high-risk write endpoint may proceed without calling
 * requireStepUp() first. The write endpoints in operator.routes.ts enforce this.
 */

import { createHash } from "crypto";
import type { Response } from "express";
import type { CacheClient } from "../session/session.service.js";
import type { Kysely } from "kysely";

// ─── Action classes ───────────────────────────────────────────────────────────

/**
 * Distinct action classes for step-up elevation.
 * Each class has an independent Redis key — elevating for 'iam_admin' does NOT
 * grant elevation for 'payment_release'.
 */
export type ActionClass =
  | "iam_admin"         // group membership, grant management, delegation writes
  | "tenant_settings"   // tenant configuration changes
  | "delegation_accept" // accepting a delegation grant directed at the user
  | "payment_release"   // financial payment approval actions
  | "security_change";  // password/MFA changes, API key rotation

/** Default elevation TTL: 10 minutes. */
export const STEP_UP_TTL_SEC = 600;

// ─── Service interface ────────────────────────────────────────────────────────

export interface StepUpService {
  /**
   * Returns true if the principal currently holds an elevation token for the
   * given action class. Returns false otherwise — the caller must send a 403
   * (or call requireStepUp which does it automatically).
   */
  isElevated(sub: string, actionClass: ActionClass): Promise<boolean>;

  /**
   * Records a successful MFA challenge result by writing the elevation key.
   * Called by the MFA challenge completion handler (POST /api/iam/mfa/elevate).
   *
   * @param ttlSec  Override the default 600s TTL. Shorter values for sensitive actions.
   */
  grantElevation(sub: string, actionClass: ActionClass, ttlSec?: number): Promise<void>;

  /**
   * Removes the elevation key — called on explicit revocation or logout.
   * Logout handler uses cache.scan to clear all action classes in bulk.
   */
  revokeElevation(sub: string, actionClass: ActionClass): Promise<void>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStepUpService(cache: CacheClient): StepUpService {
  function elevationKey(sub: string, actionClass: ActionClass): string {
    return `mfa_elevation:${sub}:${actionClass}`;
  }

  async function isElevated(sub: string, actionClass: ActionClass): Promise<boolean> {
    const value = await cache.get(elevationKey(sub, actionClass));
    return value !== null;
  }

  async function grantElevation(
    sub: string,
    actionClass: ActionClass,
    ttlSec: number = STEP_UP_TTL_SEC,
  ): Promise<void> {
    await cache.set(elevationKey(sub, actionClass), "1", "EX", ttlSec);
  }

  async function revokeElevation(sub: string, actionClass: ActionClass): Promise<void> {
    await cache.del(elevationKey(sub, actionClass));
  }

  return { isElevated, grantElevation, revokeElevation };
}

// ─── Route guard helper ───────────────────────────────────────────────────────

/**
 * Inline route guard for write endpoints.
 *
 * Returns true if the caller holds a valid step-up elevation for the given
 * action class. Otherwise sends a 403 with STEP_UP_REQUIRED and returns false.
 *
 * Usage in route handlers:
 *   const elevated = await requireStepUp(cache, sub, 'iam_admin', res);
 *   if (!elevated) return;
 *   // ... proceed with protected write
 */
export async function requireStepUp(
  cache: CacheClient,
  sub: string,
  actionClass: ActionClass,
  res: Response,
): Promise<boolean> {
  const key = `mfa_elevation:${sub}:${actionClass}`;
  const value = await cache.get(key);
  if (value !== null) return true;

  res.status(403).json({
    error: "STEP_UP_REQUIRED",
    action_class: actionClass,
    message: `This action requires MFA step-up verification for '${actionClass}'. Complete the MFA challenge and retry.`,
  });
  return false;
}

// ─── Trusted-device helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/**
 * Hashes a raw device token (32-byte random hex string from the cookie) using
 * SHA-256. Only the hash is stored in master.trusted_device.
 */
export function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Check whether the presented device token cookie grants step-up bypass for
 * the given action class.
 *
 * Returns true only when:
 *   - A non-revoked, non-expired trusted_device row exists for (tenantId, principalId, hash)
 *   - The action class is within the allowed list for device trust
 *     (all current classes are allowed; future classes may opt out via the exclusion set)
 *
 * Also bumps last_seen_at so the UI can show "last seen" info.
 */
export async function isDeviceTrusted(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  rawToken: string | undefined | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _actionClass: ActionClass,
): Promise<boolean> {
  if (!rawToken?.trim()) return false;

  const hash = hashDeviceToken(rawToken);

  const row = await db
    .selectFrom("master.trusted_device as td")
    .select("td.id")
    .where("td.tenant_id",          "=", tenantId)
    .where("td.principal_id",       "=", principalId)
    .where("td.device_token_hash",  "=", hash)
    .where("td.is_revoked",         "=", false)
    .where("td.expires_at",         ">", new Date())
    .executeTakeFirst() as { id: string } | undefined;

  if (!row) return false;

  // Bump last_seen_at — best-effort, ignore failure
  await db
    .updateTable("master.trusted_device")
    .set({ last_seen_at: new Date() })
    .where("id", "=", row.id)
    .execute()
    .catch(() => { /* best-effort */ });

  return true;
}

/**
 * Revoke all step-up elevations for a principal (all action classes).
 * Called on logout. Uses cache.scan if available; falls back to individual deletes.
 */
export async function revokeAllElevations(cache: CacheClient, sub: string): Promise<void> {
  const pattern = `mfa_elevation:${sub}:*`;

  if (typeof cache.scan === "function") {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");
    if (keys.length > 0) await cache.del(keys);
    return;
  }

  // Fallback: delete each known action class individually
  const allClasses: ActionClass[] = [
    "iam_admin", "tenant_settings", "delegation_accept", "payment_release", "security_change",
  ];
  await cache.del(allClasses.map((ac) => `mfa_elevation:${sub}:${ac}`));
}
