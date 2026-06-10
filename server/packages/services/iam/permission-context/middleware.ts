// Express middleware factory that builds an EffectivePermissionContext for the
// active request and stashes it on `res.locals.effectivePermissionContext` so
// downstream handlers can read it without re-querying the DB.
//
// The factory takes a `readContextInput` callback that pulls planeKey,
// tenantId, principalId from wherever the host runtime keeps them (AsyncLocal
// storage, request headers, JWT claims, etc.). Returning `null` from the
// callback skips middleware silently — useful for unauthenticated public
// routes — but downstream code must then handle `undefined` itself.

import type { NextFunction, Request, Response } from "express";

import { buildEffectivePermissionContext } from "./context-builder.js";
import type { PermissionResolverRegistry } from "./resolvers/registry.js";
import type {
  EffectivePermissionContext,
  ResolverInput,
} from "./types.js";

/**
 * Convenience accessor: pull the context placed on `res.locals` by the
 * middleware. Returns undefined when the middleware skipped this request
 * (public route) or when called before the middleware fired.
 */
export function readEffectivePermissionContext(
  res: Response,
): EffectivePermissionContext | undefined {
  const locals = res.locals as Record<string, unknown>;
  return locals["effectivePermissionContext"] as
    | EffectivePermissionContext
    | undefined;
}

export interface PermissionContextMiddlewareDeps {
  registry: PermissionResolverRegistry;
  /**
   * Pulls the resolver input from the request. Return null to skip context
   * building for this request (e.g. public/unauthenticated routes).
   */
  readContextInput: (req: Request) => ResolverInput | null;
  /**
   * Optional logger callback. Called on resolver failure so the host can
   * report it via pino/sentry without coupling the middleware to a logger.
   */
  onError?: (err: unknown, req: Request) => void;
  /**
   * Optional success callback. Called after a context is built, so the host
   * can stamp it into request-context AsyncLocalStorage or emit metrics.
   */
  onResolved?: (ctx: EffectivePermissionContext, req: Request) => void;
}

export function createPermissionContextMiddleware(
  deps: PermissionContextMiddlewareDeps,
) {
  const { registry, readContextInput, onError, onResolved } = deps;

  return async function permissionContextMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const input = readContextInput(req);
      if (!input) {
        next();
        return;
      }

      const ctx = await buildEffectivePermissionContext(registry, input);
      (res.locals as Record<string, unknown>)["effectivePermissionContext"] = ctx;
      onResolved?.(ctx, req);
      next();
    } catch (err) {
      onError?.(err, req);
      // Mesh resolver throws on missing binding — surface as 403 so the BFF
      // can redirect to a "binding revoked" screen instead of a 500.
      if (isBindingError(err)) {
        res.status(403).json({
          error: "binding_required",
          message: err instanceof Error ? err.message : "no active binding",
        });
        return;
      }
      next(err);
    }
  };
}

function isBindingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("no active account_grant");
}
