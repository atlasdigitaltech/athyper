export {
  MetaEntityAuthoringError,
  MetaEntityAuthoringService,
  type MetaEntityActorContext,
  type MetaEntityAuthoringRepository,
} from "./src/meta-entity-authoring.service.js";
export {
  PostgresMetaEntityAuthoringRepository,
} from "./src/postgres-meta-entity-authoring.repository.js";
export {
  canonicalizeMetaEntityGraph,
  diffCanonicalPaths,
  toDatabaseMetaEntityGraph,
  validateMetaEntityGraph,
} from "./src/meta-entity-graph.js";
export {
  registerMetaEntityAuthoringRoutes,
  type MetaEntityAuthoringRoutesDeps,
} from "./routes/index.js";
