import type { AuthorizationManagementCommand, AuthorizationManagementService, AuthorizationMutationKind, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminSchemas } from "@athyper/server-contract-control-admin";
import { HttpError, defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, Request, RequestHandler, Response } from "express";
import { authorizationManagementPermissionFor } from "./authorization-management-service.js";

type MutationRoute = "manage" | "approve" | "revoke" | "break-glass";

/**
 * Registers distinct C4 surfaces so a broad management grant cannot be used to
 * approve, revoke, or invoke break-glass through a generic command endpoint.
 */
export function registerAuthorizationManagementRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly service: AuthorizationManagementService }): void {
  registerContractRoute(application, defineRouteContract({ method: "get", path: "/api/control-admin/authorization", operationId: "controlAdmin.authorization.read", summary: "Read authorization administration status", tags: ["Control Administration"], authenticated: true, permission: "authorization.management.read", responses: { 200: { description: "Authorization administration status", body: controlAdminSchemas.response }, 401: { description: "Authentication required" }, 403: { description: "Permission denied" }, 503: { description: "Authorization writer unavailable or not ready" } } }), options.authenticate, route(async (_request, response) => options.service.readStatus(options.readContext(response))));
  for (const action of ["manage", "approve", "revoke", "break-glass"] as const) {
    registerContractRoute(application, defineRouteContract({ method: "post", path: `/api/control-admin/authorization/${action}`, operationId: `controlAdmin.authorization.${action.replace("-", "_")}`, summary: `${action} an authorization administration command`, tags: ["Control Administration"], authenticated: true, permission: `authorization.management.${action === "break-glass" ? "break_glass" : action}`, request: { body: controlAdminSchemas.authorizationCommand }, responses: { 200: { description: "Authorization command result", body: controlAdminSchemas.response }, 400: { description: "Invalid command" }, 401: { description: "Authentication required" }, 403: { description: "Permission denied" }, 404: { description: "Override request not found" }, 409: { description: "Version or approval conflict" }, 503: { description: "Authorization writer unavailable or not ready" } } }), options.authenticate, route(async (request, response) => {
      const command = parseCommand(request, options.readContext(response));
      assertRouteMatchesPermission(action, command.kind);
      return options.service.execute(command);
    }));
  }
}

export function assertRouteMatchesPermission(routeName: MutationRoute, kind: AuthorizationMutationKind): void {
  const permission = authorizationManagementPermissionFor(kind);
  const expected = `authorization.management.${routeName === "break-glass" ? "break_glass" : routeName}`;
  if (permission !== expected) throw invalid("AUTHZ_MUTATION_ROUTE_MISMATCH");
}

function parseCommand(request: Request, context: VerifiedRequestContext): AuthorizationManagementCommand {
  const value = request.body;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("AUTHZ_INVALID_COMMAND");
  const body = value as Record<string, unknown>;
  const kind = required(body["kind"]) as AuthorizationMutationKind;
  const payload = body["payload"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid("AUTHZ_INVALID_COMMAND");
  const expectedVersion = optionalPositive(body["expectedVersion"]);
  return {
    context,
    kind,
    commandId: required(body["commandId"]),
    idempotencyKey: required(body["idempotencyKey"]),
    payload: payload as Readonly<Record<string, unknown>>,
    ...(optional(body["resourceId"]) ? { resourceId: optional(body["resourceId"]) } : {}),
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    ...(optional(body["effectiveFrom"]) ? { effectiveFrom: optional(body["effectiveFrom"]) } : {}),
    ...(optional(body["effectiveUntil"]) ? { effectiveUntil: optional(body["effectiveUntil"]) } : {}),
  };
}

function route(work: (request: Request, response: Response) => Promise<unknown>) { return async (request: Request, response: Response, next: (error?: unknown) => void) => { try { response.json(await work(request, response)); } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("AUTHZ_") && "status" in error && typeof error.status === "number" && [400, 403, 404, 409, 503].includes(error.status)) {
      next(new HttpError(error.status, error.code, error.code));
    } else next(error);
  } }; }
function required(value: unknown): string { const text = optional(value); if (!text) throw invalid("AUTHZ_INVALID_COMMAND"); return text; }
function optional(value: unknown): string | undefined { if (value === undefined) return undefined; if (typeof value !== "string" || !value.trim()) throw invalid("AUTHZ_INVALID_COMMAND"); return value.trim(); }
function optionalPositive(value: unknown): number | undefined { if (value === undefined) return undefined; const number = value; if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) throw invalid("AUTHZ_INVALID_EXPECTED_VERSION"); return number; }
function invalid(code: string): Error { return Object.assign(new TypeError(code), { code, status: 400 }); }
