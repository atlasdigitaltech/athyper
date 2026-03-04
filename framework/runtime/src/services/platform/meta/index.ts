/**
 * Platform Meta Module
 *
 * Platform-level metadata services and handlers for the META Engine.
 * Provides entity management, versioning, lifecycle, and generic data API.
 */

export const moduleCode = "platform-meta";
export const moduleName = "Platform Meta";

// Module registration (HTTP routes and handlers)
export * from "./module.js";

// Core services (registry, compiler, policy gate, audit, store)
export * from "./core/index.js";

// Lifecycle services (state management, route compilation)
export * from "./lifecycle/index.js";

// Data services (generic data API, query validation, db helpers)
export * from "./data/index.js";

// Schema services (DDL generation, migrations, publishing)
export * from "./schema/index.js";

// Factory function for service creation
export { createMetaServices, registerMetaServices, type MetaServicesConfig, type MetaServices } from "./factory.js";
