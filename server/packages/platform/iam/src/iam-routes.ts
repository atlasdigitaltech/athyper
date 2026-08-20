import type { Application, Request, RequestHandler, Response } from "express";
import type { Authenticator, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { normalizePlaneKey, runWithRequestContext, type PlaneKey, type PlaneKeyInput } from "@athyper/server-foundation/context";
import { HttpError, defineRouteContract, registerContractRoute, sendProblem } from "@athyper/server-runtime-http";
import type { ProvisioningVertical } from "./provisioning-vertical.js";

const CONTEXT_LOCAL = "verifiedRequestContext";

export function readVerifiedRequestContext(response: Response): VerifiedRequestContext {
  const context = response.locals[CONTEXT_LOCAL] as VerifiedRequestContext | undefined;
  if (!context) throw new Error("Verified request context is unavailable; authentication middleware must run first");
  return context;
}

export interface IamRouteOptions {
  readonly authenticator: Authenticator;
  readonly provisioning?: ProvisioningVertical;
}

export function registerIamRoutes(application: Application, options: IamRouteOptions): void {
  const authenticate = createIamAuthenticationMiddleware(options.authenticator);
  registerContractRoute(application, defineRouteContract({
    method: "get", path: "/api/iam/me", operationId: "iam.getCurrentPrincipal",
    summary: "Get the verified request principal", tags: ["IAM"], authenticated: true, permission: "iam.profile.read",
    responses: { 200: { description: "Verified principal", body: { type: "object" } }, 401: { description: "Authentication required" }, 403: { description: "Authentication rejected" } },
  }), authenticate, (_request, response) => {
    const context = response.locals[CONTEXT_LOCAL] as VerifiedRequestContext;
    response.status(200).json({
      planeKey: context.planeKey,
      realmKey: context.realmKey,
      tenantId: context.tenantId,
      principalId: context.principalId,
      authEpoch: context.authEpoch,
      permissions: context.permissions.allowed,
      requestId: context.requestId,
    });
  });
  if (options.provisioning) registerProvisioningRoute(application, authenticate, options.provisioning);
}

function registerProvisioningRoute(application: Application, authenticate: RequestHandler, provisioning: ProvisioningVertical): void {
  registerContractRoute(application, defineRouteContract({
    method: "post", path: "/api/iam/provisioning-requests", operationId: "iam.createProvisioningRequest",
    summary: "Create an idempotent identity provisioning request", tags: ["IAM"], authenticated: true,
    permission: "iam.provisioning.create",
    request: {
      headers: { type: "object", properties: { "idempotency-key": { type: "string", minLength: 16, maxLength: 128 } } },
      body: { type: "object", properties: { identifier: { type: "string" }, realmKey: { type: "string" }, planes: { type: "array", items: { type: "string", enum: ["studio", "neon", "mesh"] } } }, required: ["identifier", "planes"] },
    },
    responses: { 201: { description: "Provisioning request created", body: { type: "object" } }, 200: { description: "Idempotent replay", body: { type: "object" } }, 400: { description: "Invalid request" }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 409: { description: "Idempotency conflict" }, 428: { description: "Idempotency key required" } },
  }), authenticate, async (request, response, next) => {
    try {
      const value = request.body as { identifier?: unknown; realmKey?: unknown; planes?: unknown };
      const identifier = typeof value.identifier === "string" ? value.identifier : "";
      const realmKey = typeof value.realmKey === "string" ? value.realmKey : undefined;
      const planes = Array.isArray(value.planes) ? value.planes.filter((item): item is PlaneKey => item === "studio" || item === "neon" || item === "mesh") : [];
      if (!identifier.trim() || planes.length !== (Array.isArray(value.planes) ? value.planes.length : -1)) throw new HttpError(400, "IAM_PROVISIONING_REQUEST_INVALID", "identifier and valid target planes are required");
      const result = await provisioning.request({ context: readVerifiedRequestContext(response), idempotencyKey: header(request, "idempotency-key"), identifier, planes, ...(realmKey ? { realmKey } : {}) });
      if (result.kind === "Created") { response.status(201).json(result); return; }
      if (result.kind === "Replayed") { response.status(200).json(result); return; }
      if (result.kind === "Forbidden") throw new HttpError(403, "IAM_PROVISIONING_FORBIDDEN", "The verified principal cannot create provisioning requests");
      const status = result.reason === "required" ? 428 : result.reason === "invalid" ? 400 : 409;
      throw new HttpError(status, "IAM_PROVISIONING_IDEMPOTENCY_CONFLICT", `Idempotency key is ${result.reason}`);
    } catch (error) { next(error instanceof TypeError ? new HttpError(400, "IAM_PROVISIONING_REQUEST_INVALID", error.message) : error); }
  });
}

export function createIamAuthenticationMiddleware(authenticator: Authenticator): RequestHandler {
  return async (request, response, next) => {
    const token = bearerToken(request);
    const planeKey = planeHeader(request);
    if (!token || !planeKey) {
      sendProblem(response, request, new HttpError(401, "AUTH_TOKEN_REQUIRED", "Bearer token and x-plane are required"));
      return;
    }
    const requestId = response.getHeader("X-Request-Id");
    const requestedTenant = header(request, "x-tenant-id");
    const requestedRealm = header(request, "x-realm");
    const requestedOrganization = header(request, "x-organization-id");
    const requestedAuthEpoch = nonnegativeIntegerHeader(request, "x-auth-epoch");
    const result = await authenticator.authenticate({
      token,
      planeKey,
      requestId: typeof requestId === "string" ? requestId : "unknown",
      ...(header(request, "x-correlation-id") ? { correlationId: header(request, "x-correlation-id") } : {}),
      route: { path: request.path, method: request.method },
      requestedContext: {
        ...(requestedTenant ? { tenantId: requestedTenant } : {}),
        ...(requestedRealm ? { realmKey: requestedRealm } : {}),
        ...(requestedOrganization ? { organizationId: requestedOrganization } : {}),
        ...(requestedAuthEpoch !== undefined ? { authEpoch: requestedAuthEpoch } : {}),
      },
    });
    if (!result.ok) {
      sendProblem(response, request, new HttpError(result.status, result.code, result.message));
      return;
    }
    response.locals[CONTEXT_LOCAL] = result.context;
    runWithRequestContext(Object.freeze({
      requestId: result.context.requestId,
      ...(result.context.correlationId ? { correlationId: result.context.correlationId } : {}),
      planeKey: result.context.planeKey,
      tenantId: result.context.tenantId,
      principalId: result.context.principalId,
    }), next);
  };
}

function nonnegativeIntegerHeader(request: Request, name: string): number | undefined {
  const value = header(request, name); if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function bearerToken(request: Request): string | undefined {
  const authorization = header(request, "authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}

function planeHeader(request: Request): PlaneKey | undefined {
  const value = header(request, "x-plane")?.toLowerCase();
  return value === "studio" || value === "neon" || value === "mesh"
    ? normalizePlaneKey(value as PlaneKeyInput)
    : undefined;
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : undefined;
}
