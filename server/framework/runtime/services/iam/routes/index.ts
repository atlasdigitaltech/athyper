/**
 * IAM Routes — registration entry point
 *
 * Registers all IAM-related Express routes onto the provided router.
 *
 * Routes registered:
 *   GET    /api/session/bootstrap                        — full tenant/entity tree
 *   GET    /api/session                                  — resolved runtime session
 *   DELETE /api/session                                  — logout signal (cache invalidation)
 *   GET    /api/iam/my-company-codes                     — company codes for a given permission
 *   GET    /api/iam/effective-access/:principalId        — full permission map (operator)
 *   GET    /api/iam/principals/:principalId/groups       — group memberships (operator)
 *   GET    /api/iam/principals/:principalId/grants       — access grants (operator)
 *   GET    /api/iam/principals/:principalId/delegations  — delegation grants (operator)
 *   GET    /api/iam/principals/:principalId/mfa          — MFA config (operator)
 *   GET    /api/iam/principals/:principalId/auth-bindings — identity bindings (operator)
 *   POST   /api/iam/groups/:groupId/members              — add group member (operator write)
 *   DELETE /api/iam/groups/:groupId/members/:memberId    — remove group member (operator write)
 *   POST   /api/iam/grants                               — create allow grant (operator write)
 *   PATCH  /api/iam/grants/:grantId/revoke               — revoke grant (operator write)
 *   POST   /api/iam/delegations                          — create delegation (operator write)
 *   PATCH  /api/iam/delegations/:grantId/revoke          — revoke delegation (operator write)
 *
 * Usage (from server/src/app.ts):
 *   const router = Router();
 *   registerIamRoutes(router, { db, cache, auth, logger });
 *   app.use("/api", router);
 */

import type { Router } from "express";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";
import { createSessionRoutes } from "./session.routes.js";
import { createBootstrapRoutes } from "./bootstrap.routes.js";
import { createIamRoutes } from "./iam.routes.js";
import { createLogoutRoutes } from "./logout.routes.js";
import { createOperatorRoutes } from "./operator.routes.js";

export interface IamRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  /** Optional tenant-level cache metrics. No-op when omitted. */
  sessionMetrics?: CacheMetrics;
  bootstrapMetrics?: CacheMetrics;
}

export function registerIamRoutes(router: Router, deps: IamRoutesDeps): Router {
  // Bootstrap must be registered BEFORE session so /session/bootstrap is
  // matched before the Express catch-all /session route.
  createBootstrapRoutes(router, { ...deps, metrics: deps.bootstrapMetrics });
  createSessionRoutes(router, { ...deps, metrics: deps.sessionMetrics });
  createIamRoutes(router, deps);

  // Phase 2: logout signal + Phase 3: operator API
  createLogoutRoutes(router, deps);
  createOperatorRoutes(router, deps);

  return router;
}
