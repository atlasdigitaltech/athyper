export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type LogFields = Record<string, unknown>;

/** Capability-neutral structured logger port. */
export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  fatal(event: string, fields?: LogFields): void;
}

export interface ChildLogger extends Logger {
  child(bindings: LogFields): ChildLogger;
}
