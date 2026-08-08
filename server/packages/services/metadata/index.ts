export { registerMetadataRoutes, type MetadataRoutesDeps } from "./routes/index.js";
export {
  invalidateDescriptorCache,
  type DescriptorCache,
} from "./routes/compiled-entity.route.js";
export * from "./src/execution-descriptor/index.js";
export * from "./src/metadata-graph-validator.js";
export * from "./src/tenant-overlay-resolver.js";
export * from "./src/contract-application/contract-application.service.js";
export * from "./src/contract-application/postgres-contract-application.repository.js";
export * from "./src/published-runtime-descriptor.js";
export * from "./routes/runtime-bootstrap.route.js";
export * from "./cache-invalidation/index.js";
export * from "./src/metadata-approval-bridge.js";
export * from "./src/entity-compiler.service.js";
export * from "./src/entity-compliance.js";
export * from "./src/catalog-compiler.js";
