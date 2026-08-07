export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogFields = Record<string, unknown>;

export interface InfraLogger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  fatal(event: string, fields?: LogFields): void;
}

// Implementations that support child loggers (e.g. pino) declare this.
// InfraLogger stays the minimal contract so non-hierarchical loggers satisfy it.
export interface ChildLogger extends InfraLogger {
  child(bindings: LogFields): ChildLogger;
}
