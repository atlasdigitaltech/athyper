/**
 * BFF endpoint for source-change resolvers.
 *
 *   POST /api/resolvers/:code   { inputs: { ... } } → { value }
 *
 * Mounted by the main API router. The Neon BFF (apps/neon) relays POSTs
 * to /api/runtime/v1/resolvers/:code through to this endpoint.
 *
 * Spec: docs/specs/source-change-resolver-registry.md
 */

import type { RequestHandler, Response, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  SYSTEM_PRINCIPAL_UUID,
} from "../route-helpers.js";
import { runResolver } from "./runner.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface ResolverRoutesDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

function jsonError(res: Response, status: number, code: string, message: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ error: code, message, ...(extra ?? {}) });
}

function readInputs(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const inputs = (body as Record<string, unknown>)["inputs"];
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return null;
  return inputs as Record<string, unknown>;
}

export function createResolverRoute(router: Router, deps: ResolverRoutesDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res) => {
    const codeParam = req.params["code"];
    const code = (typeof codeParam === "string" ? codeParam : "").trim();
    if (!code) {
      jsonError(res, 400, "BAD_REQUEST", "Resolver code missing in path");
      return;
    }

    const claims = await verifyBearer(String(req.headers["authorization"] ?? ""), auth, res);
    if (!claims) return;

    const xOrg   = (req.headers["x-org"]   as string) ?? "";
    const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) {
      jsonError(res, 401, "UNAUTHENTICATED", "Tenant could not be resolved from session.");
      return;
    }

    const sub = String(claims["sub"] ?? "");
    const userId = sub
      ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm)) ?? SYSTEM_PRINCIPAL_UUID
      : SYSTEM_PRINCIPAL_UUID;

    const inputs = readInputs(req.body);
    if (!inputs) {
      jsonError(res, 400, "BAD_REQUEST", "Body must be { inputs: { ... } }");
      return;
    }

    const result = await runResolver(code, inputs, { db, tenantId, userId });

    if (!result.ok) {
      logger?.info?.("resolver.failed", { code, errCode: result.code });
      const status =
        result.code === "RESOLVER_NOT_FOUND"      ? 404 :
        result.code === "RESOLVER_MISSING_INPUTS" ? 400 :
        result.code === "RESOLVER_INPUT_INVALID"  ? 422 :
                                                    500;
      jsonError(res, status, result.code, result.message, result.code === "RESOLVER_MISSING_INPUTS"
        ? { missingKeys: result.missingKeys }
        : undefined);
      return;
    }

    res.status(200).json({ value: result.value });
  };

  router.post("/resolvers/:code", handler);
  router.post("/runtime/v1/resolvers/:code", handler);
  return router;
}
