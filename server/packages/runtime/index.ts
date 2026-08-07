/**
 * @athyper/server-runtime
 *
 * Bootstrap container for the API server process. Owns three cross-cutting
 * concerns that must be initialised before any route handler runs:
 *
 *  1. OpenTelemetry SDK — NodeSDK + OTLP/gRPC exporter wired in src/api.ts
 *     before Express is created (auto-instrumentations apply to every import
 *     that follows, so order matters).
 *
 *  2. Sentry / GlitchTip error tracking — @sentry/node initialised alongside
 *     OTel so every unhandled exception is captured with full trace context.
 *
 *  3. Kysely DB pool + S3 object-storage adapter — created once at startup and
 *     passed into service-layer Deps objects via dependency injection.
 *
 * This package intentionally has no named exports — it is an entrypoint
 * container, not a library. All wiring lives in the consuming app (src/api.ts).
 * Service packages import from their own adapters (@athyper/adapter-db-neon, etc.)
 * rather than from here.
 */

export {};
