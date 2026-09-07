import { randomUUID } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, Request, RequestHandler, Response } from "express";
import {
  SavedViewError,
  SavedViewVersionConflict,
  type createSavedViewService,
} from "./index.js";

type Service = ReturnType<typeof createSavedViewService>;
export interface SavedViewRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly savedViews: Service;
}

export function registerSavedViewRoutes(
  app: Application,
  options: SavedViewRouteOptions,
): void {
  const list: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      const context = options.readContext(response);
      const entityCode =
        parameter(request, "entity") ?? query(request, "entity");
      const surfaceCode = query(request, "surface");
      const includeArchived = query(request, "includeArchived");
      if (includeArchived !== undefined && !["true", "false"].includes(includeArchived))
        throw new TypeError("includeArchived must be true or false");
      const savedViews = await options.savedViews.list(context, {
        ...(entityCode ? { entityCode } : {}),
        ...(surfaceCode ? { surfaceCode } : {}),
        ...(includeArchived === "true"
          ? { includeArchived: true }
          : {}),
      });
      response
        .status(200)
        .json(
          request.path.includes("/preferences/") ? { savedViews } : savedViews,
        );
    });
  const create: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      const context = options.readContext(response),
        value = body(request.body);
      const entityCode = codeString(
        parameter(request, "entity") ?? value["entityCode"] ?? value["entity_code"],
        "entityCode",
      );
      const name = nameString(value["name"]);
      const code =
        value["code"] === undefined
          ? `view_${slug(name)}_${randomUUID().replaceAll("-", "")}`
          : codeString(value["code"], "code");
      const viewDescription = description(value["description"]);
      const view = await options.savedViews.create(context, {
        surfaceCode:
          codeString(value["surfaceCode"] ?? value["surface_code"] ?? "entity_list", "surfaceCode"),
        entityCode,
        code,
        name,
        ...(viewDescription ? { description: viewDescription } : {}),
        state: object(stateValue(value) === undefined ? {} : stateValue(value)),
        metadata: object(value["metadata"] === undefined ? {} : value["metadata"]),
      });
      response.setHeader("ETag", `"${view.version}"`);
      response.status(201).json(view);
    });
  const replace: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      const context = options.readContext(response),
        value = body(request.body);
      const partial = request.method === "PATCH";
      const state = stateValue(value);
      const changes = {
        ...(!partial || value["name"] !== undefined ? { name: nameString(value["name"]) } : {}),
        ...(!partial || state !== undefined ? { state: object(state) } : {}),
        ...(!partial || value["description"] !== undefined ? { description: description(value["description"]) } : {}),
      };
      if (!Object.keys(changes).length) throw new TypeError("At least one of name, state, or description is required");
      const view = await options.savedViews.replace(
        context,
        viewId(request),
        match(request.headers["if-match"]),
        changes,
        parameter(request, "entity"),
      );
      response.setHeader("ETag", `"${view.version}"`);
      response.status(200).json(view);
    });
  const remove: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      await options.savedViews.remove(
        options.readContext(response),
        viewId(request),
        parameter(request, "entity"),
      );
      response.status(204).end();
    });
  const setDefault: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      await options.savedViews.setDefault(
        options.readContext(response),
        requiredParameter(request, "entity"),
        viewId(request),
      );
      response.status(200).json({ ok: true });
    });
  const clearDefault: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      await options.savedViews.clearDefault(
        options.readContext(response),
        requiredParameter(request, "entity"),
      );
      response.status(200).json({ ok: true });
    });
  const clone: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      const value = request.body === undefined ? {} : body(request.body);
      if (value["name"] !== undefined && typeof value["name"] !== "string")
        throw new TypeError("name must be a string");
      const view = await options.savedViews.clone(
        options.readContext(response),
        viewId(request),
        value["name"] as string | undefined,
      );
      response.setHeader("ETag", `"${view.version}"`);
      response.status(201).json(view);
    });
  const action: RequestHandler = async (request, response, next) =>
    run(response, next, async () => {
      const context = options.readContext(response),
        id = viewId(request),
        actionName = requiredParameter(request, "action").toLowerCase();
      if (actionName === "pin" || actionName === "star")
        response.status(200).json({
          ok: true,
          ...(await options.savedViews.toggleFlag(
            context,
            id,
            actionName === "pin" ? "pinned" : "starred",
            request.method === "DELETE" ? false : undefined,
          )),
        });
      else if (actionName === "share") {
        await options.savedViews.setShared(
          context,
          id,
          request.method !== "DELETE",
        );
        response.status(200).json({ ok: true });
      } else if (actionName === "archive" || actionName === "delete") {
        await options.savedViews.archive(context, id);
        response.status(200).json({ ok: true });
      } else
        throw new SavedViewError(
          400,
          "SAVED_VIEW_ACTION_INVALID",
          `Unsupported saved-view action: ${actionName}`,
        );
    });

  app.get("/api/platform/preferences/saved-views", options.authenticate, list);
  app.post(
    "/api/platform/preferences/saved-views",
    options.authenticate,
    create,
  );
  app.put(
    "/api/platform/preferences/saved-views/:id",
    options.authenticate,
    replace,
  );
  app.delete(
    "/api/platform/preferences/saved-views/:id",
    options.authenticate,
    remove,
  );
  app.post(
    "/api/platform/preferences/saved-views/:id/clone",
    options.authenticate,
    clone,
  );
  app.patch(
    "/api/platform/preferences/saved-views/:id/actions/:action",
    options.authenticate,
    action,
  );
  app.delete(
    "/api/platform/preferences/saved-views/:id/actions/:action",
    options.authenticate,
    action,
  );

  app.get("/api/platform/saved-views/:entity", options.authenticate, list);
  app.post("/api/platform/saved-views/:entity", options.authenticate, create);
  app.post("/api/platform/saved-views", options.authenticate, create);
  app.patch(
    "/api/platform/saved-views/:entity/:viewId",
    options.authenticate,
    replace,
  );
  // Register the literal default path before the generic view ID path.
  app.delete(
    "/api/platform/saved-views/:entity/default",
    options.authenticate,
    clearDefault,
  );
  app.delete(
    "/api/platform/saved-views/:entity/:viewId",
    options.authenticate,
    remove,
  );
  app.patch(
    "/api/platform/saved-views/:entity/:viewId/default",
    options.authenticate,
    setDefault,
  );

  app.get("/api/me/saved-views", options.authenticate, list);
  app.patch(
    "/api/me/saved-views/:viewId/:action",
    options.authenticate,
    action,
  );
  app.delete(
    "/api/me/saved-views/:viewId/:action",
    options.authenticate,
    action,
  );
  app.post(
    "/api/me/saved-views/:viewId/clone",
    options.authenticate,
    clone,
  );
}

async function run(
  response: Response,
  next: (error?: unknown) => void,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof SavedViewVersionConflict)
      problem(response, 409, "SAVED_VIEW_VERSION_CONFLICT", error.message);
    else if (error instanceof SavedViewError)
      problem(response, error.status, error.code, error.message);
    else if (error && typeof error === "object" && Reflect.get(error, "code") === "23505")
      problem(response, 409, "SAVED_VIEW_CONFLICT", "A saved view with this name or code already exists in the target scope");
    else if (error && typeof error === "object" && Reflect.get(error, "code") === "23514")
      problem(response, 400, "SAVED_VIEW_INVALID", "Saved-view data exceeds a field limit or has an invalid format");
    else if (error instanceof TypeError)
      problem(response, 400, "SAVED_VIEW_INVALID", error.message);
    else next(error);
  }
}
function problem(
  response: Response,
  status: number,
  code: string,
  detail: string,
): void {
  response
    .status(status)
    .type("application/problem+json")
    .json({
      type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`,
      title: code,
      status,
      detail,
      code,
    });
}
function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("JSON object required");
  return value as Record<string, unknown>;
}
function object(value: unknown): Record<string, unknown> {
  return body(value);
}
function stateValue(value: Record<string, unknown>): unknown {
  return value["state"] !== undefined ? value["state"] : value["config"];
}
function nameString(value: unknown): string {
  const name = string(value, "name");
  if (Array.from(name).length > 160) throw new TypeError("name must not exceed 160 characters");
  return name;
}
function codeString(value: unknown, name: string): string {
  const code = string(value, name);
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(code)) throw new TypeError(`${name} has an invalid format`);
  return code;
}
function description(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new TypeError("description must be a string or null");
  if (Array.from(value.trim()).length > 2048) throw new TypeError("description must not exceed 2048 characters");
  return value.trim() || undefined;
}
function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${name} is required`);
  return value.trim();
}
function parameter(request: Request, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = request.params[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
function requiredParameter(request: Request, ...names: string[]): string {
  return (
    parameter(request, ...names) ??
    (() => {
      throw new TypeError(`${names[0]} is required`);
    })()
  );
}
function query(request: Request, name: string): string | undefined {
  const value = request.query[name];
  if (value === undefined) return undefined;
  return string(value, name);
}
function match(value: unknown): number {
  const found = typeof value === "string" ? /^(?:"(\d+)"|(\d+))$/.exec(value.trim()) : null;
  const version = found ? Number(found[1] ?? found[2]) : NaN;
  if (!Number.isSafeInteger(version) || version <= 0 || version > 0xffffffff)
    throw new TypeError("If-Match must contain a valid strong saved-view version");
  return version;
}
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "view"
  );
}

function viewId(request: Request): string {
  const id = requiredParameter(request, "id", "viewId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new TypeError("viewId must be a UUID");
  return id.toLowerCase();
}
