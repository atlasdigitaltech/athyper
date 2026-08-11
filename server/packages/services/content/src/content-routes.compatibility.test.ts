import type { Application, RequestHandler } from "express";
import { describe, expect, it } from "vitest";
import { registerContentRoutes } from "./content-routes.js";

describe("content legacy route compatibility", () => {
  it("registers links, content-scoped attachments, versions, and ACL behind authentication", () => {
    const routes: Array<{ method: string; path: string; handlers: RequestHandler[] }> = [];
    const app = Object.fromEntries(["get", "post", "patch", "delete"].map((method) => [method, (path: string, ...handlers: RequestHandler[]) => { routes.push({ method: method.toUpperCase(), path, handlers }); }])) as unknown as Application;
    const authenticate = ((_request, _response, next) => next()) as RequestHandler;
    registerContentRoutes(app, { authenticate, readContext: (() => ({})) as never, content: { search: undefined } as never, resources: {} as never });
    const identities = routes.map(({ method, path }) => `${method} ${path}`);
    expect(identities).toEqual(expect.arrayContaining([
      "GET /api/content/items/:id/links", "POST /api/content/items/:id/links", "DELETE /api/content/items/:id/links/:linkId",
      "GET /api/content/items/:id/attachments", "POST /api/content/items/:id/attachments", "DELETE /api/content/items/:id/attachments/:attachmentId",
      "GET /api/content/items/:id/attachments/:attachmentId/versions",
      "GET /api/content/items/:id/acl", "POST /api/content/items/:id/acl", "DELETE /api/content/items/:id/acl/:grantId",
    ]));
    expect(routes.every((route) => route.handlers[0] === authenticate)).toBe(true);
  });
});
