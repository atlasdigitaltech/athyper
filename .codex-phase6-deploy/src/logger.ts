// server/src/logger.ts
//
// Pino-based structured logger.
//
// Interface uses the (event, fields?) convention already established across all
// service packages — callers do not need to change their call sites.
//
// In local dev (env === "local") logs are pretty-printed via pino-pretty.
// In all other envs logs are emitted as JSON for log aggregation pipelines.

import pino, { type Logger as PinoLogger, type LoggerOptions } from "pino";
import { trace } from "@opentelemetry/api";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Server logger interface.
 * Convention: logger.info("event_name", { key: "value" })
 * This matches the call convention used across all svc-* packages.
 */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  debug(event: string, fields?: Record<string, unknown>): void;
  fatal(event: string, fields?: Record<string, unknown>): void;
}

function withTraceContext(fields?: Record<string, unknown>): Record<string, unknown> {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return fields ?? {};

  const spanContext = activeSpan.spanContext();
  if (!spanContext.traceId || !spanContext.spanId) return fields ?? {};

  return {
    ...(fields ?? {}),
    trace_id: fields?.trace_id ?? spanContext.traceId,
    span_id:  fields?.span_id  ?? spanContext.spanId,
  };
}

export function createLogger(opts: {
  level: LogLevel;
  env: string;
  serviceName?: string;
}): Logger {
  const options: LoggerOptions = {
    level: opts.level,
    base: { service: opts.serviceName ?? "athyper-server", env: opts.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };

  // pino-pretty is a devDependency — only active in local dev
  if (opts.env === "local") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    };
  }

  const p: PinoLogger = pino(options);

  // Adapter: flip (event, fields?) → pino's native (mergingObject, message) call order
  return {
    info:  (event, fields) => p.info(withTraceContext(fields),  event),
    warn:  (event, fields) => p.warn(withTraceContext(fields),  event),
    error: (event, fields) => p.error(withTraceContext(fields), event),
    debug: (event, fields) => p.debug(withTraceContext(fields), event),
    fatal: (event, fields) => p.fatal(withTraceContext(fields), event),
  };
}
