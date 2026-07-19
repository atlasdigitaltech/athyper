import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

import {
  extractOrgHeaders,
  resolvePrincipalIdOrNull,
  resolveTenantId,
  setCachePrivate,
  verifyBearer,
} from "@athyper/svc-shared";
import { checkPermission, requireAllow } from "../permission/permission.service.js";
import { createStepUpBinding, requireStepUp } from "../mfa/step-up.service.js";
import type { CacheClient } from "../session/session.service.js";
import {
  createTenantIdentityProviderService,
  TenantIdentityProviderValidationError,
} from "../providers/tenant-identity-provider.service.js";
import {
  TENANT_IDP_PROTOCOLS,
  TENANT_IDP_PROVIDER_TYPES,
  type TenantIdentityProviderInput,
  type TenantIdpPlane,
  type TenantIdpMfaTrustPolicy,
} from "../providers/tenant-identity-provider.js";

type AnyDb = Kysely<Record<string, any>>;

export interface IdentityProviderRoutesDeps {
  db: AnyDb;
  cache: CacheClient;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

async function resolveProviderAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  deps: IdentityProviderRoutesDeps,
): Promise<{ claims: Record<string, unknown>; sub: string; tenantId: string; principalId: string; realm: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
  if (!claims) return null;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }
  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(deps.db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header with a valid tenant is required" });
    return null;
  }
  const principalId = await resolvePrincipalIdOrNull(deps.db, sub, tenantId, xRealm);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }
  return { claims, sub, tenantId, principalId, realm: xRealm ?? "athyper" };
}

async function requireProviderPermission(
  db: AnyDb,
  tenantId: string,
  principalId: string,
  code: "IAM.IDP.READ" | "IAM.IDP.MANAGE",
  res: Parameters<RequestHandler>[1],
): Promise<boolean> {
  const decision = await checkPermission(db, tenantId, principalId, code);
  return requireAllow(decision, res);
}

export function createIdentityProviderRoutes(router: Router, deps: IdentityProviderRoutesDeps): Router {
  const registry = createTenantIdentityProviderService(deps.db, { logger: deps.logger });

  router.get("/iam/identity-providers", (async (req, res, next) => {
    try {
      const auth = await resolveProviderAuth(req, res, deps);
      if (!auth) return;
      if (!await requireProviderPermission(deps.db, auth.tenantId, auth.principalId, "IAM.IDP.READ", res)) return;
      const rawPlane = typeof req.query.plane === "string" ? req.query.plane : undefined;
      const plane = rawPlane && ["neon", "mesh", "admin"].includes(rawPlane) ? rawPlane as TenantIdpPlane : undefined;
      if (rawPlane && !plane) {
        res.status(400).json({ error: "INVALID_PLANE", message: "plane must be neon, mesh, or admin" });
        return;
      }
      setCachePrivate(res, 0);
      res.json({ providers: await registry.list(auth.tenantId, plane) });
    } catch (err) {
      deps.logger?.error("tenant_identity_provider_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/iam/identity-providers", (async (req, res, next) => {
    try {
      const auth = await resolveProviderAuth(req, res, deps);
      if (!auth) return;
      if (!await requireStepUp(deps.cache, createStepUpBinding(auth.claims, auth.sub, auth.tenantId, "iam_admin"), res)) return;
      if (!await requireProviderPermission(deps.db, auth.tenantId, auth.principalId, "IAM.IDP.MANAGE", res)) return;

      const body = req.body as Record<string, unknown>;
      const input = parseProviderInput(body);
      if (!input) {
        res.status(400).json({ error: "INVALID_BODY", message: "A provider type, protocol, alias, display name, configuration reference, and allowed planes are required." });
        return;
      }
      const provider = await registry.create(auth.tenantId, input, auth.principalId, auth.realm);
      res.status(201).json({ provider });
    } catch (err) {
      if (err instanceof TenantIdentityProviderValidationError) {
        res.status(422).json({ error: err.code, message: err.message, fields: err.errors });
        return;
      }
      deps.logger?.error("tenant_identity_provider_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/iam/identity-providers/:id/activate", (async (req, res, next) => {
    try {
      const auth = await resolveProviderAuth(req, res, deps);
      if (!auth) return;
      if (!await requireStepUp(deps.cache, createStepUpBinding(auth.claims, auth.sub, auth.tenantId, "iam_admin"), res)) return;
      if (!await requireProviderPermission(deps.db, auth.tenantId, auth.principalId, "IAM.IDP.MANAGE", res)) return;
      const provider = await registry.activate(auth.tenantId, String(req.params.id), auth.principalId);
      if (!provider) {
        res.status(404).json({ error: "PROVIDER_NOT_FOUND", message: "Identity provider was not found or its enterprise feature is disabled." });
        return;
      }
      res.json({ provider });
    } catch (err) {
      deps.logger?.error("tenant_identity_provider_activate_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/iam/identity-providers/:id/disable", (async (req, res, next) => {
    try {
      const auth = await resolveProviderAuth(req, res, deps);
      if (!auth) return;
      if (!await requireStepUp(deps.cache, createStepUpBinding(auth.claims, auth.sub, auth.tenantId, "iam_admin"), res)) return;
      if (!await requireProviderPermission(deps.db, auth.tenantId, auth.principalId, "IAM.IDP.MANAGE", res)) return;
      if (!await registry.disable(auth.tenantId, String(req.params.id), auth.principalId)) {
        res.status(404).json({ error: "PROVIDER_NOT_FOUND", message: "Identity provider was not found." });
        return;
      }
      res.status(204).end();
    } catch (err) {
      deps.logger?.error("tenant_identity_provider_disable_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.patch("/iam/identity-providers/:id/mfa-trust-policy", (async (req, res, next) => {
    try {
      const auth = await resolveProviderAuth(req, res, deps);
      if (!auth) return;
      if (!await requireStepUp(deps.cache, createStepUpBinding(auth.claims, auth.sub, auth.tenantId, "iam_admin"), res)) return;
      if (!await requireProviderPermission(deps.db, auth.tenantId, auth.principalId, "IAM.IDP.MANAGE", res)) return;
      const policy = (req.body as Record<string, unknown>)?.mfaTrustPolicy;
      if (policy !== "never" && policy !== "conditional" && policy !== "trusted-assurance") {
        res.status(422).json({
          error: "INVALID_MFA_TRUST_POLICY",
          message: "mfaTrustPolicy must be never, conditional, or trusted-assurance.",
        });
        return;
      }
      const provider = await registry.setMfaTrustPolicy(
        auth.tenantId,
        String(req.params.id),
        policy as TenantIdpMfaTrustPolicy,
        auth.principalId,
      );
      if (!provider) {
        res.status(404).json({ error: "PROVIDER_NOT_FOUND", message: "Identity provider was not found." });
        return;
      }
      res.json({ provider });
    } catch (err) {
      if (err instanceof TenantIdentityProviderValidationError) {
        res.status(422).json({ error: err.code, message: err.message, fields: err.errors });
        return;
      }
      deps.logger?.error("tenant_identity_provider_mfa_trust_policy_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

function parseProviderInput(body: Record<string, unknown>): TenantIdentityProviderInput | null {
  const alias = typeof body.alias === "string" ? body.alias : "";
  const protocol = typeof body.protocol === "string" && TENANT_IDP_PROTOCOLS.includes(body.protocol as never)
    ? body.protocol as TenantIdentityProviderInput["protocol"]
    : null;
  const providerType = typeof body.providerType === "string" && TENANT_IDP_PROVIDER_TYPES.includes(body.providerType as never)
    ? body.providerType as TenantIdentityProviderInput["providerType"]
    : null;
  const displayName = typeof body.displayName === "string" ? body.displayName : "";
  const configurationRef = typeof body.configurationRef === "string" ? body.configurationRef : "";
  const allowedPlanes = Array.isArray(body.allowedPlanes)
    ? body.allowedPlanes.filter((value): value is TenantIdpPlane => ["neon", "mesh", "admin"].includes(String(value)))
    : [];
  if (!protocol || !providerType || !alias || !displayName || !configurationRef || allowedPlanes.length === 0) return null;
  return {
    alias,
    protocol,
    providerType,
    displayName,
    configurationRef,
    allowedPlanes,
    loginMode: typeof body.loginMode === "string" ? body.loginMode as TenantIdentityProviderInput["loginMode"] : undefined,
    firstLoginPolicy: typeof body.firstLoginPolicy === "string" ? body.firstLoginPolicy as TenantIdentityProviderInput["firstLoginPolicy"] : undefined,
    mfaTrustPolicy: typeof body.mfaTrustPolicy === "string" ? body.mfaTrustPolicy as TenantIdentityProviderInput["mfaTrustPolicy"] : undefined,
    featureGate: typeof body.featureGate === "string" ? body.featureGate as TenantIdentityProviderInput["featureGate"] : undefined,
  };
}
