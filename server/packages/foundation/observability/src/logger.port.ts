// Logger vocabulary lives in @athyper/platform-core (browser-neutral shared contracts).
// Re-exported here so server packages declare the Logger interface without
// depending on platform-core directly — foundation/observability is the
// single cross-cutting import for server-side observability ports.
export type {
  InfraLogger as Logger,
  ChildLogger,
  LogLevel,
  LogFields,
} from "@athyper/platform-core/logger";
