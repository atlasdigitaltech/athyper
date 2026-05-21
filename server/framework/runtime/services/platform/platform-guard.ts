/**
 * Platform Route Guards
 *
 * Shared inline guards for platform service routes. Follow the same pattern
 * as the local adminGuard in commerce.route.ts — called inside route handlers,
 * not as Express middleware — so bearer is verified once and the result passed
 * to the permission check.
 *
 * checkPermission is imported directly from the IAM service (same as
 * jobs.board.route.ts) to avoid a circular dep through @athyper/svc-iam.
 */

import type { Request, Response } from "express";
import type { Kysely } from "kysely";
import { verifyBearer } from "@athyper/svc-shared";
import { checkPermission } from "../iam/permission/permission.service.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformGuardAuth {
  verifyToken(token: string): Promise<Record<string, unknown>>;
}

export interface PlatformGuardResult {
  claims: Record<string, unknown>;
  tenantId: string;
  principalId: string;
}

// ─── Guards ────────────────────────────────────────────────────────────────────

/**
 * Verifies bearer, resolves tenantId + principalId from claims, then checks
 * the given PLATFORM.* permission code via checkPermission().
 *
 * Returns a PlatformGuardResult on success, or sends 401/403 and returns null.
 * Call pattern: `const g = await requirePlatformPermission(...); if (!g) return;`
 */
export async function requirePlatformPermission(
  req:            Request,
  res:            Response,
  auth:           PlatformGuardAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:             Kysely<any>,
  permissionCode: string,
): Promise<PlatformGuardResult | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const tenantId    = typeof claims["tenant_id"]    === "string" ? claims["tenant_id"]    : null;
  const principalId = typeof claims["sub"]           === "string" ? claims["sub"]           :
                      typeof claims["principal_id"]  === "string" ? claims["principal_id"]  : null;

  if (!tenantId || !principalId) {
    res.status(400).json({ error: "MISSING_TENANT_OR_PRINCIPAL" });
    return null;
  }

  const result = await checkPermission(db, tenantId, principalId, permissionCode);
  if (result.decision !== "allow") {
    res.status(403).json({
      error:      "FORBIDDEN",
      permission: permissionCode,
      decision:   result.decision,
      reason:     result.reason,
    });
    return null;
  }

  return { claims, tenantId, principalId };
}

/**
 * Checks the PLATFORM_CATALOG_WRITABLE environment flag.
 * Returns true if writable; sends 403 and returns false otherwise.
 * Secondary safety latch — checkPermission is the primary authorization layer.
 */
export function requireCatalogWritable(res: Response): boolean {
  if (process.env["PLATFORM_CATALOG_WRITABLE"] !== "true") {
    res.status(403).json({
      error: "CATALOG_LOCKED",
      hint:  "Set PLATFORM_CATALOG_WRITABLE=true in env to enable catalog mutations",
    });
    return false;
  }
  return true;
}
