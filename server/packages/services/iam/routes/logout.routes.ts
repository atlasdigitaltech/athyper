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
import type { Kysely } from "kysely";

import type { CacheClient } from "../session/session.service.js";
import { createSessionService } from "../session/session.service.js";
import { createBootstrapService } from "../bootstrap/bootstrap.service.js";

// Key helpers mirrored from @athyper/session-plane — keep in sync.
const sessKey = (ns: string, sid: string) => `sess:${ns}:${sid}`;
const userSessionsKey = (ns: string, userId: string) => `user_sessions:${ns}:${userId}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogoutRoutesDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createLogoutRoutes(router: Router, deps: LogoutRoutesDeps): Router {
  const { db, cache, auth, logger } = deps;

  const sessionService = createSessionService({ db, cache });
  const bootstrapService = createBootstrapService({ db, cache });

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

      // ── Invalidate all backend session + bootstrap caches ─────────────────
      // Both calls are fire-safe: if smembers/scan finds nothing, it's a no-op.
      await Promise.all([
        sessionService.invalidateAll(sub),
        bootstrapService.invalidate(sub),
      ]);

      // ── Revoke all step-up elevations for this sub ────────────────────────
      // Pattern: mfa_elevation:{sub}:* — SCAN and delete all action classes.
      if (typeof cache.scan === "function") {
        const pattern = `mfa_elevation:${sub}:*`;
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
      if (typeof cache.smembers === "function") {
        const SESSION_NAMESPACES = ["neon", "mesh", "admin", "platform"] as const;
        await Promise.allSettled(
          SESSION_NAMESPACES.map(async (ns) => {
            const sids = await cache.smembers!(userSessionsKey(ns, sub));
            if (sids.length > 0) {
              await cache.del(sids.map((sid) => sessKey(ns, sid)));
            }
            await cache.del(userSessionsKey(ns, sub));
          }),
        );
      }

      // ── Write security audit event ────────────────────────────────────────
      // Fire-and-forget — never fail the logout because of audit write.
      writeLogoutEvent(db, sub, req.headers["x-forwarded-for"] as string | undefined).catch(
        (err) => {
          logger?.warn("logout_audit_write_failed", {
            sub,
            err: err instanceof Error ? err.message : String(err),
          });
        },
      );

      res.status(204).end();
    } catch (err) {
      logger?.error("logout_route_error", { err: String(err) });
      next(err);
    }
  };

  router.delete("/session", deleteSession);
  return router;
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function writeLogoutEvent(
  db: Kysely<AnyDb>,
  sub: string,
  forwardedFor?: string,
): Promise<void> {
  // Resolve principal_id + tenant_id from the sub for the audit row.
  // Use the first binding found — logout applies globally (all tenants).
  const binding = await db
    .selectFrom("master.principal_identity_binding as pib")
    .select(["pib.principal_id", "pib.tenant_id"])
    .where("pib.subject_id", "=", sub)
    .where("pib.provider_code", "=", "keycloak")
    .limit(1)
    .executeTakeFirst();

  if (!binding) return; // no binding = user never resolved; nothing to audit

  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : null;

  await db
    .insertInto("log.security_event_log")
    .values({
      tenant_id: binding.tenant_id,
      event_category: "session",
      event_type: "logout_signal",
      outcome: "success",
      principal_id: binding.principal_id,
      actor_type: "user",
      ip_address: ip as unknown as string,
      detail: { sub, source: "backend_logout_route" } as unknown as string,
      created_by: binding.principal_id,
    })
    .execute();
}
