/**
 * IAM Logout Routes — v1.0
 *
 * DELETE /api/session
 *
 * Signal from the BFF that a user has logged out. The backend deletes all
 * cached session and bootstrap keys for the JWT sub so that the 5-minute TTL
 * window doesn't leave stale access after logout.
 *
 * Call order expected from BFF logout handler:
 *   1. POST this endpoint (backend cache delete)
 *   2. Redirect to Keycloak SSO logout
 *   3. Clear cookies (neon_sid, __csrf)
 *
 * If this call fails the BFF must still proceed with KC logout + cookie clear.
 * The cache entries will expire via TTL (5 min) — logged as degraded logout.
 *
 * Auth: Bearer token required. No body needed.
 * Response: 204 No Content on success.
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";

import type { CacheClient } from "../session/session.service.js";
import { createBootstrapService } from "../bootstrap/bootstrap.service.js";
import { terminateFrontendSessions } from "../session/termination.service.js";
import { createIdentityAdmissionCutoverRepository } from "../identity/identity-admission-cutover.js";
import { SqlIdentityShadowSink } from "../identity/sql-identity-shadow-sink.js";
import type {
  PlaneDatabaseRegistry,
  RuntimeDatabase,
  RuntimePlaneKey,
} from "../runtime/plane-database-registry.js";

// Key helpers mirrored from @athyper/platform-iam-session-plane — keep in sync.
const sessKey = (ns: string, sid: string) => `sess:${ns}:${sid}`;
const userSessionsKey = (ns: string, userId: string) => `user_sessions:${ns}:${userId}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogoutRoutesDeps {
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
  terminationMetrics?: (reason: string, outcome: "success" | "degraded" | "failure") => void;
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createLogoutRoutes(router: Router, deps: LogoutRoutesDeps): Router {
  const { cache, auth, logger, terminationMetrics } = deps;

  const bootstrapService = createBootstrapService({
    planeDatabases: deps.planeDatabases,
    cache,
  });
  const logoutIdentities = createIdentityAdmissionCutoverRepository(deps.planeDatabases, {
    workflow: "logout",
    sink: new SqlIdentityShadowSink(deps.planeDatabases),
    onShadowError: (error) => logger?.warn("logout_identity_shadow_failed", { error: String(error) }),
  });

  /**
   * DELETE /api/session
   *
   * Clears all backend-cached sessions and bootstrap entries for the principal
   * identified by the Bearer token. Does NOT call Keycloak SSO logout — that
   * is the BFF's responsibility.
   */
  const deleteSession: RequestHandler = async (req, res, next) => {
    try {
      // ── Verify Bearer token ───────────────────────────────────────────────
      const authHeader = req.headers.authorization ?? "";
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!bearerMatch) {
        res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
        return;
      }

      let claims: Record<string, unknown>;
      try {
        claims = await auth.verifyToken(bearerMatch[1]!);
      } catch (err) {
        res.status(401).json({
          error: "INVALID_TOKEN",
          message: err instanceof Error ? err.message : "Token verification failed",
        });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : null;
      if (!sub) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
        return;
      }

      const planeKey = normalizePlaneKey(req.headers["x-plane-key"]);
      const realmKey = normalizeRealmKey(req.headers["x-realm-key"]);
      const issuerRealm = typeof claims.iss === "string" ? claims.iss.split("/").pop() : undefined;
      if (!planeKey || !realmKey || issuerRealm !== realmKey) {
        res.status(400).json({
          error: "INVALID_LOGOUT_CONTEXT",
          message: "A verified plane and issuer-matching realm are required.",
        });
        return;
      }
      const logoutContext = parseLogoutContext(req.headers["x-logout-context"] as string | undefined);
      const tenantId = logoutTenantId(logoutContext);
      if (tenantId) {
        // Evidence-only. Logout completion is never blocked by admission drift
        // or by an unavailable comparison sink.
        await logoutIdentities.resolve({
          planeKey,
          tenantId,
          providerCode: "keycloak",
          realmKey,
          subjectId: sub,
        }).catch((error) => logger?.warn("logout_identity_comparison_degraded", { error: String(error) }));
      }

      // ── Invalidate all backend session + bootstrap caches ─────────────────
      // Both calls are fire-safe: if smembers/scan finds nothing, it's a no-op.
      await Promise.all([
        invalidateCanonicalSessionCache(cache, sub),
        bootstrapService.invalidate(sub),
      ]);

      // ── Revoke all step-up elevations for this sub ────────────────────────
      // Pattern: mfa_elevation:v2:{sub}:* — SCAN and delete all action classes.
      if (typeof cache.scan === "function") {
        const pattern = `mfa_elevation:v2:${sub}:*`;
        const keysToDelete: string[] = [];
        let cursor = "0";
        do {
          const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
          cursor = nextCursor;
          keysToDelete.push(...found);
        } while (cursor !== "0");
        if (keysToDelete.length > 0) {
          await cache.del(keysToDelete);
        }
      }

      // ── Cross-plane Redis session wipe ────────────────────────────────────
      // Clear auth sessions on all planes so a logout from any surface
      // invalidates every concurrent session for the same principal.
      await terminateFrontendSessions(cache, sub, realmKey);
      terminationMetrics?.(
        typeof req.headers["x-logout-reason"] === "string" ? req.headers["x-logout-reason"] : "manual_logout",
        "success",
      );

      // ── Write security audit event ────────────────────────────────────────
      // Fire-and-forget — never fail the logout because of audit write.
      writeLogoutEvent(
        deps.planeDatabases.forPlane(planeKey).db,
        planeKey,
        realmKey,
        sub,
        logoutTenantId(logoutContext),
        typeof req.headers["x-session-id"] === "string" ? req.headers["x-session-id"] : undefined,
        req.headers["x-forwarded-for"] as string | undefined,
        logoutContext,
        typeof req.headers["x-logout-reason"] === "string" ? req.headers["x-logout-reason"] : undefined,
      ).catch(async (err) => {
          await enqueueLogoutAuditRetry(
            deps.planeDatabases.forPlane(planeKey).db,
            planeKey,
            realmKey,
            sub,
            logoutTenantId(logoutContext),
            typeof req.headers["x-session-id"] === "string" ? req.headers["x-session-id"] : undefined,
            logoutContext,
            typeof req.headers["x-logout-reason"] === "string" ? req.headers["x-logout-reason"] : undefined,
          ).catch((outboxError) => logger?.error("logout_audit_outbox_failed", {
            sub,
            err: outboxError instanceof Error ? outboxError.message : String(outboxError),
          }));
          logger?.warn("logout_audit_write_failed", {
            sub,
            err: err instanceof Error ? err.message : String(err),
          });
        });

      res.status(204).end();
    } catch (err) {
      terminationMetrics?.(
        typeof req.headers["x-logout-reason"] === "string" ? req.headers["x-logout-reason"] : "unknown",
        "failure",
      );
      logger?.error("logout_route_error", { err: String(err) });
      next(err);
    }
  };

  router.delete("/session", deleteSession);
  return router;
}

async function invalidateCanonicalSessionCache(
  cache: CacheClient,
  sub: string,
): Promise<void> {
  if (!cache.scan) return;
  let cursor = "0";
  do {
    const [next, keys] = await cache.scan(
      cursor,
      "MATCH",
      `session:${sub}:*`,
      "COUNT",
      200,
    );
    cursor = next;
    if (keys.length > 0) await cache.del(keys);
  } while (cursor !== "0");
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function writeLogoutEvent(
  db: RuntimeDatabase,
  planeKey: RuntimePlaneKey,
  realmKey: string,
  sub: string,
  tenantId?: string,
  sessionId?: string,
  forwardedFor?: string,
  logoutContext?: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  if (!tenantId || !isUuid(tenantId)) return;
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : null;
  await db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.database_plane', ${planeKey === "admin" ? "athyper" : planeKey}, true)
    `.execute(trx);
    const binding = await sql<{ principal_id: string }>`
      SELECT principal_id::text
      FROM master.principal_identity_binding
      WHERE tenant_id = ${tenantId}::uuid
        AND provider_code = 'keycloak'
        AND realm_key = lower(btrim(${realmKey}))
        AND subject_id = btrim(${sub})
      ORDER BY is_primary DESC, created_at
      LIMIT 1
    `.execute(trx);
    const principalId = binding.rows[0]?.principal_id;
    if (!principalId) return;
    await sql`SELECT set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
    await sql`
      INSERT INTO audit.security_event (
        tenant_id, event_code, category, severity, outcome, principal_id,
        session_id, source_ip, source_service, request_id, context
      ) VALUES (
        ${tenantId}::uuid,
        'auth.logout',
        'authentication',
        'info',
        'success',
        ${principalId}::uuid,
        ${sessionId ?? null},
        ${ip}::inet,
        'svc-iam',
        null,
        ${JSON.stringify({
          source: "backend_logout_route",
          reason: reason ?? "unknown",
          ...(logoutContext ? { logout_context: logoutContext } : {}),
        })}::jsonb
      )
    `.execute(trx);
  });
}

async function enqueueLogoutAuditRetry(
  db: RuntimeDatabase,
  planeKey: RuntimePlaneKey,
  realmKey: string,
  sub: string,
  tenantId?: string,
  sessionId?: string,
  logoutContext?: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  if (!tenantId || !isUuid(tenantId)) return;
  await db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.database_plane', ${planeKey === "admin" ? "athyper" : planeKey}, true)
    `.execute(trx);
    const binding = await sql<{ principal_id: string }>`
      SELECT principal_id::text
        FROM master.principal_identity_binding
       WHERE tenant_id = ${tenantId}::uuid
         AND provider_code = 'keycloak'
         AND realm_key = ${realmKey}
         AND subject_id = ${sub}
       LIMIT 1
    `.execute(trx);
    const principalId = binding.rows[0]?.principal_id;
    if (!principalId) return;
    await sql`SELECT set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
    await sql`
      INSERT INTO event.outbox (
        tenant_id, topic, event_type, event_key, entity_type, actor_id,
        source, partition_key, payload, headers, created_by
      ) VALUES (
        ${tenantId}::uuid,
        'audit.security-event.retry',
        'auth.logout',
        ${`${realmKey}:${sessionId ?? sub}`},
        'principal',
        ${principalId}::uuid,
        'svc-iam',
        ${tenantId},
        ${JSON.stringify({
          event_code: "auth.logout",
          plane: planeKey,
          realm: realmKey,
          subject_id: sub,
          principal_id: principalId,
          session_id: sessionId ?? null,
          reason: reason ?? "unknown",
          logout_context: logoutContext ?? null,
        })}::jsonb,
        '{"retry_kind":"audit_security_event"}'::jsonb,
        ${principalId}::uuid
      )
    `.execute(trx);
  });
}

function normalizePlaneKey(value: unknown): RuntimePlaneKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "admin" || raw === "neon" || raw === "mesh" ? raw : null;
}

function normalizeRealmKey(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return /^[a-z][a-z0-9_.-]{1,126}$/.test(normalized) ? normalized : null;
}

function logoutTenantId(context: Record<string, unknown> | undefined): string | undefined {
  if (!context) return undefined;
  const tenant = context.tenant;
  if (!tenant || typeof tenant !== "object" || Array.isArray(tenant)) return undefined;
  const id = (tenant as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseLogoutContext(value: string | undefined): Record<string, unknown> | undefined {
  if (!value || value.length > 8_192) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
