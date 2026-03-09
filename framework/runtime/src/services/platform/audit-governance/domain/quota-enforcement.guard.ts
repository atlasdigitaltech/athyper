/**
 * Quota Enforcement Guard
 *
 * Provides quota enforcement at all ingress points:
 *   - Express middleware (API routes)
 *   - Standalone service (workers, consumers, bulk imports, event ingestion)
 *
 * Uses core.check_quota() SQL function for enforcement decisions.
 * Supports quota key mapping from ingress context (route, job type, etc.)
 *
 * Design:
 *   - Fail-open by default: if quota check fails (DB down), request proceeds
 *   - Structured error response with quota details for API consumers
 *   - Emits telemetry events for quota violations (observability)
 *   - Respects enforcement modes: HARD (block), SOFT (warn + allow), ADVISORY (allow)
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";
import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Types
// ============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  currentValue: number;
  limitValue: number;
  remaining: number;
  enforcement: string;
  overageAction: string;
  quotaKey: string;
}

export interface QuotaViolation {
  quotaKey: string;
  currentValue: number;
  limitValue: number;
  enforcement: string;
  overageAction: string;
}

export type FailMode = "open" | "closed";

export interface QuotaGuardOptions {
  /**
   * Extract tenant ID from request context.
   */
  getTenantId: (req: Request) => string | undefined;

  /**
   * Map a request to one or more quota keys to check.
   * Default: checks 'api_rate_limit' for all API requests.
   */
  getQuotaKeys?: (req: Request) => string[];

  /**
   * Skip quota checking for certain requests (e.g., health checks).
   */
  skip?: (req: Request) => boolean;

  /**
   * Default fail mode when quota check errors (DB down, timeout, etc.).
   * "open" (default): allow request through, log error.
   * "closed": reject request with 503.
   */
  defaultFailMode?: FailMode;

  /**
   * Per-quota-key fail mode overrides.
   * High-risk quotas (storage, exports, integrations) should be "closed".
   * Low-risk UX quotas (api_rate_limit) can stay "open".
   *
   * Example:
   *   { storage_limit: "closed", export_daily_limit: "closed", api_rate_limit: "open" }
   */
  failModeOverrides?: Record<string, FailMode>;

  /**
   * @deprecated Use `defaultFailMode` instead. Kept for backward compatibility.
   */
  failOpen?: boolean;

  /**
   * Callback for quota violations (for telemetry/alerting).
   */
  onViolation?: (
    tenantId: string,
    violation: QuotaViolation,
    context: { path: string; method: string },
  ) => void;
}

// Default route → quota key mapping
const ROUTE_QUOTA_MAP: Record<string, string> = {
  "/api/": "api_rate_limit",
  "/api/fin/": "api_rate_limit",
  "/api/admin/": "api_rate_limit",
};

// ============================================================================
// Service (standalone — for workers, consumers, bulk operations)
// ============================================================================

export class QuotaEnforcementService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Check a single quota. Returns the enforcement decision.
   */
  async checkQuota(
    tenantId: string,
    quotaKey: string,
    increment: number = 1,
  ): Promise<QuotaCheckResult> {
    const result = await sql<{
      allowed: boolean;
      current_value: number;
      limit_value: number;
      remaining: number;
      enforcement: string;
      overage_action: string;
    }>`
      SELECT * FROM core.check_quota(${tenantId}::uuid, ${quotaKey}, ${increment}::bigint)
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      // No quota configured — allow by default
      return {
        allowed: true,
        currentValue: 0,
        limitValue: 0,
        remaining: 0,
        enforcement: "NONE",
        overageAction: "ALLOW",
        quotaKey,
      };
    }

    return {
      allowed: row.allowed,
      currentValue: row.current_value,
      limitValue: row.limit_value,
      remaining: row.remaining,
      enforcement: row.enforcement,
      overageAction: row.overage_action,
      quotaKey,
    };
  }

  /**
   * Check multiple quotas. Returns the first violation or null if all pass.
   */
  async checkQuotas(
    tenantId: string,
    quotaKeys: string[],
    increment: number = 1,
  ): Promise<{ allowed: boolean; violation: QuotaViolation | null }> {
    for (const key of quotaKeys) {
      const result = await this.checkQuota(tenantId, key, increment);
      if (!result.allowed) {
        return {
          allowed: false,
          violation: {
            quotaKey: key,
            currentValue: result.currentValue,
            limitValue: result.limitValue,
            enforcement: result.enforcement,
            overageAction: result.overageAction,
          },
        };
      }
    }
    return { allowed: true, violation: null };
  }

  /**
   * Guard for event ingestion. Checks event_throughput quota.
   */
  async guardEventIngestion(
    tenantId: string,
    eventCount: number = 1,
  ): Promise<QuotaCheckResult> {
    return this.checkQuota(tenantId, "event_throughput", eventCount);
  }

  /**
   * Guard for background job submission. Checks concurrent_jobs quota.
   */
  async guardJobSubmission(tenantId: string): Promise<QuotaCheckResult> {
    return this.checkQuota(tenantId, "concurrent_jobs");
  }

  /**
   * Guard for export operations. Checks export_daily_limit quota.
   */
  async guardExport(tenantId: string): Promise<QuotaCheckResult> {
    return this.checkQuota(tenantId, "export_daily_limit");
  }

  /**
   * Guard for integration connections. Checks integration_connections quota.
   */
  async guardIntegrationConnection(
    tenantId: string,
  ): Promise<QuotaCheckResult> {
    return this.checkQuota(tenantId, "integration_connections");
  }

  /**
   * Guard for storage operations. Checks storage_limit quota.
   */
  async guardStorage(
    tenantId: string,
    sizeIncrement: number,
  ): Promise<QuotaCheckResult> {
    return this.checkQuota(tenantId, "storage_limit", sizeIncrement);
  }
}

// ============================================================================
// Express Middleware
// ============================================================================

/**
 * Create quota enforcement middleware for Express API routes.
 *
 * Usage:
 *   app.use('/api', quotaMiddleware({ getTenantId: (req) => req.tenantId }));
 */
export function quotaMiddleware(
  db: Kysely<DB>,
  options: QuotaGuardOptions,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const service = new QuotaEnforcementService(db);

  // Resolve effective default fail mode (backward-compatible with `failOpen`)
  const defaultFailMode: FailMode =
    options.defaultFailMode ??
    (options.failOpen === false ? "closed" : "open");
  const failModeOverrides = options.failModeOverrides ?? {};

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip check if configured
      if (options.skip?.(req)) {
        return next();
      }

      // Extract tenant ID
      const tenantId = options.getTenantId(req);
      if (!tenantId) {
        // No tenant context — cannot enforce quota, allow through
        return next();
      }

      // Determine which quotas to check
      const quotaKeys = options.getQuotaKeys
        ? options.getQuotaKeys(req)
        : resolveQuotaKeysFromRoute(req);

      if (quotaKeys.length === 0) {
        return next();
      }

      // Check all applicable quotas
      const { allowed, violation } = await service.checkQuotas(
        tenantId,
        quotaKeys,
      );

      if (!allowed && violation) {
        // Emit violation event for observability
        options.onViolation?.(tenantId, violation, {
          path: req.path,
          method: req.method,
        });

        // Return structured error
        res.status(429).json({
          error: "QUOTA_EXCEEDED",
          message: `Quota "${violation.quotaKey}" exceeded`,
          quota: {
            key: violation.quotaKey,
            current: violation.currentValue,
            limit: violation.limitValue,
            enforcement: violation.enforcement,
            action: violation.overageAction,
          },
        });
        return;
      }

      next();
    } catch (error) {
      // Determine fail mode: check per-key overrides, then default
      const checkedKeys = options.getQuotaKeys
        ? options.getQuotaKeys(req)
        : resolveQuotaKeysFromRoute(req);
      const hasClosedKey = checkedKeys.some(
        (k) => (failModeOverrides[k] ?? defaultFailMode) === "closed",
      );

      if (hasClosedKey) {
        // Fail-closed: reject request when we can't verify quota
        res.status(503).json({
          error: "QUOTA_CHECK_UNAVAILABLE",
          message:
            "Unable to verify resource quota. Request denied for safety.",
          quotaKeys: checkedKeys,
        });
      } else {
        // Fail-open: allow request but log the error
        console.error(
          JSON.stringify({
            msg: "quota_guard_error",
            path: req.path,
            err: String(error),
          }),
        );
        next();
      }
    }
  };
}

/**
 * Resolve quota keys from the request route.
 */
function resolveQuotaKeysFromRoute(req: Request): string[] {
  const keys: string[] = [];
  for (const [prefix, quotaKey] of Object.entries(ROUTE_QUOTA_MAP)) {
    if (req.path.startsWith(prefix)) {
      keys.push(quotaKey);
      break; // Use most specific match
    }
  }
  return keys;
}
