export { registerMetadataRoutes, type MetadataRoutesDeps } from "./routes/index.js";
export {
  invalidateDescriptorCache,
  type DescriptorCache,
} from "./routes/compiled-entity.route.js";
export * from "./src/execution-descriptor/index.js";
export * from "./src/metadata-graph-validator.js";
export * from "./src/tenant-overlay-resolver.js";
export * from "./routes/runtime-bootstrap.route.js";
