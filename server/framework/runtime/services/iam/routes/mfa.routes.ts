/**
 * IAM MFA Routes — v1.0 (Phase 5)
 *
 * Self-service MFA enrollment and step-up elevation.
 * All endpoints resolve the caller's own principal — no target principalId required.
 *
 * Enrollment (self-service):
 *   GET    /api/iam/mfa                  — list caller's enrolled methods
 *   POST   /api/iam/mfa/totp/begin       — start TOTP enrollment (returns QR + secret)
 *   POST   /api/iam/mfa/totp/verify      — complete enrollment by verifying first code
 *   DELETE /api/iam/mfa/:methodId        — disable/remove a specific MFA method
 *
 * Step-up elevation:
 *   POST   /api/iam/mfa/elevate          — verify MFA code and grant action-class elevation
 *                                          Body: { action_class, code, method_type? }
 *
 * Delegation self-service (Phase 6):
 *   GET    /api/iam/delegations/my       — list caller's given + received delegations
 *   POST   /api/iam/delegations/:id/revoke-own
 *                                        — revoke a delegation the caller created
 *                                          Requires delegation_accept step-up
 *
 * Required headers (all endpoints):
 *   Authorization: Bearer <kc_access_token>
 *   X-Org:   {tenantCode}--{entityCode}
 *   X-Realm: {realmKey}
 */

import { randomBytes } from "crypto";
import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  setCachePrivate,
} from "../../shared/route-helpers.js";
import { createStepUpService, hashDeviceToken, isDeviceTrusted, type ActionClass } from "../mfa/step-up.service.js";
import { createTotpEnrollmentService } from "../../../../../src/foundation/iam/totp-enrollment.service.js";
import { createMfaSyncService } from "../mfa/mfa-sync.service.js";
import type { CacheClient } from "../session/session.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface MfaRoutesDeps {
  db: AnyDb;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
  /** Display name shown in TOTP otpauth URI (default: "Athyper") */
  totpIssuer?: string;
  /**
   * Keycloak config required for WebAuthn AIA and sync routes.
   * When omitted, POST /iam/mfa/webauthn/start and POST /iam/mfa/sync return 501.
   */
  kc?: {
    /** KC base URL without trailing slash, e.g. "https://iam.athyper.local" */
    baseUrl: string;
    /** KC realm name, e.g. "athyper" */
    realm: string;
    /** OIDC client ID registered in KC — used for admin token (client_credentials) */
    clientId: string;
    /**
     * OIDC client ID of the web app (e.g. "neon-web").
     * Used as `client_id` in WebAuthn AIA redirect — must match the client
     * the user logged in with, otherwise KC rejects the AIA request.
     * Defaults to clientId when not set.
     */
    webClientId?: string;
    /**
     * Returns a fresh KC admin access token.
     * Use service-account client_credentials grant — never a human admin password.
     */
    getAdminToken(): Promise<string>;
  };
}

// ─── Auth helper (resolve caller's own principal) ─────────────────────────────

async function resolveCallerAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: AnyDb,
  auth: MfaRoutesDeps["auth"],
): Promise<{ sub: string; tenantId: string; principalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header with a valid tenant is required" });
    return null;
  }

  const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }

  return { sub, tenantId, principalId };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createMfaRoutes(router: Router, deps: MfaRoutesDeps): Router {
  const { db, cache, auth, logger, totpIssuer = "Athyper", kc } = deps;
  const stepUp  = createStepUpService(cache);
  const totp    = createTotpEnrollmentService(db, totpIssuer);
  const mfaSync = kc
    ? createMfaSyncService({
        db,
        kcBaseUrl: kc.baseUrl,
        getAdminToken: kc.getAdminToken,
        logger: logger as Parameters<typeof createMfaSyncService>[0]["logger"],
      })
    : null;

  // ── GET /api/iam/mfa ───────────────────────────────────────────────────────
  // List the caller's enrolled MFA methods. Does not expose credential_hash.
  router.get("/iam/mfa", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const methods = await db
        .selectFrom("control.mfa_config as mc")
        .select([
          "mc.id",
          "mc.method_type",
          "mc.is_enabled",
          "mc.is_verified",
          "mc.is_primary",
          "mc.enrolled_at",
          "mc.verified_at",
          "mc.last_used_at",
          "mc.keycloak_sync_status",
          "mc.updated_at",
        ])
        .where("mc.principal_id", "=", principalId)
        .where("mc.tenant_id", "=", tenantId)
        .orderBy("mc.method_type")
        .execute();

      setCachePrivate(res, 0); // no cache — security-sensitive
      res.json({ principal_id: principalId, methods });
    } catch (err) {
      logger?.error("mfa_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/mfa/totp/begin ───────────────────────────────────────────
  // Start TOTP enrollment. Returns otpauth URI and QR SVG for display.
  // Requires security_change step-up if the caller already has an active TOTP method
  // (re-enrollment requires step-up to prevent unauthorized takeover).
  router.post("/iam/mfa/totp/begin", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      // Check elevation first (avoids TOCTOU: elevation state checked before DB query)
      const elevated = await stepUp.isElevated(sub, "security_change");

      // Require step-up if there is already an active TOTP method (re-enrollment)
      const existingTotp = await db
        .selectFrom("control.mfa_config as mc")
        .select("mc.id")
        .where("mc.principal_id", "=", principalId)
        .where("mc.tenant_id", "=", tenantId)
        .where("mc.method_type", "=", "totp")
        .where("mc.is_enabled", "=", true)
        .where("mc.is_verified", "=", true)
        .executeTakeFirst();

      if (existingTotp && !elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "security_change",
          message: "Re-enrolling TOTP requires step-up MFA. Complete a security_change challenge first.",
        });
        return;
      }

      // Get account label (email) for the otpauth URI
      const profileRow = await db
        .selectFrom("master.principal as p")
        .select("p.login_email")
        .where("p.id", "=", principalId)
        .executeTakeFirst();

      const accountLabel = (profileRow?.login_email as string | null | undefined) ?? principalId;

      const result = await totp.beginEnrollment(principalId, tenantId, accountLabel, principalId);

      // Return secret + QR but not the raw bytes
      setCachePrivate(res, 0);
      res.status(201).json({
        mfa_config_id: result.mfaConfigId,
        secret_base32: result.secretBase32,
        otpauth_uri:   result.otpauthUri,
        qr_svg:        result.qrSvg,
      });
    } catch (err) {
      logger?.error("mfa_totp_begin_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/mfa/totp/verify ──────────────────────────────────────────
  // Verify the first TOTP code to complete enrollment.
  // Body: { mfa_config_id: string, code: string }
  router.post("/iam/mfa/totp/verify", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId } = caller;

      const body = req.body as { mfa_config_id?: string; code?: string };
      if (!body.mfa_config_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'mfa_config_id' is required" });
        return;
      }
      if (!body.code?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'code' is required" });
        return;
      }

      const result = await totp.verifyEnrollment(
        body.mfa_config_id,
        tenantId,
        body.code.trim(),
        caller.principalId,
      );

      if (!result.valid) {
        res.status(422).json({ error: "INVALID_CODE", message: "TOTP code is incorrect or enrollment has already been completed" });
        return;
      }

      setCachePrivate(res, 0);
      res.json({ mfa_config_id: result.mfaConfigId, enrolled: true });
    } catch (err) {
      logger?.error("mfa_totp_verify_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/mfa/:methodId ──────────────────────────────────────────
  // Disable and remove an MFA method. Requires security_change step-up.
  router.delete("/iam/mfa/:methodId", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      // Removing MFA always requires step-up (verified via a live code first)
      const elevated = await stepUp.isElevated(sub, "security_change");
      if (!elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "security_change",
          message: "Removing an MFA method requires a security_change step-up.",
        });
        return;
      }

      const methodId = req.params.methodId as string;

      // Verify ownership — method must belong to this principal + tenant
      const method = await db
        .selectFrom("control.mfa_config as mc")
        .select(["mc.id", "mc.method_type"])
        .where("mc.id", "=", methodId)
        .where("mc.principal_id", "=", principalId)
        .where("mc.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!method) {
        res.status(404).json({ error: "METHOD_NOT_FOUND", message: `MFA method '${methodId}' not found` });
        return;
      }

      // For WebAuthn, revoke from Keycloak first (KC is source of truth).
      // revokeCredential() deletes both the KC credential and the local row atomically.
      if (method.method_type === "webauthn" && mfaSync && kc) {
        try {
          await mfaSync.revokeCredential(tenantId, principalId, methodId, kc.realm);
        } catch (err) {
          logger?.error("mfa_webauthn_kc_revoke_failed", { methodId, err: String(err) });
          res.status(502).json({ error: "KC_UNAVAILABLE", message: "Failed to revoke credential from Keycloak. Try again." });
          return;
        }
      } else {
        await db
          .deleteFrom("control.mfa_config")
          .where("id", "=", methodId)
          .where("principal_id", "=", principalId)
          .where("tenant_id", "=", tenantId)
          .execute();
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("mfa_delete_method_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/mfa/elevate ──────────────────────────────────────────────
  // Verify a live MFA code and grant a step-up elevation token.
  // Called by the client after receiving a 403 STEP_UP_REQUIRED response.
  // Body: { action_class: ActionClass, code: string, method_type?: string }
  router.post("/iam/mfa/elevate", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      const body = req.body as { action_class?: string; code?: string; method_type?: string };
      if (!body.action_class) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'action_class' is required" });
        return;
      }
      if (!body.code?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'code' is required" });
        return;
      }

      const validActionClasses: ActionClass[] = [
        "iam_admin", "tenant_settings", "delegation_accept",
        "payment_release", "security_change",
      ];
      if (!validActionClasses.includes(body.action_class as ActionClass)) {
        res.status(400).json({ error: "INVALID_VALUE", message: `'action_class' must be one of: ${validActionClasses.join(", ")}` });
        return;
      }

      // Verify the provided TOTP code against the caller's active TOTP enrollment
      const methodType = body.method_type ?? "totp";
      if (methodType !== "totp") {
        // Placeholder: extend for email/SMS OTP in future phases
        res.status(400).json({ error: "UNSUPPORTED_METHOD", message: "Only 'totp' method is currently supported for step-up" });
        return;
      }

      const valid = await totp.verifyCode(principalId, tenantId, body.code.trim());
      if (!valid) {
        res.status(422).json({ error: "INVALID_CODE", message: "MFA code is incorrect" });
        return;
      }

      await stepUp.grantElevation(sub, body.action_class as ActionClass);

      setCachePrivate(res, 0);
      res.json({ elevated: true, action_class: body.action_class, ttl_sec: 600 });
    } catch (err) {
      logger?.error("mfa_elevate_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/delegations/my ───────────────────────────────────────────
  // List the caller's given and received delegations (all statuses).
  // Includes counterparty name for display.
  router.get("/iam/delegations/my", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { principalId, tenantId } = caller;

      const [given, received] = await Promise.all([
        db.selectFrom("master.delegation_grant as d")
          .leftJoin("master.principal as delegate", "delegate.id", "d.delegate_id")
          .select([
            "d.id", "d.delegate_id", "d.scope_type", "d.scope_ref",
            "d.permissions", "d.reason", "d.expires_at", "d.is_revoked",
            "d.revoked_at", "d.revoke_reason", "d.created_at",
            "delegate.name as delegate_name",
          ])
          .where("d.tenant_id", "=", tenantId)
          .where("d.delegator_id", "=", principalId)
          .orderBy("d.created_at", "desc")
          .execute(),
        db.selectFrom("master.delegation_grant as d")
          .leftJoin("master.principal as delegator", "delegator.id", "d.delegator_id")
          .select([
            "d.id", "d.delegator_id", "d.scope_type", "d.scope_ref",
            "d.permissions", "d.reason", "d.expires_at", "d.is_revoked",
            "d.revoked_at", "d.revoke_reason", "d.created_at",
            "delegator.name as delegator_name",
          ])
          .where("d.tenant_id", "=", tenantId)
          .where("d.delegate_id", "=", principalId)
          .orderBy("d.created_at", "desc")
          .execute(),
      ]);

      setCachePrivate(res, 0);
      res.json({ given, received });
    } catch (err) {
      logger?.error("delegation_my_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/delegations/my ──────────────────────────────────────────
  // Self-service: create a delegation where the caller is the delegator.
  // Requires delegation_accept step-up.
  // Body: { delegate_id, scope_type, scope_ref?, permissions[], expires_at, reason? }
  router.post("/iam/delegations/my", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      const elevated = await stepUp.isElevated(sub, "delegation_accept");
      if (!elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "delegation_accept",
          message: "Creating a delegation requires a delegation_accept step-up.",
        });
        return;
      }

      interface SelfDelegationBody {
        delegate_id?: string;
        scope_type?: string;
        scope_ref?: string | null;
        permissions?: string[];
        expires_at?: string;
        reason?: string | null;
      }
      const body = req.body as SelfDelegationBody;

      if (!body.delegate_id?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'delegate_id' is required" });
        return;
      }
      if (!body.scope_type?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'scope_type' is required" });
        return;
      }
      const validScopeTypes = ["task", "entity", "workflow", "module", "company_code"];
      if (!validScopeTypes.includes(body.scope_type)) {
        res.status(400).json({ error: "INVALID_VALUE", message: `'scope_type' must be one of: ${validScopeTypes.join(", ")}` });
        return;
      }
      if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'permissions' must be a non-empty array" });
        return;
      }
      if (!body.expires_at) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'expires_at' is required" });
        return;
      }
      const expiresAt = new Date(body.expires_at);
      if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        res.status(400).json({ error: "INVALID_VALUE", message: "'expires_at' must be a future date" });
        return;
      }
      if (body.delegate_id === principalId) {
        res.status(400).json({ error: "INVALID_VALUE", message: "Cannot delegate to yourself" });
        return;
      }

      const delegateExists = await db
        .selectFrom("master.principal as p")
        .select("p.id")
        .where("p.id", "=", body.delegate_id)
        .where("p.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!delegateExists) {
        res.status(404).json({ error: "DELEGATE_NOT_FOUND", message: `Principal '${body.delegate_id}' not found in this tenant` });
        return;
      }

      const delegation = await db
        .insertInto("master.delegation_grant")
        .values({
          tenant_id:    tenantId,
          delegator_id: principalId,
          delegate_id:  body.delegate_id,
          scope_type:   body.scope_type,
          scope_ref:    body.scope_ref ?? null,
          permissions:  body.permissions as never,
          expires_at:   expiresAt,
          reason:       body.reason ?? null,
          is_revoked:   false,
          created_by:   principalId,
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();

      setCachePrivate(res, 0);
      res.status(201).json({ delegation_id: delegation.id, created_at: delegation.created_at });
    } catch (err) {
      logger?.error("delegation_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/delegations/:id/revoke-own ──────────────────────────────
  // Self-service: revoke a delegation the caller created.
  // Requires delegation_accept step-up. Validates caller is the delegator.
  router.post("/iam/delegations/:id/revoke-own", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      const elevated = await stepUp.isElevated(sub, "delegation_accept");
      if (!elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "delegation_accept",
          message: "Revoking a delegation requires a delegation_accept step-up.",
        });
        return;
      }

      const grantId = req.params.id as string;

      const delegation = await db
        .selectFrom("master.delegation_grant as d")
        .select(["d.id", "d.is_revoked", "d.delegator_id"])
        .where("d.id", "=", grantId)
        .where("d.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!delegation) {
        res.status(404).json({ error: "DELEGATION_NOT_FOUND", message: `Delegation '${grantId}' not found` });
        return;
      }
      if (delegation.delegator_id !== principalId) {
        res.status(403).json({ error: "FORBIDDEN", message: "You can only revoke delegations you created" });
        return;
      }
      if (delegation.is_revoked) {
        res.status(409).json({ error: "ALREADY_REVOKED", message: "Delegation is already revoked" });
        return;
      }

      await db
        .updateTable("master.delegation_grant")
        .set({
          is_revoked:    true,
          revoked_at:    sql`now()`,
          revoked_by:    principalId,
          revoke_reason: "Revoked by delegator (self-service)",
          updated_at:    sql`now()`,
          updated_by:    principalId,
        })
        .where("id", "=", grantId)
        .where("tenant_id", "=", tenantId)
        .execute();

      setCachePrivate(res, 0);
      res.status(200).json({ delegation_id: grantId, revoked: true });
    } catch (err) {
      logger?.error("delegation_revoke_own_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/trusted-devices ──────────────────────────────────────────
  // List the caller's trusted devices (active, non-expired, non-revoked).
  // Used to show "trusted devices" panel in Security settings.
  router.get("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const devices = await db
        .selectFrom("master.trusted_device as td")
        .select([
          "td.id",
          "td.device_name",
          "td.user_agent",
          "td.ip_address",
          "td.last_seen_at",
          "td.expires_at",
          "td.created_at",
        ])
        .where("td.tenant_id",    "=", tenantId)
        .where("td.principal_id", "=", principalId)
        .where("td.is_revoked",   "=", false)
        .where("td.expires_at",   ">", new Date())
        .orderBy("td.last_seen_at", "desc")
        .execute();

      setCachePrivate(res, 0);
      res.json({ devices });
    } catch (err) {
      logger?.error("trusted_devices_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/trusted-devices ─────────────────────────────────────────
  // Issue a new trusted-device token after a successful step-up elevation.
  // Returns the raw token once (as a Set-Cookie header) — never stored in DB.
  // The client receives a 30-day cookie; the server stores only its SHA-256 hash.
  //
  // Requires security_change step-up — the user must have just proven MFA.
  // Body: { device_name?: string, ttl_days?: number (default 30, max 90) }
  router.post("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      // Require security_change step-up — proves the user just completed MFA
      const elevated = await stepUp.isElevated(sub, "security_change");
      if (!elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "security_change",
          message: "Registering a trusted device requires a security_change step-up.",
        });
        return;
      }

      interface TrustedDeviceBody {
        device_name?: string;
        ttl_days?: number;
      }
      const body = req.body as TrustedDeviceBody;
      const ttlDays = Math.min(Math.max(1, body.ttl_days ?? 30), 90);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      // Generate opaque 32-byte random token — only this value goes to the client
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashDeviceToken(rawToken);

      const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
      const ipAddress = (req.ip ?? req.socket.remoteAddress ?? null);

      const row = await db
        .insertInto("master.trusted_device")
        .values({
          tenant_id:         tenantId,
          principal_id:      principalId,
          device_token_hash: tokenHash,
          device_name:       body.device_name?.trim() || null,
          user_agent:        userAgent,
          ip_address:        ipAddress,
          last_seen_at:      new Date(),
          expires_at:        expiresAt,
          is_revoked:        false,
          created_by:        principalId,
        })
        .returning(["id", "created_at", "expires_at"])
        .executeTakeFirstOrThrow() as { id: string; created_at: Date; expires_at: Date };

      // Set HttpOnly secure cookie — 64-hex chars (32 bytes)
      const cookieMaxAge = ttlDays * 24 * 60 * 60; // seconds
      res.setHeader(
        "Set-Cookie",
        `td_token=${rawToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${cookieMaxAge}`,
      );

      setCachePrivate(res, 0);
      res.status(201).json({
        device_id:  row.id,
        expires_at: row.expires_at,
        // raw_token intentionally NOT included in response body — cookie only
      });
    } catch (err) {
      logger?.error("trusted_device_register_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/trusted-devices/verify ──────────────────────────────────
  // Verify a raw td_token from a cookie — used by the login callback to bypass
  // MFA challenge for already-trusted devices.
  // Body: { token: string }
  router.post("/iam/trusted-devices/verify", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const { token } = req.body as { token?: string };
      if (!token?.trim()) {
        res.status(400).json({ error: "MISSING_TOKEN" });
        return;
      }

      const trusted = await isDeviceTrusted(db, tenantId, principalId, token, "security_change");
      if (!trusted) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Device token not recognised or expired" });
        return;
      }

      setCachePrivate(res, 0);
      res.json({ trusted: true });
    } catch (err) {
      logger?.error("trusted_device_verify_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/trusted-devices/:id ───────────────────────────────────
  // Revoke a single trusted device. Does not require step-up (revocation = safety action).
  router.delete("/iam/trusted-devices/:id", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const deviceId = req.params.id as string;

      const device = await db
        .selectFrom("master.trusted_device as td")
        .select("td.id")
        .where("td.id",           "=", deviceId)
        .where("td.tenant_id",    "=", tenantId)
        .where("td.principal_id", "=", principalId)
        .executeTakeFirst() as { id: string } | undefined;

      if (!device) {
        res.status(404).json({ error: "NOT_FOUND", message: `Trusted device '${deviceId}' not found` });
        return;
      }

      await db
        .updateTable("master.trusted_device")
        .set({
          is_revoked: true,
          revoked_at: sql`now()`,
          updated_at: sql`now()`,
          updated_by: principalId,
        })
        .where("id",           "=", deviceId)
        .where("tenant_id",    "=", tenantId)
        .where("principal_id", "=", principalId)
        .execute();

      setCachePrivate(res, 0);
      res.status(200).json({ device_id: deviceId, revoked: true });
    } catch (err) {
      logger?.error("trusted_device_revoke_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/trusted-devices ───────────────────────────────────────
  // Panic button: revoke ALL of the caller's trusted devices at once.
  // Use when account compromise is suspected. Does not require step-up.
  router.delete("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const result = await db
        .updateTable("master.trusted_device")
        .set({
          is_revoked: true,
          revoked_at: sql`now()`,
          updated_at: sql`now()`,
          updated_by: principalId,
        })
        .where("tenant_id",    "=", tenantId)
        .where("principal_id", "=", principalId)
        .where("is_revoked",   "=", false)
        .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

      const revoked = Number(result?.numUpdatedRows ?? 0);

      setCachePrivate(res, 0);
      res.status(200).json({ revoked_count: revoked });
    } catch (err) {
      logger?.error("trusted_device_revoke_all_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/mfa/webauthn/start ──────────────────────────────────────
  // Begin WebAuthn enrollment via Keycloak AIA (Application-Initiated Action).
  // Returns a redirect URL pointing to KC's hosted WebAuthn registration UI.
  // After the user completes registration KC redirects to redirect_uri.
  // The client must then call POST /api/iam/mfa/sync to pull the new credential.
  //
  // Body: { redirect_uri: string }
  // Response: { redirect_url: string }
  router.post("/iam/mfa/webauthn/start", (async (req, res, next) => {
    try {
      if (!mfaSync || !kc) {
        res.status(501).json({
          error: "NOT_CONFIGURED",
          message: "WebAuthn enrollment requires Keycloak config (kc.baseUrl). Not configured on this server.",
        });
        return;
      }

      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;

      const body = req.body as { redirect_uri?: string };
      if (!body.redirect_uri?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'redirect_uri' is required" });
        return;
      }

      // Validate redirect_uri is a valid absolute URL (prevent open-redirect)
      let parsedRedirect: URL;
      try {
        parsedRedirect = new URL(body.redirect_uri);
      } catch {
        res.status(400).json({ error: "INVALID_VALUE", message: "'redirect_uri' must be a valid absolute URL" });
        return;
      }
      if (!["http:", "https:"].includes(parsedRedirect.protocol)) {
        res.status(400).json({ error: "INVALID_VALUE", message: "'redirect_uri' must use http or https" });
        return;
      }

      const redirectUrl = mfaSync.buildAiaUrl(
        kc.realm,
        kc.webClientId ?? kc.clientId, // AIA must use the web client the user logged in with
        body.redirect_uri,
        "webauthn-register",
      );

      setCachePrivate(res, 0);
      res.json({ redirect_url: redirectUrl });
    } catch (err) {
      logger?.error("mfa_webauthn_start_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/mfa/sync ─────────────────────────────────────────────────
  // Pull the caller's current MFA credentials from Keycloak and reconcile with
  // the local control.mfa_config mirror.
  // Call this after the user returns from a KC AIA flow (WebAuthn enrollment).
  // Response: { synced: number, drifted: number }
  router.post("/iam/mfa/sync", (async (req, res, next) => {
    try {
      if (!mfaSync || !kc) {
        res.status(501).json({
          error: "NOT_CONFIGURED",
          message: "MFA sync requires Keycloak config (kc.baseUrl). Not configured on this server.",
        });
        return;
      }

      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      // Pull WebAuthn credentials from KC into app mirror
      const result = await mfaSync.syncFromKC(tenantId, principalId, kc.realm);

      // Also push any pending TOTP secrets to KC (app → KC direction)
      const totpResult = await mfaSync.syncPendingTotp(tenantId, principalId, kc.realm);

      setCachePrivate(res, 0);
      res.json({
        synced:       result.synced + totpResult.synced,
        drifted:      result.drifted,
        totp_synced:  totpResult.synced,
        totp_failed:  totpResult.failed,
      });
    } catch (err) {
      logger?.error("mfa_sync_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
