/**
 * IAM Routes — registration entry point
 *
 * Registers all IAM-related Express routes onto the provided router.
 *
 * Routes registered:
 *   POST   /api/auth/discovery                         — tenant/workspace discovery for plane login
 *   GET    /api/session/bootstrap                        — full tenant/entity tree
 *   GET    /api/session                                  — resolved runtime session
 *   DELETE /api/session                                  — logout signal (cache invalidation)
 *   GET    /api/iam/my-company-codes                     — company codes for a given permission
 *   GET    /api/iam/admin/company-codes                  — all active company codes (admin dropdown helper)
 *   GET    /api/iam/admin/company-code-access            — list CCA grants (paginated, filterable)
 *   POST   /api/iam/admin/company-code-access            — grant company-code access to entity
 *   DELETE /api/iam/admin/company-code-access/:id        — revoke CCA grant
 *   GET    /api/iam/admin/permission-log                 — paginated permission_decision_log viewer
 *   GET    /api/iam/admin/idp-sync/health                — IdP sync health: counts + conflict list
 *   POST   /api/iam/admin/idp-sync/trigger               — queue manual re-sync
 *   POST   /api/iam/admin/migrate-bindings                — backfill identity bindings (operator write)
 *   POST   /api/iam/admin/principals/:id/invalidate-sessions — force-bump auth_epoch; invalidates all cached sessions (iam_admin step-up)
 *   GET    /api/iam/groups                               — list groups with counts (operator)
 *   POST   /api/iam/groups                               — create group (operator write)
 *   GET    /api/iam/groups/:id                           — group detail: members + roles (operator)
 *   PATCH  /api/iam/groups/:id                           — update group metadata (operator write)
 *   DELETE /api/iam/groups/:id                           — soft-delete to deprecated (operator write)
 *   POST   /api/iam/groups/:groupId/members              — add group member (operator write)
 *   DELETE /api/iam/groups/:groupId/members/:memberId    — remove group member (operator write)
 *   POST   /api/iam/groups/:id/roles                     — add scoped role assignment (operator write)
 *   PATCH  /api/iam/groups/:id/roles/:rid                — update role scope/visibility (operator write)
 *   DELETE /api/iam/groups/:id/roles/:rid                — remove role assignment (operator write)
 *   GET    /api/iam/principals                           — principal search/member picker (operator)
 *   GET    /api/iam/effective-access/:principalId        — full permission map (operator)
 *   GET    /api/iam/principals/:principalId/groups       — group memberships (operator)
 *   GET    /api/iam/principals/:principalId/grants       — access grants (operator)
 *   GET    /api/iam/principals/:principalId/delegations  — delegation grants (operator)
 *   GET    /api/iam/principals/:principalId/mfa          — MFA config (operator)
 *   GET    /api/iam/principals/:principalId/auth-bindings — identity bindings (operator)
 *   POST   /api/iam/grants                               — create allow grant (operator write)
 *   PATCH  /api/iam/grants/:grantId/revoke               — revoke grant (operator write)
 *   POST   /api/iam/delegations                          — create delegation (operator write)
 *   PATCH  /api/iam/delegations/:grantId/revoke          — revoke delegation (operator write)
 *   GET    /api/iam/mfa                                  — list caller's MFA methods (self-service)
 *   POST   /api/iam/mfa/totp/begin                       — begin Keycloak CONFIGURE_TOTP AIA
 *   DELETE /api/iam/mfa/:methodId                        — remove MFA method (self-service, security_change step-up)
 *   POST   /api/iam/mfa/elevate                          — consume Keycloak MFA evidence + grant elevation
 *   POST   /api/iam/mfa/webauthn/start                   — begin WebAuthn enrollment via KC AIA (returns redirect_url)
 *   POST   /api/iam/mfa/sync                             — pull KC credentials → reconcile mfa_config mirror
 *   GET    /api/iam/trusted-devices                      — list caller's active trusted devices (self-service)
 *   POST   /api/iam/trusted-devices                      — register new trusted device (security_change step-up)
 *   DELETE /api/iam/trusted-devices/:id                  — revoke single trusted device (self-service)
 *   DELETE /api/iam/trusted-devices                      — panic: revoke all trusted devices (self-service)
 *   GET    /api/iam/delegations/my                      — list caller's given + received delegations (self-service)
 *   POST   /api/iam/delegations/my                      — create delegation where caller = delegator (self-service, delegation_accept step-up)
 *   POST   /api/iam/delegations/:id/revoke-own          — revoke a delegation the caller created (self-service, delegation_accept step-up)
 *
 * Usage (from server/src/app.ts):
 *   const router = Router();
 *   registerIamRoutes(router, { db, cache, auth, logger });
 *   app.use("/api", router);
 */

import type { Router } from "express";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";
import { createContextRoutes } from "./context.routes.js";
import { createDiscoveryRoutes } from "./discovery.routes.js";
import { createSessionRoutes } from "./session.routes.js";
import { createBootstrapRoutes } from "./bootstrap.routes.js";
import { createIamRoutes } from "./iam.routes.js";
import { createLogoutRoutes } from "./logout.routes.js";
import { createOperatorRoutes } from "./operator.routes.js";
import { createMfaRoutes } from "./mfa.routes.js";
import { createCcaRoutes } from "./company-code-access.routes.js";
import { createIamAdminRoutes } from "./iam-admin.routes.js";
import { createParameterRoutes } from "./parameter.routes.js";
import { createIdentityProviderRoutes } from "./identity-provider.routes.js";

export interface IamRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meshDb?: import("kysely").Kysely<any>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
  /** Optional tenant-level cache metrics. No-op when omitted. */
  sessionMetrics?: CacheMetrics;
  bootstrapMetrics?: CacheMetrics;
  terminationMetrics?: (reason: string, outcome: "success" | "degraded" | "failure") => void;
  /**
   * Keycloak config for WebAuthn AIA enrollment and KC→App credential sync.
   * When omitted the WebAuthn routes return 501 Not Implemented.
   */
  kc?: {
    baseUrl: string;
    realm: string;
    clientId: string;
    webClientId?: string;
    getAdminToken(): Promise<string>;
  };
  /**
   * WebAuthn Relying Party ID — must match KC's WebAuthn Policy rpId.
   * Use the shared parent domain of KC and the app origins.
   * e.g. KC at iam.athyper.local + app at neon.athyper.local → "athyper.local"
   * Reads from WEBAUTHN_RP_ID env var when not passed explicitly.
   */
}

export function registerIamRoutes(router: Router, deps: IamRoutesDeps): Router {
  createDiscoveryRoutes(router, { db: deps.db, meshDb: deps.meshDb, logger: deps.logger });
  createContextRoutes(router, deps);

  // Bootstrap must be registered BEFORE session so /session/bootstrap is
  // matched before the Express catch-all /session route.
  createBootstrapRoutes(router, { ...deps, metrics: deps.bootstrapMetrics });
  createSessionRoutes(router, { ...deps, metrics: deps.sessionMetrics });
  createIamRoutes(router, deps);

  // Phase 2: logout signal + Phase 3: operator API
  createLogoutRoutes(router, deps);
  createOperatorRoutes(router, deps);

  // Phase 5: Keycloak-owned MFA AIA, metadata sync and step-up evidence.
  createMfaRoutes(router, {
    ...deps,
    kc: deps.kc,
  });

  // Sprint 43: Company-code access admin + permission log viewer + IdP sync health
  createCcaRoutes(router, deps);
  createIamAdminRoutes(router, deps);
  createParameterRoutes(router, deps);
  createIdentityProviderRoutes(router, deps);

  return router;
}
