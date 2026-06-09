import type { Router } from "express";
import { createContentRoutes, type ContentRouteDeps } from "./content.route.js";

export { type ContentRouteDeps };

export function registerContentRoutes(router: Router, deps: ContentRouteDeps): void {
  createContentRoutes(router, deps);
}
