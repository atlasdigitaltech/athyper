import type { Application, RequestHandler } from "express";

export interface AuditRouteOptions {
  readonly authenticate: RequestHandler;
}

/** Minimal operational route; event querying remains behind a future governed reader port. */
export function registerAuditRoutes(application: Application, options: AuditRouteOptions): void {
  application.get("/api/audit/status", options.authenticate, (_request, response) => {
    response.status(200).json({ status: "available" });
  });
}
