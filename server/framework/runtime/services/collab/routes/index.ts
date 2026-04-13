import type { Router } from "express";
import { createCollabRoute, type CollabRouteDeps } from "./collab.route.js";

export function registerCollabRoutes(router: Router, deps: CollabRouteDeps): void {
  createCollabRoute(router, deps);
}
