import type { Router } from "express";
import { createPolicyRoutes, type PolicyRouteDeps } from "./policy.route.js";

export { type PolicyRouteDeps };

export function registerPolicyRoutes(router: Router, deps: PolicyRouteDeps): void {
  createPolicyRoutes(router, deps);
}
