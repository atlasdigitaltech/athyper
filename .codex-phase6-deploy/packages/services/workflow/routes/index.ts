import type { Router } from "express";
import { createWorkflowRoutes, type WorkflowRouteDeps } from "./workflow.route.js";
import { createWorkflowAdminRoutes } from "./admin.route.js";

export { type WorkflowRouteDeps };

export function registerWorkflowRoutes(router: Router, deps: WorkflowRouteDeps): void {
  createWorkflowRoutes(router, deps);
  createWorkflowAdminRoutes(router, deps);
}
