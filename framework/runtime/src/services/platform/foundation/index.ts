/**
 * Foundation Services
 *
 * Core infrastructure services: HTTP, registries, resilience, security, middleware,
 * overlay system, generic API, and IAM (Identity and Access Management).
 */

export const moduleCode = "platform-foundation";
export const moduleName = "Platform Foundation";

// HTTP module
export * from "./http/module.js";

// Registries
export * from "./registries/routes.registry.js";
export * from "./registries/jobs.registry.js";
export * from "./registries/services.registry.js";

// Resilience
export * from "./resilience/index.js";

// Security (includes rate limiting and field-level security)
export * from "./security/index.js";

// Middleware
export * from "./middleware/index.js";

// Overlay System (Schema Composition)
export * from "./overlay-system/index.js";

// Generic API (Cross-entity queries)
export * from "./generic-api/index.js";

// IAM (Identity and Access Management)
export * from "./iam/index.js";
