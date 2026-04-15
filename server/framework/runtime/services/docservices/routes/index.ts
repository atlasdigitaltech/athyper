import type { Router } from "express";
import { createDocServicesRoutes, type DocServicesRouteDeps } from "./docservices.route.js";

export { type DocServicesRouteDeps };

export function registerDocServicesRoutes(router: Router, deps: DocServicesRouteDeps): void {
  createDocServicesRoutes(router, deps);
}
