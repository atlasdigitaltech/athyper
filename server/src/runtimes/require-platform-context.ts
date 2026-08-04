// server/src/runtimes/require-platform-context.ts
//
// Phase 1 (proper) + Phase B (refactor) — unified platform-context gate.
//
// The middleware extracts the bearer, asks the runtime to verify it (which
// triggers verifyTokenForCurrentContext → claim cross-checks via the shared
// auth-pipeline), then composes the same pipeline's later steps to enforce
// AUTHORIZED and the required-actions matrix.
//
// Why we call the pipeline twice (once inside verifyToken, once here):
//   verifyTokenForCurrentContext runs ONLY the claim cross-check step because
//   it has no route information and is also called from /api/auth/verify and
//   other surfaces. This middleware adds the route-aware enforcement —
//   AUTHORIZED + required-actions — without duplicating the cross-check
//   (mode: "off" skips it). The two-stage split is intentional: every
//   bearer-verifying caller gets the cross-check for free, and only the
//   middleware adds the route-aware checks.

import type { Request, Response, NextFunction } from "express";
import type { Kysely } from "kysely";

import { tryGetContext } from "../kernel/request-context.js";
import {
  enforceAuthPipeline,
  loadRequiredActionMatrix,
  type CrossCheckReporter,
} from "../auth/auth-pipeline.js";
import {
  evaluateFederatedMfaPolicy,
  normalizeFederatedAssurance,
  resolveRequiredActionsEnforcement,
  type TenantMfaTrustPolicy,
} from "@athyper/auth-common";

// ─── Middleware factory ──────────────────────────────────────────────────────

export interface RequirePlatformContextDeps {
  readonly verifyToken: (token: string) => Promise<Record<string, unknown>>;
  readonly logger: {
    info: (event: string, fields?: Record<string, unknown>) => void;
    warn: (event: string, fields?: Record<string, unknown>) => void;
    error: (event: string, fields?: Record<string, unknown>) => void;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly db: Kysely<any>;
  readonly defaultRealmKey: string;
  readonly reporter: CrossCheckReporter;
  /**
   * Phase E2 (D-E2.2) — active environment for env-gate resolution. Defaults
   * to `production` when unset so a misconfigured deploy fails closed. `local`
   * opens compat doors; `staging` and `production` enforce by default.
   */
  readonly env?: "local" | "staging" | "production" | string;
}

export interface RequirePlatformContextOptions {
  /** Path prefixes that bypass the gate entirely. */
  readonly publicRoutes?: readonly string[];
  /**
   * Default allowlist: auth bootstrap and the contexts route (which has its
   * own bearer guard), plus /api/auth/verify (own gate per Phase 5).
   */
  readonly defaultPublicRoutes?: readonly string[];
}

const DEFAULT_PUBLIC_ROUTES: readonly string[] = [
  "/api/auth/",
  "/api/iam/session/contexts",
];

type PlatformContextRequest = Request & {
  athyperClaims?: Record<string, unknown>;
  athyperCanonicalTenantId?: string;
};

function isPublicRoute(pathName: string, allowlist: readonly string[]): boolean {
  for (const prefix of allowlist) {
    if (pathName.startsWith(prefix)) return true;
  }
  return false;
}

function extractBearer(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function contextMismatchCheck(message: string): string | undefined {
  const match = /^auth_context_mismatch:(realm|plane|tenant|azp)$/.exec(message);
  return match?.[1];
}

export function createRequirePlatformContext(
  deps: RequirePlatformContextDeps,
  options: RequirePlatformContextOptions = {},
) {
  const allowlist = options.publicRoutes ?? options.defaultPublicRoutes ?? DEFAULT_PUBLIC_ROUTES;
  const requiredActionsMatrix = loadRequiredActionMatrix();

  // Phase E2 (D-E2.2) — resolve the per-env enforcement default once at boot.
  // The middleware passes this through to enforceAuthPipeline on every request.
  // `=off` outside local emits an auth_required_actions_compat_mode_engaged
  // log line (visible audit during the 30-day migration window).
  const env = deps.env ?? "production";
  const enforceRequiredActionsFlag = resolveRequiredActionsEnforcement(
    env,
    (fields) => deps.logger.warn("auth_required_actions_compat_mode_engaged", fields),
  );

  return function requirePlatformContext(
    req: PlatformContextRequest,
    res: Response,
    next: NextFunction,
  ): void {
    const pathName = req.path;

    if (isPublicRoute(pathName, allowlist)) {
      next();
      return;
    }

    void (async () => {
      const ctx = tryGetContext();
      const token = extractBearer(req);
      if (!token) {
        res.status(401).json({
          error: "MISSING_TOKEN",
          message: "Authorization: Bearer <token> required.",
          requestId: ctx?.requestId,
        });
        return;
      }

      let claims: Record<string, unknown>;
      try {
        claims = await deps.verifyToken(token);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Token verification failed.";
        const isContextMismatch = message.startsWith("auth_context_mismatch:");
        const isMalformedToken = message === "malformed_token";
        const check = isContextMismatch ? contextMismatchCheck(message) : undefined;
        const code = isContextMismatch
          ? "AUTH_CONTEXT_MISMATCH"
          : isMalformedToken
            ? "MALFORMED_TOKEN"
            : "INVALID_TOKEN";
        deps.logger.warn("require_platform_context_token_rejected", {
          requestId: ctx?.requestId,
          reason: message,
          code,
        });
        // MALFORMED_TOKEN is a fatal-severity code in the UX contract; the
        // status stays 401 so existing clients treat it as an auth failure.
        res.status(isContextMismatch ? 403 : 401).json({
          error: code,
          // Do not leak the malformed-token field path to the client; it is
          // logged server-side only (see verifyTokenForCurrentContext).
          message: isMalformedToken ? "Token failed schema validation." : message,
          requestId: ctx?.requestId,
          ...(check ? { contextCheck: check } : {}),
        });
        return;
      }

      const assurance = normalizeFederatedAssurance(claims);
      const mfaTrustPolicy = await resolveRuntimeMfaTrustPolicy(
        deps.db,
        ctx?.tenantId,
        ctx?.planeKey,
        ctx?.realmKey ?? ctx?.realm,
        assurance.identityProvider,
      );
      const assuranceDecision = evaluateFederatedMfaPolicy(assurance, mfaTrustPolicy, {
        plane: ctx?.planeKey ?? "neon",
        requiredAssurance: ctx?.planeKey === "admin" ? "aal2" : "aal1",
        privileged: ctx?.planeKey === "admin",
      });
      if (assuranceDecision.athyperMfaRequired) {
        deps.logger.warn("require_platform_context_assurance_rejected", {
          requestId: ctx?.requestId,
          plane: ctx?.planeKey,
          tenantId: ctx?.tenantId,
          providerAlias: assurance.identityProvider,
          mfaTrustPolicy,
          assuranceLevel: assurance.assuranceLevel,
          externalAssuranceLevel: assurance.externalAssuranceLevel,
          keycloakAssuranceLevel: assurance.keycloakAssuranceLevel,
          reason: assuranceDecision.reason,
        });
        res.status(403).json({
          error: "AUTH_ASSURANCE_REQUIRED",
          message: ctx?.planeKey === "admin"
            ? "AAL2 authentication is required for Admin access."
            : "Additional Athyper verification is required.",
          requestId: ctx?.requestId,
          requiredAssurance: assuranceDecision.requiredAssurance,
        });
        return;
      }

      // Pipeline — verifyToken already ran the cross-check step (mode "off"
      // here means: don't re-run it). We still need the AUTHORIZED + required-
      // actions checks, which are route-aware and therefore live here.
      const xOrg = (req.headers["x-org"] as string | undefined) ?? "";
      const xRealm =
        (req.headers["x-realm-key"] as string | undefined)
        ?? (req.headers["x-realm"] as string | undefined);
      const result = await enforceAuthPipeline(
        {
          claims,
          ...(ctx ? { ctx } : {}),
          headers: {
            ...(xOrg ? { xOrg } : {}),
            ...(xRealm ? { xRealm } : {}),
          },
          route: { path: pathName, method: req.method },
        },
        {
          mode: "off",
          // The apiRouter tenant-stamp middleware already resolved tenantId on
          // ctx; skip the lookup here to avoid a second master.tenant query.
          // The middleware records mismatches against the resolved ctx.tenantId.
          resolveTenant: false,
          enforceAuthorized: true,
          enforceRequiredActions: enforceRequiredActionsFlag,
          requiredActionsMatrix,
        },
        {
          db: deps.db,
          defaultRealmKey: deps.defaultRealmKey,
          logger: deps.logger,
          reporter: deps.reporter,
        },
      );

      if (!result.ok && result.error) {
        deps.logger.warn("require_platform_context_blocked", {
          requestId: ctx?.requestId,
          code: result.error.code,
          ...(result.error.check ? { check: result.error.check } : {}),
          ...(result.error.blockingAction ? { blockingAction: result.error.blockingAction } : {}),
          ...result.error.detail,
        });
        res.status(result.error.status).json({
          error: result.error.code,
          message: result.error.message,
          requestId: ctx?.requestId,
          ...(result.error.check ? { contextCheck: result.error.check } : {}),
          ...(result.error.blockingAction
            ? { requiredAction: result.error.blockingAction }
            : {}),
          ...(result.error.code === "REQUIRED_ACTION_PENDING" && result.error.detail
            ? { requiredActions: result.error.detail["requiredActions"] }
            : {}),
        });
        return;
      }

      // Cache verified claims so downstream route handlers can skip a second
      // verifyToken call.
      req.athyperClaims = claims;
      if (result.canonical?.tenantId) {
        req.athyperCanonicalTenantId = result.canonical.tenantId;
      }
      next();
    })();
  };
}

async function resolveRuntimeMfaTrustPolicy(
  db: Kysely<any>,
  tenantId: string | undefined,
  plane: "neon" | "mesh" | "admin" | undefined,
  realmKey: string | undefined,
  providerAlias: string | null,
): Promise<TenantMfaTrustPolicy> {
  void db;
  void tenantId;
  void plane;
  void realmKey;
  void providerAlias;
  // Provider trust is Keycloak-owned. Until a verified organization/provider
  // attribute is carried in the token contract, external MFA is never trusted.
  return "never";
}
