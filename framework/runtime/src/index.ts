// framework/runtime/src/index.ts

// Kernel / runtime bootstrap surface
export * from "./kernel/bootstrap";
export * from "./kernel/config";
export * from "./kernel/container";
export * from "./kernel/container.defaults";
export * from "./kernel/tokens";

// Service/module loader
export * from "./services/registry";

// Registries (optional export if other packages contribute definitions)
export * from "./services/platform/foundation/registries/routes.registry.js";
export * from "./services/platform/foundation/registries/jobs.registry.js";
export * from "./services/platform/foundation/registries/services.registry.js";

// Telemetry adapters
export * from "./adapters/telemetry/index";