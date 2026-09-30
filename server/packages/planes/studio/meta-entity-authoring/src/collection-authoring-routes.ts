import type { Application, RequestHandler, Response, Request } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseCollectionConfiguration,
  collectionPreview,
  COLLECTION_PROVIDERS,
} from "@athyper/contract-platform-collection";
import { collectionPublicationFromGraph } from "@athyper/server-contract-publication";
import type { MetaEntityAuthoringService } from "./authoring-service.js";
export function registerCollectionAuthoringRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    authorize(
      response: Response,
      permission: string,
      id?: string,
    ): Promise<VerifiedRequestContext | undefined>;
    service: MetaEntityAuthoringService;
  },
) {
  const wrap =
    (work: (q: Request, s: Response) => Promise<void>): RequestHandler =>
    (q, s, next) => {
      void work(q, s).catch((error) => {
        if (error instanceof TypeError) {
          s.status(422).json({
            code: "COLLECTION_CONFIGURATION_INVALID",
            detail: error.message,
          });
          return;
        }
        if (
          error instanceof AuthoringConflictError ||
          error instanceof AuthoringPolicyError
        ) {
          s.status(error.code === "FORBIDDEN" ? 403 : 409).json({
            code: error.code,
            detail: error.message,
          });
          return;
        }
        next(error);
      });
    };
  app.get(
    "/api/meta-entity-authoring/collection-providers",
    options.authenticate,
    wrap(async (_q, s) => {
      if (!(await options.authorize(s, "metadata.entity.author"))) return;
      s.setHeader("Cache-Control", "private, no-store");
      s.json({ providers: COLLECTION_PROVIDERS });
    }),
  );
  const base = "/api/meta-entity-authoring/change-sets/:id/collection";
  for (const [method, suffix] of [
    ["get", ""],
    ["put", ""],
    ["post", "/validate"],
    ["post", "/preview"],
  ] as const)
    app[method](
      base + suffix,
      options.authenticate,
      wrap(async (q, s) => {
        const id = String(q.params.id);
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          )
        )
          throw new TypeError("Invalid change-set UUID");
        const c = await options.authorize(s, "metadata.entity.author", id);
        if (!c) return;
        await options.service.assertTenant(id, c.tenantId);
        const state = await options.service.readGraph(id);
        s.setHeader("Cache-Control", "private, no-store");
        if (method === "put") {
          if (
            !Number.isSafeInteger(q.body?.expectedRevision) ||
            q.body.expectedRevision < 0
          )
            throw new TypeError("expectedRevision is required");
          if (q.body.expectedRevision !== state.changeSet.revision)
            throw new AuthoringConflictError(
              "The draft changed; reload before saving",
            );
          const configuration = parseCollectionConfiguration(
            q.body.configuration,
          );
          if (state.graph.entity.entityClass !== "configuration")
            throw new TypeError(
              "Collection authoring requires a configuration draft",
            );
          const surfaces = state.graph.surfaces ?? [];
          if (
            surfaces.length > 1 ||
            surfaces.some((x) => !x.layoutConfig?.collectionConfiguration)
          )
            throw new TypeError(
              "Use a dedicated collection configuration draft",
            );
          const surface = surfaces[0] ?? {
            id: crypto.randomUUID(),
            surfaceKey: "collection_configuration",
            surfaceKind: "embedded",
            title: configuration.title,
            isDefault: true,
          };
          const graph = {
            ...state.graph,
            surfaces: [
              {
                ...surface,
                layoutConfig: { collectionConfiguration: configuration },
              },
            ],
          };
          collectionPublicationFromGraph(graph);
          s.json(
            await options.service.replaceGraph({
              changeSetId: id,
              expectedRevision: q.body.expectedRevision,
              graph,
              actorId: c.principalId,
              context: c,
            }),
          );
          return;
        }
        const descriptor = collectionPublicationFromGraph(state.graph);
        if (!descriptor) {
          s.status(404).json({
            code: "COLLECTION_CONFIGURATION_NOT_CONFIGURED",
          });
          return;
        }
        if (suffix === "/preview") {
          s.json({
            revision: state.changeSet.revision,
            ...collectionPreview(descriptor.configuration),
          });
          return;
        }
        s.json({
          revision: state.changeSet.revision,
          ...(suffix === "/validate" ? { valid: true } : {}),
          configuration: descriptor.configuration,
        });
      }),
    );
}
