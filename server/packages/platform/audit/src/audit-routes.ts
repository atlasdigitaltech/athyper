import type { Application, RequestHandler } from "express";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";

export interface AuditRouteOptions {
  readonly authenticate: RequestHandler;
}

/** Authenticated route availability; this does not probe durable audit storage. */
export function registerAuditRoutes(application: Application, options: AuditRouteOptions): void {
  registerContractRoute(application, defineRouteContract({
    method: "get", path: "/api/audit/status", operationId: "audit.getStatus",
    summary: "Get audit route availability", tags: ["Audit"], authenticated: true,
    permission: "audit.status.read",
    responses: {
      200: { description: "Audit route available (not a storage health check)", body: {
        type: "object", required: ["status"], additionalProperties: false,
        properties: { status: { type: "string", const: "available" } },
      } },
      401: { description: "Authentication required" },
      403: { description: "Authentication rejected" },
      429: { description: "Too many requests" },
      503: { description: "Authentication authority or authentication audit unavailable" },
    },
  }), (request, response, next) => {
    // Keep authentication failures and conditional requests from being cached too.
    response.setHeader("Cache-Control", "private, no-store");
    return options.authenticate(request, response, next);
  }, (_request, response) => {
    response.status(200).json({ status: "available" });
  });
}
