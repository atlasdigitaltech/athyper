import { withReadEvidence } from "@athyper/server-foundation/context";
import { randomUUID, createHash } from "node:crypto";
import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  resolveEntityText,
  parseSaveableListState,
  type EntityListDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import {
  SavedViewError,
  SavedViewVersionConflict,
  type createSavedViewService,
} from "./index.js";

export interface ViewCollectionDescriptor {
  standardViews: readonly {
    key: string;
    label: string;
    state: Readonly<Record<string, unknown>>;
  }[];
  validate(raw: unknown): Readonly<Record<string, unknown>>;
}
export function registerEntityViewRoutes(
  app: Application,
  options: {
    diagnostics?: boolean;
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    service: ReturnType<typeof createSavedViewService>;
    descriptor: (
      context: VerifiedRequestContext,
      entity: string,
      query: Record<string, unknown>,
    ) => Promise<EntityListDescriptorV1>;
  },
) {
  registerViewCollectionRoutes(app, {
    ...options,
    path: "/api/entity-runtime/:entityCode/views",
    surface: "entity_list",
    descriptor: async (context, key, query) => {
      const d = await options.descriptor(context, key, query);
      return entityViewDescriptor(d);
    },
  });
}

function entityViewDescriptor(
  d: EntityListDescriptorV1,
): ViewCollectionDescriptor {
  return {
    standardViews: (d.standardViews ?? []).map((v) => ({
      key: v.key,
      label: resolveEntityText(v.label),
      state: { ...d.surface.defaultState, standardViewKey: v.key },
    })),
    validate: (raw) =>
      validateViewState(raw, d) as unknown as Record<string, unknown>,
  };
}

/** Uses an already-authorized descriptor; never resolves or widens parent scope. */
export async function readEntityViewCatalog(
  service: ReturnType<typeof createSavedViewService>,
  context: VerifiedRequestContext,
  descriptor: EntityListDescriptorV1,
  surface: string,
) {
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(surface))
    throw new TypeError("Invalid collection identifier");
  return readViewCatalog(
    service,
    context,
    descriptor.entity.code,
    surface,
    entityViewDescriptor(descriptor),
  );
}

async function readViewCatalog(
  service: ReturnType<typeof createSavedViewService>,
  context: VerifiedRequestContext,
  entity: string,
  surface: string,
  descriptor: ViewCollectionDescriptor,
) {
  const result = await service.collection(context, entity, surface);
  return {
    ...result,
    views: [
      ...result.views,
      ...descriptor.standardViews.map((view) => ({
        id: `standard.${view.key}`,
        name: view.label,
        scope: "system" as const,
        version: 1,
        state: view.state,
      })),
    ].map((view) => {
      try {
        return {
          ...view,
          state: descriptor.validate(view.state),
          compatible: true,
        };
      } catch {
        return { ...view, state: {}, compatible: false };
      }
    }),
  };
}

/** Same saved-view commands for entity lists and registered collections. No metadata entity required. */
export function registerViewCollectionRoutes(
  app: Application,
  options: {
    path: string;
    surface: string;
    diagnostics?: boolean;
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    service: ReturnType<typeof createSavedViewService>;
    descriptor: (
      context: VerifiedRequestContext,
      key: string,
      query: Record<string, unknown>,
    ) => Promise<ViewCollectionDescriptor>;
  },
) {
  const handle: RequestHandler = async (req, res, next) => {
    try {
      const context = options.readContext(res),
        entity = String(req.params.entityCode),
        surface = String(req.query.surface ?? options.surface);
      if (
        !/^[a-z][a-z0-9_.-]{0,126}$/.test(entity) ||
        !/^[a-z][a-z0-9_.-]{0,126}$/.test(surface)
      )
        throw new TypeError("Invalid collection identifier");
      if (
        options.path.startsWith("/api/collections/") &&
        surface !== options.surface
      )
        throw new TypeError("Collection surface is unavailable");
      const stages: string[] = [];
      const started = performance.now();
      const timing = (stage: string, start: number) => {
        stages.push(`${stage};dur=${(performance.now() - start).toFixed(1)}`);
        if (options.diagnostics === true)
          res.setHeader("Server-Timing", stages.join(", "));
      };
      res.setHeader("Cache-Control", "private, no-store");
      if (req.method === "GET") {
        const result = await withReadEvidence(async () => {
          const descriptorStart = performance.now();
          const descriptor = await options.descriptor(
            context,
            entity,
            req.query,
          );
          timing("descriptor", descriptorStart);
          const viewsStart = performance.now();
          const catalog = await readViewCatalog(
            options.service,
            context,
            entity,
            surface,
            descriptor,
          );
          timing("views", viewsStart);
          return catalog;
        });
        timing("total", started);
        res.json(result);
        return;
      }
      // Commands deliberately do not share read evidence across mutations.
      const descriptor = await options.descriptor(context, entity, req.query);
      const read = () =>
        readViewCatalog(options.service, context, entity, surface, descriptor);
      const value = req.body as Record<string, unknown>;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError("Expected a view command");
      const action = value.action;
      if (action === "create") {
        const name = String(value.name ?? "").trim();
        if (!name || name.length > 160)
          throw new TypeError("View name must contain 1–160 characters");
        if (value.visibility !== "personal" && value.visibility !== "shared")
          throw new TypeError("Invalid visibility");
        const importKey = value.importKey;
        if (
          importKey !== undefined &&
          (typeof importKey !== "string" ||
            importKey.length > 16384 ||
            value.visibility !== "personal")
        )
          throw new TypeError("Invalid personal import identity");
        const code =
          typeof importKey === "string"
            ? `import_${createHash("sha256").update(importKey).digest("hex")}`
            : `view_${randomUUID().replaceAll("-", "")}`;
        if (importKey) {
          const prior = (
            await options.service.collection(context, entity, surface)
          ).views.find(
            (v) =>
              v.code === code && v.ownerPrincipalId === context.principalId,
          );
          if (prior) {
            res.status(201).json({ ...(await read()), createdId: prior.id });
            return;
          }
        }
        const input = {
          entityCode: entity,
          surfaceCode: surface,
          code,
          name,
          state: descriptor.validate(value.state) as unknown as Record<
            string,
            unknown
          >,
        };
        const created =
          value.visibility === "shared"
            ? await options.service.createShared(context, input)
            : await options.service.create(context, input);
        res.status(201).json({ ...(await read()), createdId: created.id });
        return;
      }
      if (action === "clear_default") {
        await options.service.clearCollectionDefault(context, entity, surface);
        res.json(await read());
        return;
      }
      const id = String(value.id ?? "");
      if (
        id !== "system" &&
        !id.startsWith("standard.") &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new TypeError("Invalid view ID");
      if (action === "default") {
        if (value.target !== "personal" && value.target !== "shared")
          throw new TypeError("Invalid default audience");
        if (id !== "system") {
          const current = (await read()).views.find((view) => view.id === id);
          if (!current?.compatible)
            throw new TypeError(
              "This view is no longer compatible with the available fields",
            );
        }
        await options.service.collectionDefault(
          context,
          entity,
          surface,
          id,
          value.target,
          (descriptor.standardViews ?? []).map(
            (view) => `standard.${view.key}`,
          ),
        );
      } else {
        const collection = await options.service.collection(
          context,
          entity,
          surface,
        );
        const view = collection.views.find((item) => item.id === id);
        if (!view)
          throw new SavedViewError(
            404,
            "SAVED_VIEW_NOT_FOUND",
            "View is not available in this collection",
          );
        if (action === "delete")
          await options.service.remove(context, id, entity);
        else if (action === "copy") {
          descriptor.validate(view.state);
          await options.service.clone(context, id);
        } else if (action === "update") {
          const version = Number(value.version);
          if (!Number.isSafeInteger(version) || version < 1)
            throw new TypeError("A view revision is required");
          const name = String(value.name ?? view.name).trim();
          if (!name || name.length > 160)
            throw new TypeError("Invalid view name");
          await options.service.replace(
            context,
            id,
            version,
            {
              name,
              ...(value.state === undefined
                ? {}
                : {
                    state: descriptor.validate(
                      value.state,
                    ) as unknown as Record<string, unknown>,
                  }),
            },
            entity,
          );
        } else throw new TypeError("Unknown view command");
      }
      res.json(await read());
    } catch (error) {
      if (
        error instanceof SavedViewError ||
        error instanceof SavedViewVersionConflict ||
        error instanceof TypeError
      ) {
        const status =
          error instanceof SavedViewError
            ? error.status
            : error instanceof SavedViewVersionConflict
              ? 409
              : 400;
        res.status(status).json({
          status,
          code:
            error instanceof SavedViewError
              ? error.code
              : error instanceof SavedViewVersionConflict
                ? "SAVED_VIEW_VERSION_CONFLICT"
                : "SAVED_VIEW_INVALID",
          message: error.message,
        });
      } else next(error);
    }
  };
  app.get(options.path, options.authenticate, handle);
  app.post(options.path, options.authenticate, handle);
}

/** Never silently widen a saved filter when metadata or field access changes. */
export function validateViewState(
  raw: unknown,
  descriptor: EntityListDescriptorV1,
) {
  const parsed = parseSaveableListState(raw, descriptor),
    value = raw as Record<string, unknown>;
  if (
    parsed.standardViewKey &&
    !descriptor.standardViews?.some(
      (view) => view.key === parsed.standardViewKey,
    )
  )
    throw new TypeError("Standard view is unavailable for this collection");
  const allowed = new Set(descriptor.fields.map((field) => field.key));
  if (
    !Array.isArray(value.columns) ||
    value.columns.some(
      (field) => typeof field !== "string" || !allowed.has(field),
    ) ||
    value.columns.length > 100
  )
    throw new TypeError("Saved view references unavailable fields");
  if (
    !Array.isArray(value.filters) ||
    value.filters.length !== parsed.filters.length ||
    !Array.isArray(value.sort) ||
    value.sort.length !== parsed.sort.length ||
    (value.groups !== undefined && !Array.isArray(value.groups)) ||
    (value.groups !== undefined && value.group !== undefined) ||
    JSON.stringify(
      value.groups ?? (value.group === undefined ? [] : [value.group]),
    ) !== JSON.stringify(parsed.groups ?? [])
  )
    throw new TypeError(
      "Saved view references unavailable filters, sorting or grouping",
    );
  const { query: ignored, ...state } = parsed;
  return state;
}
