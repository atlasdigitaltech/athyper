import type { Router } from "express";
import { createIntegrationRoutes, type IntegrationRouteDeps } from "./integration.route.js";
import { createWebhookReceiverRoute } from "./webhook-receiver.route.js";

export { type IntegrationRouteDeps };

export function registerIntegrationRoutes(router: Router, deps: IntegrationRouteDeps): void {
  createIntegrationRoutes(router, deps);
  // Inbound webhook receiver — no Bearer auth, HMAC-SHA256 only
  createWebhookReceiverRoute(router, { db: deps.db, logger: deps.logger });
}
