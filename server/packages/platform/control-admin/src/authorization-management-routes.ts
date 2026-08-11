import type { AuthorizationManagementCommand, AuthorizationManagementService, AuthorizationMutationKind, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, Request, RequestHandler, Response } from "express";
import { authorizationManagementPermissionFor } from "./authorization-management-service.js";

type MutationRoute = "manage" | "approve" | "revoke" | "break-glass";

/**
 * Registers distinct C4 surfaces so a broad management grant cannot be used to
 * approve, revoke, or invoke break-glass through a generic command endpoint.
 */
export function registerAuthorizationManagementRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly service: AuthorizationManagementService }): void {
  application.get("/api/control-admin/authorization", options.authenticate, route(async (_request, response) => options.service.readStatus(options.readContext(response))));
  for (const action of ["manage", "approve", "revoke", "break-glass"] as const) {
    application.post(`/api/control-admin/authorization/${action}`, options.authenticate, route(async (request, response) => {
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

function route(work: (request: Request, response: Response) => Promise<unknown>) { return async (request: Request, response: Response, next: (error?: unknown) => void) => { try { response.json(await work(request, response)); } catch (error) { next(error); } }; }
function required(value: unknown): string { const text = optional(value); if (!text) throw invalid("AUTHZ_INVALID_COMMAND"); return text; }
function optional(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function optionalPositive(value: unknown): number | undefined { if (value === undefined) return undefined; const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw invalid("AUTHZ_INVALID_EXPECTED_VERSION"); return number; }
function invalid(code: string): Error { return Object.assign(new TypeError(code), { code, status: 400 }); }
