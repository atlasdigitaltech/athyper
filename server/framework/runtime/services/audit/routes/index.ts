import type { Router } from "express";
import { createAuditRoutes, type AuditRouteDeps } from "./audit.route.js";
import { createGovernanceRoutes, type GovernanceRouteDeps } from "./governance.route.js";
import { createModerationRoutes, type ModerationRouteDeps } from "./moderation.route.js";

export type { AuditRouteDeps, GovernanceRouteDeps, ModerationRouteDeps };

export type AuditServiceDeps = AuditRouteDeps & GovernanceRouteDeps & ModerationRouteDeps;

export function registerAuditRoutes(router: Router, deps: AuditServiceDeps): void {
  createAuditRoutes(router, deps);
  createGovernanceRoutes(router, deps);
  createModerationRoutes(router, deps);
}
