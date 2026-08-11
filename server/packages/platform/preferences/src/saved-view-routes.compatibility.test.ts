import type { Application, RequestHandler } from "express";
import { describe, expect, it } from "vitest";
import { registerSavedViewRoutes } from "./saved-view-routes.js";

describe("saved-view legacy route compatibility", () => {
  it("registers canonical operations and both user alias namespaces behind authentication", () => {
    const routes: Array<{ method: string; path: string; handlers: RequestHandler[] }> = [];
    const app = Object.fromEntries(["get", "post", "put", "patch", "delete"].map((method) => [method, (path: string, ...handlers: RequestHandler[]) => { routes.push({ method: method.toUpperCase(), path, handlers }); }])) as unknown as Application;
    const authenticate = ((_request, _response, next) => next()) as RequestHandler;
    registerSavedViewRoutes(app, { authenticate, readContext: (() => ({})) as never, savedViews: {} as never });
    const identities = new Set(routes.map(({ method, path }) => `${method} ${path}`));
    for (const identity of [
      "PUT /api/platform/preferences/saved-views/:id", "DELETE /api/platform/preferences/saved-views/:id",
      "POST /api/platform/preferences/saved-views/:id/clone", "PATCH /api/platform/preferences/saved-views/:id/actions/:action",
      "PATCH /api/platform/saved-views/:entity/:viewId/default", "DELETE /api/platform/saved-views/:entity/default",
      "GET /api/me/saved-views", "PATCH /api/me/saved-views/:viewId/:action", "POST /api/me/saved-views/:viewId/clone",
      "GET /api/user/saved-views", "PATCH /api/user/saved-views/:viewId/:action", "POST /api/user/saved-views/:viewId/clone",
    ]) expect(identities.has(identity), identity).toBe(true);
    expect(routes.every((route) => route.handlers[0] === authenticate)).toBe(true);
  });
});
