import type { RequestHandler, Router } from "express";

import {
  createTenantDiscoveryService,
  type PlaneKey,
} from "../discovery/discovery.service.js";

export interface DiscoveryRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meshDb?: import("kysely").Kysely<any>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

const PLANE_KEYS = new Set(["neon", "mesh", "admin"]);
const GENERIC_DELAY_MS = 180;

function normalizePlaneKey(value: unknown): PlaneKey | null {
  if (typeof value !== "string") return null;
  const plane = value.toLowerCase();
  return PLANE_KEYS.has(plane) ? (plane as PlaneKey) : null;
}

function normalizeDiscoveryIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const identifier = value.trim().toLowerCase();
  if (!identifier || /\s/.test(identifier) || identifier.length > 320) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return identifier;
  if (identifier.includes("@") || identifier.length > 128) return null;
  return /^[a-z0-9._-]+$/.test(identifier) ? identifier : null;
}

function discoverySecretConfigured(): boolean {
  return Boolean(process.env.AUTH_DISCOVERY_SHARED_SECRET);
}

function shouldRequireDiscoverySecret(): boolean {
  return discoverySecretConfigured()
    || process.env.ENVIRONMENT === "production"
    || process.env.NODE_ENV === "production";
}

function isAuthorizedDiscoveryRequest(secret: string | undefined): boolean {
  const configured = process.env.AUTH_DISCOVERY_SHARED_SECRET;
  if (!configured) return !shouldRequireDiscoverySecret();
  return secret === configured;
}

async function minimumDelay(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < GENERIC_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, GENERIC_DELAY_MS - elapsed));
  }
}

export function createDiscoveryRoutes(router: Router, deps: DiscoveryRoutesDeps): Router {
  const discovery = createTenantDiscoveryService(deps.db, deps.meshDb);

  const postDiscovery: RequestHandler = async (req, res, next) => {
    const startedAt = Date.now();
    try {
      if (!isAuthorizedDiscoveryRequest(req.header("x-discovery-secret") ?? undefined)) {
        await minimumDelay(startedAt);
        res.status(discoverySecretConfigured() ? 403 : 503).json({
          error: discoverySecretConfigured() ? "DISCOVERY_FORBIDDEN" : "DISCOVERY_NOT_CONFIGURED",
          message: discoverySecretConfigured()
            ? "Discovery resolver access denied."
            : "Discovery resolver secret is required in this environment.",
        });
        return;
      }

      const body = req.body as Record<string, unknown> | undefined;
      const planeKey = normalizePlaneKey(body?.["planeKey"] ?? body?.["plane"]);
      const identifier = normalizeDiscoveryIdentifier(
        body?.["identifier"] ?? body?.["email"] ?? body?.["username"] ?? body?.["userId"],
      );
      if (!planeKey || !identifier) {
        await minimumDelay(startedAt);
        res.status(400).json({ error: "INVALID_DISCOVERY_REQUEST" });
        return;
      }

      const result = await discovery.discover({ planeKey, identifier });
      await minimumDelay(startedAt);
      res.json(result);
    } catch (err) {
      deps.logger?.error("tenant_discovery_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/auth/discovery", postDiscovery);
  return router;
}
