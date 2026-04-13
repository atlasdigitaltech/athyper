import type { Router } from "express";
import { createIntegrationRoutes, type IntegrationRouteDeps } from "./integration.route.js";

export { type IntegrationRouteDeps };

export function registerIntegrationRoutes(router: Router, deps: IntegrationRouteDeps): void {
  createIntegrationRoutes(router, deps);
}
