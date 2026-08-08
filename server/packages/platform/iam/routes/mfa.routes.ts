/**
 * IAM MFA Routes â€” v1.0 (Phase 5)
 *
 * Self-service MFA enrollment and step-up elevation.
 * All endpoints resolve the caller's own principal â€” no target principalId required.
 *
 * Enrollment (self-service):
 *   GET    /api/iam/mfa                  â€” list caller's enrolled methods
 *   POST   /api/iam/mfa/totp/begin       â€” start Keycloak CONFIGURE_TOTP AIA
 *   DELETE /api/iam/mfa/:methodId        â€” disable/remove a specific MFA method
 *
 * Step-up elevation:
 *
 * Delegation self-service (Phase 6):
 *   GET    /api/iam/delegations/my       â€” list caller's given + received delegations
 *   POST   /api/iam/delegations/:id/revoke-own
 *                                        â€” revoke a delegation the caller created
 *                                          Requires delegation_accept step-up
 *
 * Required headers (all endpoints):
 *   Authorization: Bearer <kc_access_token>
 *   X-Org:   {tenantCode}--{entityCode}
 *   X-Realm: {realmKey}
 */

import { randomBytes } from "crypto";
import { sql } from "kysely";
import { Router, type RequestHandler } from "express";
import type { Kysely } from "kysely";
import { appendSecurityEvent } from "@athyper/svc-audit";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  setCachePrivate,
} from "@athyper/svc-shared";
import {
  createStepUpBinding,
  createStepUpService,
  hasFreshKeycloakStepUpAssurance,
  hashDeviceToken,
  type ActionClass,
} from "../mfa/step-up.service.js";
import { resolveParameterSnapshot } from "../parameters/parameter-resolver.service.js";
import { createMfaSyncService } from "../mfa/mfa-sync.service.js";
import type { CacheClient } from "../session/session.service.js";
import { incrementRateLimit } from "@athyper/svc-shared";
import type { PlaneDatabaseRegistry, RuntimePlaneKey } from "../runtime/plane-database-registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// â”€â”€â”€ Deps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MfaRoutesDeps {
  planeDatabases: PlaneDatabaseRegistry;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
  /**
   * Keycloak config required for WebAuthn AIA and sync routes.
   * When omitted, POST /iam/mfa/webauthn/start and POST /iam/mfa/sync return 501.
   */
  kc?: {
    /** KC base URL without trailing slash, e.g. "https://iam.athyper.local" */
    baseUrl: string;
    /** KC realm name, e.g. "athyper" */
    realm: string;
    /** OIDC client ID registered in KC â€” used for admin token (client_credentials) */
    clientId: string;
    /**
     * OIDC client ID of the web app (e.g. "neon-web").
     * Used as `client_id` in WebAuthn AIA redirect â€” must match the client
     * the user logged in with, otherwise KC rejects the AIA request.
     * Defaults to clientId when not set.
     */
    webClientId?: string;
    /**
     * Returns a fresh KC admin access token.
     * Use service-account client_credentials grant â€” never a human admin password.
     */
    getAdminToken(): Promise<string>;
  };
}

// â”€â”€â”€ Auth helper (resolve caller's own principal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resolveCallerAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: AnyDb,
  auth: MfaRoutesDeps["auth"],
): Promise<{ sub: string; tenantId: string; principalId: string; claims: Record<string, unknown> } | null> {
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

  const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }

  return { sub, tenantId, principalId, claims };
}

async function resolveNumericParameter(
  db: AnyDb,
  cache: CacheClient,
  tenantId: string,
  code: string,
  fallback: number,
): Promise<number> {
  try {
    const namespace = code.split(".").slice(0, 2).join(".");
    const snapshot = await resolveParameterSnapshot(db, cache, tenantId, namespace);
    const raw = snapshot.values[code];
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function trustedDeviceCookieSecurity(req: Parameters<RequestHandler>[0]): string {
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  return req.secure || forwardedProtocol === "https" || process.env.NODE_ENV === "production"
    ? "; Secure"
    : "";
}

async function enforceRateLimit(
  cache: CacheClient,
  res: Parameters<RequestHandler>[1],
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  if (typeof cache.eval !== "function" && typeof cache.incr !== "function") return true;

  const count = await incrementRateLimit(cache, key, windowSec).catch(() => 0);
  if (count === 0) return true;
  if (count <= limit) return true;

  res.setHeader("Retry-After", String(windowSec));
  res.status(429).json({
    error: "RATE_LIMITED",
    message: "Too many MFA attempts. Please wait and try again.",
    retry_after_seconds: windowSec,
  });
  return false;
}

// â”€â”€â”€ Route factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createMfaRoutes(router: Router, deps: MfaRoutesDeps): Router {
  for (const plane of ["admin", "neon", "mesh"] as const) {
    const scoped = Router();
    scoped.use((req, _res, next) => {
      const value = Array.isArray(req.headers["x-plane-key"])
        ? req.headers["x-plane-key"][0]
        : req.headers["x-plane-key"];
      next(value === plane ? undefined : "router");
    });
    createMfaRoutesForDatabase(scoped, {
      ...deps,
      db: deps.planeDatabases.forPlane(plane).db,
      plane,
    });
    router.use(scoped);
  }
  return router;
}

function createMfaRoutesForDatabase(
  router: Router,
  deps: MfaRoutesDeps & { db: AnyDb; plane: RuntimePlaneKey },
): Router {
  const { db, cache, auth, logger, kc } = deps;
  const stepUp  = createStepUpService(cache);
  const mfaSync = kc
    ? createMfaSyncService({
        db,
        kcBaseUrl: kc.baseUrl,
        getAdminToken: kc.getAdminToken,
        logger: logger as Parameters<typeof createMfaSyncService>[0]["logger"],
      })
    : null;

  // â”€â”€ GET /api/iam/mfa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // List the caller's Keycloak-owned MFA mirror methods.
  router.get("/iam/mfa", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      if (!mfaSync || !kc) {
        res.status(501).json({ error: "NOT_CONFIGURED" });
        return;
      }
      const methods = await mfaSync.listCredentials(
        tenantId,
        principalId,
        kc.realm,
      );

      setCachePrivate(res, 0); // no cache â€” security-sensitive
      res.json({ principal_id: principalId, methods });
    } catch (err) {
      logger?.error("mfa_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/mfa/totp/begin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Start TOTP enrollment. Returns otpauth URI and QR SVG for display.
  // Requires security_change step-up if the caller already has an active TOTP method
  // (re-enrollment requires step-up to prevent unauthorized takeover).
  router.post("/iam/mfa/totp/begin", (async (req, res, next) => {
    try {
      if (!mfaSync || !kc) {
        res.status(501).json({ error: "NOT_CONFIGURED", message: "TOTP enrollment requires Keycloak configuration." });
        return;
      }
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const body = req.body as { redirect_uri?: string };
      if (!body.redirect_uri?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'redirect_uri' is required" });
        return;
      }
      let redirectUri: URL;
      try {
        redirectUri = new URL(body.redirect_uri);
      } catch {
        res.status(400).json({ error: "INVALID_VALUE", message: "'redirect_uri' must be a valid absolute URL" });
        return;
      }
      if (!["http:", "https:"].includes(redirectUri.protocol)) {
        res.status(400).json({ error: "INVALID_VALUE", message: "'redirect_uri' must use http or https" });
        return;
      }

      const redirectUrl = mfaSync.buildAiaUrl(
        kc.realm,
        kc.webClientId ?? kc.clientId,
        redirectUri.toString(),
        "CONFIGURE_TOTP",
      );
      setCachePrivate(res, 0);
      res.status(200).json({ redirect_url: redirectUrl, authority: "keycloak", action: "CONFIGURE_TOTP" });
    } catch (err) {
      logger?.error("mfa_totp_begin_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // Keycloak owns MFA verification; no local TOTP verification route exists.
  // â”€â”€ DELETE /api/iam/mfa/:methodId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Disable and remove an MFA method. Requires security_change step-up.
  router.delete("/iam/mfa/:methodId", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      // Removing MFA always requires step-up (verified via a live code first)
      const binding = createStepUpBinding(caller.claims, sub, tenantId, "security_change");
      const elevated = binding ? await stepUp.isElevated(binding) : false;
      if (!elevated) {
        res.status(403).json({
          error: "STEP_UP_REQUIRED",
          action_class: "security_change",
          message: "Removing an MFA method requires a security_change step-up.",
        });
        return;
      }

      const methodId = req.params.methodId as string;

      // Verify ownership â€” method must belong to this principal + tenant
      if (!mfaSync || !kc) {
        res.status(501).json({ error: "NOT_CONFIGURED" });
        return;
      }
      const method = (await mfaSync.listCredentials(
        tenantId,
        principalId,
        kc.realm,
      )).find((candidate) => candidate.id === methodId);

      if (!method) {
        res.status(404).json({ error: "METHOD_NOT_FOUND", message: `MFA method '${methodId}' not found` });
        return;
      }

      try {
        await mfaSync.revokeCredential(tenantId, principalId, methodId, kc.realm);
      } catch (err) {
        logger?.error("mfa_keycloak_revoke_failed", { methodId, err: String(err) });
        res.status(502).json({ error: "KC_UNAVAILABLE", message: "Failed to revoke credential from Keycloak. Try again." });
        return;
      }

      await db.transaction().execute(async (trx) => {
        await sql`
          SELECT
            set_config('app.current_tenant_id', ${tenantId}, true),
            set_config('app.current_principal_id', ${principalId}, true),
            set_config('app.database_plane', ${deps.plane === "admin" ? "athyper" : deps.plane}, true)
        `.execute(trx);
        await sql`
          INSERT INTO audit.security_event (
            tenant_id, event_code, category, severity, outcome, principal_id,
            source_service, context
          ) VALUES (
            ${tenantId}::uuid,
            'auth.mfa_method_deleted',
            'credential',
            'info',
            'success',
            ${principalId}::uuid,
            'svc-iam',
            ${JSON.stringify({ keycloak_credential_id: methodId, method_type: method.method_type })}::jsonb
          )
        `.execute(trx);
      }).catch(() => { /* best-effort */ });

      res.status(204).end();
    } catch (err) {
      logger?.error("mfa_delete_method_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/mfa/elevate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Consume fresh Keycloak MFA evidence and grant a session-bound elevation token.
  // Called by the client after receiving a 403 STEP_UP_REQUIRED response.
  // Body: { action_class: ActionClass }
  router.post("/iam/mfa/elevate", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, claims } = caller;

      const body = req.body as { action_class?: string };
      if (!body.action_class) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'action_class' is required" });
        return;
      }
      const rateLimitOk = await enforceRateLimit(cache, res, `ratelimit:mfa:elevate:${tenantId}:${sub}`, 5, 300);
      if (!rateLimitOk) {
        void appendSecurityEvent(db, {
          plane: deps.plane === "admin" ? "athyper" : deps.plane,
          tenant_id: tenantId,
          principal_id: caller.principalId,
          event_code: "auth.mfa_rate_limited",
          category: "authentication",
          severity: "warning",
          outcome: "denied",
          context: { action_class: body.action_class },
        });
        return;
      }

      const validActionClasses: ActionClass[] = [
        "iam_admin", "tenant_settings", "delegation_accept", "atlas_support", "metadata_release",
        "payment_release", "security_change",
      ];
      if (!validActionClasses.includes(body.action_class as ActionClass)) {
        res.status(400).json({ error: "INVALID_VALUE", message: `'action_class' must be one of: ${validActionClasses.join(", ")}` });
        return;
      }

      const actionClass = body.action_class as ActionClass;
      const hasFreshKeycloakAssurance = hasFreshKeycloakStepUpAssurance(claims);
      const binding = createStepUpBinding(claims, sub, tenantId, actionClass);
      if (!hasFreshKeycloakAssurance || !binding) {
        void appendSecurityEvent(db, {
          plane: deps.plane === "admin" ? "athyper" : deps.plane,
          tenant_id: tenantId,
          principal_id: caller.principalId,
          event_code: "auth.mfa_step_up_denied",
          category: "authentication",
          severity: "warning",
          outcome: "denied",
          context: {
            action_class: actionClass,
            has_fresh_assurance: hasFreshKeycloakAssurance,
            has_binding: !!binding,
          },
        });
        res.status(403).json({
          error: "KEYCLOAK_STEP_UP_REQUIRED",
          action_class: actionClass,
          required_assurance: "aal2",
          session_binding: true,
          message: "Complete a fresh AAL2 step-up in Keycloak before retrying this action.",
        });
        return;
      }

      const configuredTtlSec = await resolveNumericParameter(
        db,
        cache,
        tenantId,
        "runtime.mfa.step_up_ttl_seconds",
        600,
      );
      const ttlSec = actionClass === "metadata_release"
        ? Math.min(configuredTtlSec, 300)
        : configuredTtlSec;
      await stepUp.grantElevation(binding, ttlSec);

      void appendSecurityEvent(db, {
        plane: deps.plane === "admin" ? "athyper" : deps.plane,
        tenant_id: tenantId,
        principal_id: caller.principalId,
        event_code: "auth.mfa_step_up_granted",
        category: "authentication",
        severity: "info",
        outcome: "success",
        context: { action_class: actionClass, ttl_sec: ttlSec },
      });

      setCachePrivate(res, 0);
      res.json({ ok: true, elevated: true, action_class: actionClass, ttl_sec: ttlSec });
    } catch (err) {
      logger?.error("mfa_elevate_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ GET /api/iam/delegations/my â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // List the caller's given and received delegations (all statuses).
  // Includes counterparty name for display.
  router.get("/iam/delegations/my", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { principalId, tenantId } = caller;

      const [given, received] = await Promise.all([
        db.selectFrom("authz.delegation as d")
          .leftJoin("master.principal as delegate", "delegate.id", "d.delegate_id")
          .select([
            "d.id", "d.delegate_id", "d.reason", "d.effective_until",
            "d.status", "d.revoked_at", "d.revocation_reason", "d.created_at",
            "delegate.name as delegate_name",
          ])
          .where("d.tenant_id", "=", tenantId)
          .where("d.delegator_id", "=", principalId)
          .orderBy("d.created_at", "desc")
          .execute(),
        db.selectFrom("authz.delegation as d")
          .leftJoin("master.principal as delegator", "delegator.id", "d.delegator_id")
          .select([
            "d.id", "d.delegator_id", "d.reason", "d.effective_until",
            "d.status", "d.revoked_at", "d.revocation_reason", "d.created_at",
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

  // â”€â”€ POST /api/iam/delegations/my â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Self-service: create a delegation where the caller is the delegator.
  // Requires delegation_accept step-up.
  // Body: { delegate_id, scope_type, scope_ref?, permissions[], expires_at, reason? }
  router.post("/iam/delegations/my", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      const binding = createStepUpBinding(caller.claims, sub, tenantId, "delegation_accept");
      const elevated = binding ? await stepUp.isElevated(binding) : false;
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
      const validScopeTypes = [
        "tenant", "workspace", "module", "company_code", "legal_entity",
        "operating_organization", "network_account", "network_relationship",
        "resource",
      ];
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
        .insertInto("authz.delegation")
        .values({
          tenant_id:    tenantId,
          delegator_id: principalId,
          delegate_id:  body.delegate_id,
          effective_until: expiresAt,
          reason:       body.reason ?? "self-service delegation",
          status:       "pending",
          metadata:     { requested_scope_type: body.scope_type, requested_scope_ref: body.scope_ref ?? null, requested_permissions: body.permissions } as never,
          created_by:   principalId,
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();
      const permissionRows = await sql<{ id: string }>`
        SELECT id::text AS id
        FROM authz.permission
        WHERE canonical_code IN (${sql.join(body.permissions.map((code) => sql`${code}`), sql`, `)})
          AND status = 'published'
          AND is_delegable = true
      `.execute(db);
      if (permissionRows.rows.length !== new Set(body.permissions).size) {
        await db.deleteFrom("authz.delegation").where("id", "=", delegation.id).execute();
        res.status(400).json({ error: "EXACT_DELEGABLE_PERMISSIONS_REQUIRED" });
        return;
      }
      await sql`
        INSERT INTO authz.delegation_grant
          (tenant_id, delegation_id, permission_id, scope_target_id, created_by)
        SELECT ${tenantId}::uuid, ${delegation.id}::uuid,
          permission_id::uuid, scope.id, ${principalId}::uuid
        FROM unnest(${permissionRows.rows.map((row) => row.id)}::text[]) AS permission_id
        CROSS JOIN LATERAL (
          SELECT id
          FROM authz.scope_target
          WHERE tenant_id = ${tenantId}::uuid
            AND scope_kind = ${body.scope_type}
            AND target_id = COALESCE(${body.scope_ref ?? null}, ${tenantId})::uuid
            AND status = 'active'
          LIMIT 1
        ) scope
      `.execute(db);

      setCachePrivate(res, 0);
      res.status(201).json({ delegation_id: delegation.id, status: "pending", created_at: delegation.created_at });
    } catch (err) {
      logger?.error("delegation_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/delegations/:id/revoke-own â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Self-service: revoke a delegation the caller created.
  // Requires delegation_accept step-up. Validates caller is the delegator.
  router.post("/iam/delegations/:id/revoke-own", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      const binding = createStepUpBinding(caller.claims, sub, tenantId, "delegation_accept");
      const elevated = binding ? await stepUp.isElevated(binding) : false;
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
        .selectFrom("authz.delegation as d")
        .select(["d.id", "d.status", "d.delegator_id"])
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
      if (delegation.status === "revoked") {
        res.status(409).json({ error: "ALREADY_REVOKED", message: "Delegation is already revoked" });
        return;
      }
      if (delegation.status === "pending") {
        res.status(409).json({ error: "PENDING_DELEGATION", message: "Pending delegations require approval-workflow withdrawal" });
        return;
      }

      await db
        .updateTable("authz.delegation")
        .set({
          status:        "revoked",
          revoked_at:    sql`now()`,
          revoked_by:    principalId,
          revocation_reason: "Revoked by delegator (self-service)",
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

  // â”€â”€ GET /api/iam/trusted-devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // List the caller's trusted devices (active, non-expired, non-revoked).
  // Used to show "trusted devices" panel in Security settings.
  router.get("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const devices = await db
        .selectFrom("authz.trusted_device as td")
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
        .where("td.revoked_at",   "is", null)
        .where("td.expires_at",   ">", new Date())
        .orderBy("td.last_seen_at", "desc")
        .execute();
      const configuredTtlDays = await resolveNumericParameter(
        db,
        cache,
        tenantId,
        "auth.mfa.trusted_device_ttl_days",
        30,
      );

      setCachePrivate(res, 0);
      res.json({
        devices,
        ttl_days: Math.min(Math.max(1, Math.trunc(configuredTtlDays)), 90),
      });
    } catch (err) {
      logger?.error("trusted_devices_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/trusted-devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Issue a new trusted-device token after a successful step-up elevation.
  // Returns the raw token once (as a Set-Cookie header) â€” never stored in DB.
  // The client receives a 30-day cookie; the server stores only its SHA-256 hash.
  //
  // Requires security_change step-up â€” the user must have just proven MFA.
  // Body: { device_name?: string }. TTL is tenant-resolved and capped at 90 days.
  router.post("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { sub, tenantId, principalId } = caller;

      // Require security_change step-up â€” proves the user just completed MFA
      const binding = createStepUpBinding(caller.claims, sub, tenantId, "security_change");
      const elevated = binding ? await stepUp.isElevated(binding) : false;
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
      }
      const body = req.body as TrustedDeviceBody;
      const configuredTtlDays = await resolveNumericParameter(
        db,
        cache,
        tenantId,
        "auth.mfa.trusted_device_ttl_days",
        30,
      );
      const ttlDays = Math.min(Math.max(1, Math.trunc(configuredTtlDays)), 90);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      // Generate opaque 32-byte random token â€” only this value goes to the client
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashDeviceToken(rawToken);

      const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
      const ipAddress = (req.ip ?? req.socket.remoteAddress ?? null);

      const row = await db
        .insertInto("authz.trusted_device")
        .values({
          tenant_id:         tenantId,
          principal_id:      principalId,
          device_token_hash: tokenHash,
          device_name:       body.device_name?.trim() || null,
          user_agent:        userAgent,
          ip_address:        ipAddress,
          last_seen_at:      sql`now()`,
          expires_at:        expiresAt,
          created_by:        principalId,
        })
        .returning(["id", "created_at", "expires_at"])
        .executeTakeFirstOrThrow() as { id: string; created_at: Date; expires_at: Date };

      // Set HttpOnly secure cookie â€” 64-hex chars (32 bytes)
      const cookieMaxAge = ttlDays * 24 * 60 * 60; // seconds
      res.setHeader(
        "Set-Cookie",
        `td_token=${rawToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${cookieMaxAge}${trustedDeviceCookieSecurity(req)}`,
      );

      setCachePrivate(res, 0);
      res.status(201).json({
        device_id:  row.id,
        expires_at: row.expires_at,
        // raw_token intentionally NOT included in response body â€” cookie only
      });
    } catch (err) {
      logger?.error("trusted_device_register_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/trusted-devices/verify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Verify a raw td_token from a cookie â€” used by the login callback to bypass
  // Compatibility endpoint retained temporarily to return an explicit retirement response.
  // Device trust cannot replace Keycloak login or security-change MFA.
  router.post("/iam/trusted-devices/verify", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      setCachePrivate(res, 0);
      res.status(410).json({
        error: "DEVICE_LOGIN_BYPASS_RETIRED",
        message: "Trusted devices cannot replace Keycloak login or security-change MFA.",
      });
    } catch (err) {
      logger?.error("trusted_device_verify_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ DELETE /api/iam/trusted-devices/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Revoke a single trusted device. Does not require step-up (revocation = safety action).
  router.delete("/iam/trusted-devices/:id", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const deviceId = req.params.id as string;

      const device = await db
        .selectFrom("authz.trusted_device as td")
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
        .updateTable("authz.trusted_device")
        .set({
          revoked_at:        sql`now()`,
          revoked_by:        principalId,
          revocation_reason: "self_service_single",
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

  // â”€â”€ DELETE /api/iam/trusted-devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Panic button: revoke ALL of the caller's trusted devices at once.
  // Use when account compromise is suspected. Does not require step-up.
  router.delete("/iam/trusted-devices", (async (req, res, next) => {
    try {
      const caller = await resolveCallerAuth(req, res, db, auth);
      if (!caller) return;
      const { tenantId, principalId } = caller;

      const result = await db
        .updateTable("authz.trusted_device")
        .set({
          revoked_at:        sql`now()`,
          revoked_by:        principalId,
          revocation_reason: "self_service_all",
        })
        .where("tenant_id",    "=", tenantId)
        .where("principal_id", "=", principalId)
        .where("revoked_at",   "is", null)
        .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

      const revoked = Number(result?.numUpdatedRows ?? 0);

      setCachePrivate(res, 0);
      res.append(
        "Set-Cookie",
        `td_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${trustedDeviceCookieSecurity(req)}`,
      );
      res.status(200).json({ revoked_count: revoked });
    } catch (err) {
      logger?.error("trusted_device_revoke_all_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/mfa/webauthn/start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ POST /api/iam/mfa/sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Pull the caller's current MFA credentials from Keycloak and reconcile with
  // Keycloak is queried directly; no local credential mirror is authoritative.
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

      // Pull Keycloak-owned TOTP and WebAuthn metadata into the app mirror.
      const result = await mfaSync.syncFromKC(tenantId, principalId, kc.realm);

      setCachePrivate(res, 0);
      res.json({
        synced:       result.synced,
        drifted:      result.drifted,
        authority:    "keycloak",
      });
    } catch (err) {
      logger?.error("mfa_sync_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // â”€â”€ POST /api/iam/mfa/webauthn/assert/begin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Keycloak owns WebAuthn registration and assertion verification; no application-side ceremony is registered.
  return router;
}

// â”€â”€ COSE P-256 â†’ SPKI converter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Parses a CBOR-encoded COSE EC2 public key (alg -7, crv P-256)
