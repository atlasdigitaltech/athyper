/**
 * IAM Step-Up MFA Service — v2.0
 *
 * Manages short-lived MFA elevation state in Redis. Step-up MFA protects
 * high-risk write operations (IAM admin, tenant settings, delegation accept,
 * payment release, security changes) without requiring a full re-authentication.
 *
 * Flow:
 *   1. Service calls requireStepUp(cache, binding, res)
 *   2. If elevation key missing → 403 { error: 'STEP_UP_REQUIRED', action_class }
 *   3. Client redirects user to MFA challenge UI
 *   4. After Keycloak completes the step-up flow, the BFF calls
 *      POST /api/iam/mfa/elevate, which records the verified Keycloak session
 *      binding and normalized assurance evidence.
 *   5. Client retries the original request — elevation key now present → proceeds
 *
 * Redis key: `mfa_elevation:v2:{sub}:{tenant_id}:{session_hash}:{action_class}`
 * Default TTL: 600 seconds (10 minutes)
 *
 * Logout clears all mfa_elevation:v2:{sub}:* keys (handled in logout.routes.ts).
 *
 * Binding rule: No high-risk write endpoint may proceed without calling
 * requireStepUp() with the current verified Keycloak session binding. An
 * elevation cannot be replayed in another session, tenant, or action class.
 */

import { createHash } from "crypto";
import type { Response } from "express";
import type { CacheClient } from "../session/session.service.js";
import type { Kysely } from "kysely";
import {
  isFreshAuthentication,
  meetsAssurance,
  normalizeFederatedAssurance,
  type NormalizedFederatedAssurance,
} from "@athyper/auth-common";

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
  | "atlas_support"     // explicit tenant-bound Admin support session
  | "metadata_release"  // publish, rollback, or retire a Meta Entity release
  | "payment_release"   // financial payment approval actions
  | "security_change";  // password/MFA changes, API key rotation

/** Default elevation TTL: 10 minutes. */
export const STEP_UP_TTL_SEC = 600;

const TRUSTED_DEVICE_ALLOWED_ACTIONS: ReadonlySet<ActionClass> = new Set([
  "tenant_settings",
]);

export interface StepUpBinding {
  subject: string;
  tenantId: string;
  sessionId: string;
  actionClass: ActionClass;
  assurance: Pick<NormalizedFederatedAssurance,
    "assuranceLevel" | "keycloakAssuranceLevel" | "authenticationTime" | "keycloakMfaSatisfied" | "keycloakPhishingResistant">;
}

/**
 * Build a binding from claims that were already verified by Keycloak's JWT
 * verifier. `sid`/`session_state` are issuer-controlled; arbitrary request
 * headers are deliberately not accepted as a session identifier.
 */
export function createStepUpBinding(
  claims: Record<string, unknown>,
  subject: string,
  tenantId: string,
  actionClass: ActionClass,
): StepUpBinding | null {
  const sessionId = [claims.sid, claims.session_state]
    .find((value): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{8,256}$/.test(value.trim()))
    ?.trim();
  if (!sessionId || !subject || !tenantId) return null;

  const assurance = normalizeFederatedAssurance(claims);
  return {
    subject,
    tenantId,
    sessionId,
    actionClass,
    assurance: {
      assuranceLevel: assurance.assuranceLevel,
      keycloakAssuranceLevel: assurance.keycloakAssuranceLevel,
      authenticationTime: assurance.authenticationTime,
      keycloakMfaSatisfied: assurance.keycloakMfaSatisfied,
      keycloakPhishingResistant: assurance.keycloakPhishingResistant,
    },
  };
}

/**
 * Only fresh assurance explicitly satisfied by Keycloak may mint an elevation.
 * A federated provider's MFA claim is identity evidence, not Athyper step-up.
 */
export function hasFreshKeycloakStepUpAssurance(
  claims: Record<string, unknown>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const assurance = normalizeFederatedAssurance(claims);
  const keycloakEvidenceSource = assurance.source !== "federated"
    || String(claims["athyper.mfa_source"] ?? claims["mfa_source"] ?? "").toLowerCase() === "keycloak";
  return keycloakEvidenceSource
    && assurance.keycloakMfaSatisfied
    && meetsAssurance({ assuranceLevel: assurance.keycloakAssuranceLevel }, "aal2")
    && isFreshAuthentication(assurance, nowSeconds, 600);
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface StepUpService {
  /**
   * Returns true if the principal currently holds an elevation token for the
   * given action class. Returns false otherwise — the caller must send a 403
   * (or call requireStepUp which does it automatically).
   */
  isElevated(binding: StepUpBinding): Promise<boolean>;

  /**
   * Records a successful MFA challenge result by writing the elevation key.
   * Called by the MFA challenge completion handler (POST /api/iam/mfa/elevate).
   *
   * @param ttlSec  Override the default 600s TTL. Shorter values for sensitive actions.
   */
  grantElevation(binding: StepUpBinding, ttlSec?: number): Promise<void>;

  /**
   * Removes the elevation key — called on explicit revocation or logout.
   * Logout handler uses cache.scan to clear all action classes in bulk.
   */
  revokeElevation(binding: StepUpBinding): Promise<void>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStepUpService(cache: CacheClient): StepUpService {
  function sessionHash(sessionId: string): string {
    return createHash("sha256").update(sessionId).digest("hex");
  }

  function elevationKey(binding: StepUpBinding): string {
    return `mfa_elevation:v2:${binding.subject}:${binding.tenantId}:${sessionHash(binding.sessionId)}:${binding.actionClass}`;
  }

  async function isElevated(binding: StepUpBinding): Promise<boolean> {
    const value = await cache.get(elevationKey(binding));
    if (value === null) return false;
    try {
      const stored = JSON.parse(value) as { subject?: string; tenantId?: string; sessionHash?: string; actionClass?: string };
      return stored.subject === binding.subject
        && stored.tenantId === binding.tenantId
        && stored.sessionHash === sessionHash(binding.sessionId)
        && stored.actionClass === binding.actionClass;
    } catch {
      // Do not accept malformed or pre-v2 values.
      return false;
    }
  }

  async function grantElevation(binding: StepUpBinding, ttlSec: number = STEP_UP_TTL_SEC): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      version: 2,
      subject: binding.subject,
      tenantId: binding.tenantId,
      sessionHash: sessionHash(binding.sessionId),
      actionClass: binding.actionClass,
      assuranceLevel: binding.assurance.keycloakAssuranceLevel,
      phishingResistant: binding.assurance.keycloakPhishingResistant,
      authenticatedAt: binding.assurance.authenticationTime,
      grantedAt: now,
      expiresAt: now + ttlSec,
    });
    await cache.set(elevationKey(binding), payload, "EX", ttlSec);
  }

  async function revokeElevation(binding: StepUpBinding): Promise<void> {
    await cache.del(elevationKey(binding));
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
 *   const elevated = await requireStepUp(cache, binding, res);
 *   if (!elevated) return;
 *   // ... proceed with protected write
 */
export async function requireStepUp(
  cache: CacheClient,
  binding: StepUpBinding | null,
  res: Response,
): Promise<boolean> {
  if (binding) {
    const value = await cache.get(
      `mfa_elevation:v2:${binding.subject}:${binding.tenantId}:${createHash("sha256").update(binding.sessionId).digest("hex")}:${binding.actionClass}`,
    );
    if (value !== null) {
      try {
        const stored = JSON.parse(value) as { subject?: string; tenantId?: string; sessionHash?: string; actionClass?: string };
        if (stored.subject === binding.subject
          && stored.tenantId === binding.tenantId
          && stored.sessionHash === createHash("sha256").update(binding.sessionId).digest("hex")
          && stored.actionClass === binding.actionClass) return true;
      } catch {
        // Fail closed for malformed elevation state.
      }
    }
  }

  const actionClass = binding?.actionClass;
  if (!actionClass) {
    res.status(403).json({
      error: "STEP_UP_SESSION_REQUIRED",
      message: "A verified Keycloak session binding is required for this action.",
    });
    return false;
  }

  res.status(403).json({
    error: "STEP_UP_REQUIRED",
    action_class: actionClass,
    required_assurance: "aal2",
    session_binding: true,
    message: `This action requires Keycloak step-up verification for '${actionClass}'. Complete the challenge and retry.`,
  });
  return false;
}

// ─── Trusted-device helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/**
 * Hashes a raw device token (32-byte random hex string from the cookie) using
 * SHA-256. Only the hash is stored in authz.trusted_device.
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
 *   - The action class is explicitly eligible for remembered-device trust.
 *     IAM administration, delegation, support, payment, and security changes
 *     always require fresh step-up evidence.
 *
 * Also bumps last_seen_at so the UI can show "last seen" info.
 */
export async function isDeviceTrusted(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  rawToken: string | undefined | null,
  actionClass: ActionClass,
): Promise<boolean> {
  if (!rawToken?.trim()) return false;
  if (!TRUSTED_DEVICE_ALLOWED_ACTIONS.has(actionClass)) return false;

  const hash = hashDeviceToken(rawToken);

  const row = await db
    .selectFrom("authz.trusted_device as td")
    .select("td.id")
    .where("td.tenant_id",          "=", tenantId)
    .where("td.principal_id",       "=", principalId)
    .where("td.device_token_hash",  "=", hash)
    .where("td.revoked_at",         "is", null)
    .where("td.expires_at",         ">", new Date())
    .executeTakeFirst() as { id: string } | undefined;

  if (!row) return false;

  // Bump last_seen_at — best-effort, ignore failure
  await db
    .updateTable("authz.trusted_device")
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
export async function revokeAllElevations(cache: CacheClient, sub: string, tenantId?: string): Promise<void> {
  const pattern = `mfa_elevation:v2:${sub}:*`;

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
    "iam_admin", "tenant_settings", "delegation_accept", "atlas_support", "metadata_release",
    "payment_release", "security_change",
  ];
  await cache.del(allClasses.flatMap((ac) => [
    `mfa_elevation:v2:${sub}:*:*:${ac}`,
  ]));
}
