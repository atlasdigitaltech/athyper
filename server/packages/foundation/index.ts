// @athyper/server-foundation — transitional compatibility barrel.
// Retire this package after all consumers migrate to the extracted packages.
//
// Extraction map:
//   resilience/*        → @athyper/foundation-kernel
//   registry/*          → @athyper/foundation-observability
//   monitoring/otel     → @athyper/adapter-telemetry/otel
//   monitoring/sentry   → @athyper/adapter-telemetry/sentry
//   monitoring/hc       → @athyper/adapter-telemetry/cronwatch
//   crypto/*            → @athyper/foundation-crypto  (already done)
//   openapi/*           → @athyper/runtime-http        (already done)
//   render/*            → adapter-rendering-* packages (already done)
//
// overlay/* and query/* have no external consumers and are excluded from
// this barrel per the foundation boundary audit.

// Crypto — shim in crypto/ re-exports @athyper/foundation-crypto
export * from "./crypto/credential-encryption.service.js";

// Resilience — canonical location is now @athyper/foundation-kernel
export * from "@athyper/foundation-kernel";

// Observability registry — registry/service-registry.ts re-exports from observability
export * from "./registry/service-registry.js";

// OTel, Sentry, cronwatch — monitoring/*.ts are now shims pointing to adapter-telemetry
export * from "./monitoring/otel.js";
export * from "./monitoring/sentry.js";
export * from "./monitoring/healthchecks.js";

// Platform metrics — deferred split into capability-specific collectors
export * from "./monitoring/platform-metrics.js";

// OpenAPI — already extracted to @athyper/runtime-http; shim kept for compat
export * from "./openapi/openapi-generator.js";

// Render — already extracted to adapter-rendering-* packages; shims kept for compat
export * from "./render/gotenberg-client.js";
export * from "./render/pdf-renderer-client.js";
export * from "./render/render.service.js";
