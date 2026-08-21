import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, Request, RequestHandler, Response } from "express";
import { SavedViewError, SavedViewVersionConflict, type createSavedViewService } from "./index.js";

type Service = ReturnType<typeof createSavedViewService>;
export interface SavedViewRouteOptions { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly savedViews: Service; }

export function registerSavedViewRoutes(app: Application, options: SavedViewRouteOptions): void {
  const list: RequestHandler = async (request, response, next) => run(response, next, async () => {
    const context = options.readContext(response);
    const entityCode = parameter(request, "entity") ?? query(request, "entity");
    const surfaceCode = query(request, "surface");
    const savedViews = await options.savedViews.list(context, { ...(entityCode ? { entityCode } : {}), ...(surfaceCode ? { surfaceCode } : {}), ...(query(request, "includeArchived") === "true" ? { includeArchived: true } : {}) });
    response.status(200).json(request.path.includes("/preferences/") ? { savedViews } : savedViews);
  });
  const create: RequestHandler = async (request, response, next) => run(response, next, async () => {
    const context = options.readContext(response), value = body(request.body);
    const entityCode = parameter(request, "entity") ?? string(value["entityCode"] ?? value["entity_code"], "entityCode");
    const name = string(value["name"], "name");
    const code = optionalString(value["code"]) ?? `${slug(name)}_${Date.now().toString(36)}`;
    const view = await options.savedViews.create(context, { surfaceCode: optionalString(value["surfaceCode"] ?? value["surface_code"]) ?? "entity_list", entityCode, code, name, ...(optionalString(value["description"]) ? { description: optionalString(value["description"]) } : {}), state: object(value["state"] ?? value["config"] ?? {}), metadata: object(value["metadata"] ?? {}) });
    response.setHeader("ETag", `"${view.version}"`); response.status(201).json(view);
  });
  const replace: RequestHandler = async (request, response, next) => run(response, next, async () => {
    const context = options.readContext(response), value = body(request.body);
    const view = await options.savedViews.replace(context, requiredParameter(request, "id", "viewId"), match(request.headers["if-match"]), { name: string(value["name"], "name"), state: object(value["state"] ?? value["config"] ?? {}), ...(optionalString(value["description"]) ? { description: optionalString(value["description"]) } : {}) });
    response.setHeader("ETag", `"${view.version}"`); response.status(200).json(view);
  });
  const remove: RequestHandler = async (request, response, next) => run(response, next, async () => { await options.savedViews.remove(options.readContext(response), requiredParameter(request, "id", "viewId")); response.status(204).end(); });
  const setDefault: RequestHandler = async (request, response, next) => run(response, next, async () => { await options.savedViews.setDefault(options.readContext(response), requiredParameter(request, "entity"), requiredParameter(request, "viewId", "id")); response.status(200).json({ ok: true }); });
  const clearDefault: RequestHandler = async (request, response, next) => run(response, next, async () => { await options.savedViews.clearDefault(options.readContext(response), requiredParameter(request, "entity")); response.status(200).json({ ok: true }); });
  const clone: RequestHandler = async (request, response, next) => run(response, next, async () => { const value = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {}; const view = await options.savedViews.clone(options.readContext(response), requiredParameter(request, "id", "viewId"), optionalString(value["name"])); response.status(201).json(view); });
  const action: RequestHandler = async (request, response, next) => run(response, next, async () => {
    const context = options.readContext(response), id = requiredParameter(request, "id", "viewId"), actionName = requiredParameter(request, "action").toLowerCase();
    if (actionName === "pin" || actionName === "star") response.status(200).json({ ok: true, ...await options.savedViews.toggleFlag(context, id, actionName === "pin" ? "pinned" : "starred") });
    else if (actionName === "share") { await options.savedViews.setShared(context, id, request.method !== "DELETE"); response.status(200).json({ ok: true }); }
    else if (actionName === "archive" || actionName === "delete") { await options.savedViews.archive(context, id); response.status(200).json({ ok: true }); }
    else throw new SavedViewError(400, "SAVED_VIEW_ACTION_INVALID", `Unsupported saved-view action: ${actionName}`);
  });

  app.get("/api/platform/preferences/saved-views", options.authenticate, list);
  app.post("/api/platform/preferences/saved-views", options.authenticate, create);
  app.put("/api/platform/preferences/saved-views/:id", options.authenticate, replace);
  app.delete("/api/platform/preferences/saved-views/:id", options.authenticate, remove);
  app.post("/api/platform/preferences/saved-views/:id/clone", options.authenticate, clone);
  app.patch("/api/platform/preferences/saved-views/:id/actions/:action", options.authenticate, action);
  app.delete("/api/platform/preferences/saved-views/:id/actions/:action", options.authenticate, action);

  app.get("/api/platform/saved-views/:entity", options.authenticate, list);
  app.post("/api/platform/saved-views/:entity", options.authenticate, create);
  app.post("/api/platform/saved-views", options.authenticate, create);
  app.patch("/api/platform/saved-views/:entity/:viewId", options.authenticate, replace);
  app.delete("/api/platform/saved-views/:entity/:viewId", options.authenticate, remove);
  app.patch("/api/platform/saved-views/:entity/:viewId/default", options.authenticate, setDefault);
  app.delete("/api/platform/saved-views/:entity/default", options.authenticate, clearDefault);

  for (const namespace of ["me", "user"] as const) {
    app.get(`/api/${namespace}/saved-views`, options.authenticate, list);
    app.patch(`/api/${namespace}/saved-views/:viewId/:action`, options.authenticate, action);
    app.delete(`/api/${namespace}/saved-views/:viewId/:action`, options.authenticate, action);
    app.post(`/api/${namespace}/saved-views/:viewId/clone`, options.authenticate, clone);
  }
}

async function run(response: Response, next: (error?: unknown) => void, work: () => Promise<void>): Promise<void> {
  try { await work(); }
  catch (error) {
    if (error instanceof SavedViewVersionConflict) problem(response, 409, "SAVED_VIEW_VERSION_CONFLICT", error.message);
    else if (error instanceof SavedViewError) problem(response, error.status, error.code, error.message);
    else if (error instanceof TypeError) problem(response, 400, "SAVED_VIEW_INVALID", error.message);
    else next(error);
  }
}
function problem(response: Response, status: number, code: string, detail: string): void { response.status(status).type("application/problem+json").json({ type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail, code }); }
function body(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("JSON object required"); return value as Record<string, unknown>; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`); return value.trim(); }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function parameter(request: Request, ...names: string[]): string | undefined { for (const name of names) { const value = request.params[name]; if (typeof value === "string" && value.trim()) return value.trim(); } return undefined; }
function requiredParameter(request: Request, ...names: string[]): string { return parameter(request, ...names) ?? (() => { throw new TypeError(`${names[0]} is required`); })(); }
function query(request: Request, name: string): string | undefined { const value = request.query[name]; return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function match(value: unknown): number { const found = typeof value === "string" ? /^(?:W\/)?"?(\d+)"?$/.exec(value.trim()) : null; if (!found) throw new TypeError("If-Match is required"); return Number(found[1]); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "view"; }
