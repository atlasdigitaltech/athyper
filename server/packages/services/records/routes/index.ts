/**
 * Records route registration entry point.
 *
 * Specialized BP/supplier intake routes are registered before generic
 * /records/:entity handlers so action words such as "extend" are not treated
 * as record ids.
 */

import type { RequestHandler, Router } from "express";
import { withFrameworkPhase } from "@athyper/adapter-telemetry";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import type { RedisClient } from "@athyper/adapter-memory-cache";
import { createRecordsRoute } from "./records.route.js";
import { createImportRoutes } from "./import.route.js";
import type { ImportObjectStorage } from "./import.route.js";
import { createBulkPreflightRoute } from "./bulk-preflight.route.js";
import { createBulkActionRoute } from "./bulk-action.route.js";
import { createBulkCrudRoutes } from "./bulk-crud.route.js";
import { createExportRoutes } from "./export.route.js";
import { createActionDispatcherRoute } from "./action-dispatcher.route.js";
import { createActivityRoute } from "./activity.route.js";
import { createLineSourceRoute } from "./line-source.route.js";
import { createLifecycleRoute } from "./lifecycle.route.js";
import { createVersionsRoute } from "./versions.route.js";
import { createSnapshotsRoute } from "./snapshots.route.js";
import { createChangeReasonCodesRoute } from "./change-reason-codes.route.js";
import { createAuditLogRoute } from "./audit-log.route.js";
import { createSupplierIntakeRoute } from "./supplier-intake.route.js";
import { createBusinessPartnerManagementRoute } from "./business-partner-management.route.js";
import type { CacheClient, PermissionResolverRegistry, VerifiedRequestContext } from "@athyper/svc-iam";
import type { ExecutionDescriptorProvider } from "@athyper/svc-metadata";
import {
  composeVerifiedRequestContext,
  EffectivePermissionContextMismatchError,
  ensureEffectivePermissionContext,
  isPlaneKey,
  storeVerifiedRequestContext,
} from "@athyper/svc-iam";
import type { CheckPermissionBatchFn } from "./operation-guard.js";
import {
  extractVerifiedRequestContextHints,
  resolveVerifiedRequestContext,
  verifyBearer,
} from "@athyper/svc-shared";

export interface RecordsRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  importQueue?: Queue;
  objectStorage?: ImportObjectStorage;
  importMaxUploadMb?: number;
  cache?: CacheClient;
  /** Shared three-plane resolver registry used by the global IAM middleware. */
  permissionResolverRegistry: PermissionResolverRegistry;
  /** RBAC batch-check — wires RBAC guards on export and import routes. */
  checkPermissionBatch?: CheckPermissionBatchFn;
  /** HMAC secret for export download tokens (falls back to EXPORT_TOKEN_SECRET env var). */
  tokenSecret?: string;
  /**
   * Phase 11 #2: optional ioredis client for record pub/sub. Passed through
   * to createRecordsRoute. When absent the record SSE stream serves
   * keepalive comments only; clients fall back to polling.
   */
  redis?: RedisClient;
  /** Reads identity state established by the authenticated host gateway. */
  readAuthenticatedContext?: (req: Parameters<RequestHandler>[0]) => {
    tenantId?: string;
    claims?: Record<string, unknown>;
  } | undefined;
  /** Bridges the exact immutable context into the host request ALS. */
  onVerifiedContext?: (context: VerifiedRequestContext) => void;
  executionDescriptorProvider?: ExecutionDescriptorProvider;
  entityQueryPilotCodes?: ReadonlySet<string>;
  entityQueryCursorSecret?: string;
}

export function registerRecordsRoutes(router: Router, deps: RecordsRoutesDeps): Router {
  /**
   * A single fail-closed request context protects every records surface. Route
   * handlers may still read the cached context incrementally while legacy
   * handlers are retired, but no records/P2P/lifecycle endpoint can reach its
   * handler with an unverified tenant, realm, or principal binding.
   */
  const verifiedRequestContext: RequestHandler = async (req, res, next) => {
    try {
      const authenticationStartedAt = process.hrtime.bigint();
      const authenticated = deps.readAuthenticatedContext?.(req);
      const cachedClaims = (req as typeof req & { athyperClaims?: Record<string, unknown> }).athyperClaims
        ?? authenticated?.claims;
      const claims = cachedClaims
        ?? await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      (res.locals as Record<string, unknown>)["verifiedRoleCodes"] = Array.isArray(claims["roles"])
        ? claims["roles"].filter((role): role is string => typeof role === "string")
          .sort()
        : [];
      addPerformanceDuration(res, "authenticationMs", authenticationStartedAt);
      const requestContextStartedAt = process.hrtime.bigint();
      const resolved = await resolveVerifiedRequestContext(
        deps.db,
        claims,
        {
          ...extractVerifiedRequestContextHints(req),
          trustedTenantId: authenticated?.tenantId,
        },
      );
      if (!resolved.ok) {
        res.status(resolved.status).json({ error: resolved.error, message: resolved.message });
        return;
      }

      const planeHeader = req.headers["x-plane-key"] ?? req.headers["x-plane"];
      const planeKey = Array.isArray(planeHeader) ? planeHeader[0] : planeHeader;
      if (!isPlaneKey(planeKey)) {
        res.status(403).json({
          error: "PLANE_CONTEXT_REQUIRED",
          message: "An authenticated product-plane context is required.",
        });
        return;
      }

      const permissions = await withFrameworkPhase("authorization", () => ensureEffectivePermissionContext(
          res,
          deps.permissionResolverRegistry,
          {
            planeKey,
            tenantId: resolved.context.tenantId,
            principalId: resolved.context.principalId,
          },
        ));
      const canonical = composeVerifiedRequestContext({
        identity: resolved.context,
        permissions,
        planeKey,
        requestId: readHeader(req, "x-request-id"),
        idempotencyKey: readHeader(req, "idempotency-key"),
        correlationId:
          readHeader(req, "x-correlation-id")
          ?? resolved.context.correlationId,
      });
      if (!canonical.ok) {
        res.status(canonical.status).json({ error: canonical.error, message: canonical.message });
        return;
      }
      storeVerifiedRequestContext(res, canonical.context);
      deps.onVerifiedContext?.(canonical.context);
      addPerformanceDuration(res, "requestContextMs", requestContextStartedAt);
      next();
    } catch (error) {
      if (error instanceof EffectivePermissionContextMismatchError) {
        res.status(error.status).json({ error: error.code, message: error.message });
        return;
      }
      deps.logger?.error("records_verified_request_context_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  };
  router.use(verifiedRequestContext);

  createBusinessPartnerManagementRoute(router, deps);
  createSupplierIntakeRoute(router, deps);

  createRecordsRoute(router, deps);
  createBulkPreflightRoute(router, deps);
  createBulkActionRoute(router, deps);
  createBulkCrudRoutes(router, deps);
  createExportRoutes(router, deps);
  createActionDispatcherRoute(router, deps);
  createActivityRoute(router, deps);
  createLineSourceRoute(router, deps);
  createLifecycleRoute(router, deps);
  createVersionsRoute(router, deps);
  createSnapshotsRoute(router, deps);
  createChangeReasonCodesRoute(router, deps);
  createAuditLogRoute(router, deps);
  if (deps.importQueue && deps.objectStorage) {
    createImportRoutes(router, {
      db:                   deps.db,
      auth:                 deps.auth,
      importQueue:          deps.importQueue,
      objectStorage:        deps.objectStorage,
      maxUploadMb:          deps.importMaxUploadMb,
      logger:               deps.logger,
      checkPermissionBatch: deps.checkPermissionBatch,
    });
  }

  return router;
}

function readHeader(req: Parameters<RequestHandler>[0], name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function addPerformanceDuration(
  res: Parameters<RequestHandler>[1],
  key: "authenticationMs" | "requestContextMs",
  startedAt: bigint,
): void {
  const locals = res.locals as Record<string, unknown>;
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  locals[key] = Number(locals[key] ?? 0) + elapsedMs;
}
