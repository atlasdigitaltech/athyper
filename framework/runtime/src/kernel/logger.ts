// framework/runtime/src/kernel/logger.ts
import pino, { type Logger as PinoLogger, type LoggerOptions } from "pino";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface Logger {
    info(metaOrMsg: any, msgOrMeta?: any): void;
    warn(metaOrMsg: any, msgOrMeta?: any): void;
    error(metaOrMsg: any, msgOrMeta?: any): void;
    debug(metaOrMsg: any, msgOrMeta?: any): void;
    trace(metaOrMsg: any, msgOrMeta?: any): void;
    fatal(metaOrMsg: any, msgOrMeta?: any): void;
    log(msg: string): void;
}

export interface LoggerConfig {
    level: LogLevel;
    serviceName: string;
    env: string;
    pretty?: boolean;
}

/**
 * Create a Pino-based structured logger.
 *
 * Logs are emitted as JSON by default.
 * In local development, use pretty=true for human-readable output.
 */
export function createPinoLogger(config: LoggerConfig): Logger {
    const pinoOptions: LoggerOptions = {
        level: config.level,
        base: {
            service: config.serviceName,
            env: config.env,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => ({ level: label }),
        },
    };

    // Enable pretty printing in local development
    if (config.pretty) {
        pinoOptions.transport = {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "HH:MM:ss.l",
                ignore: "pid,hostname",
            },
        };
    }

    const pinoLogger: PinoLogger = pino(pinoOptions);

    // Adapter to match runtime logger interface (supports both call signatures)
    return {
        info(metaOrMsg: any, msgOrMeta?: string) {
            // Detect signature: (msg, meta) or (meta, msg)
            if (typeof metaOrMsg === "string") {
                // (msg, meta) signature
                pinoLogger.info(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                // (meta, msg) signature
                pinoLogger.info(metaOrMsg, msgOrMeta);
            } else {
                // Just meta object or just string
                pinoLogger.info(metaOrMsg);
            }
        },
        warn(metaOrMsg: any, msgOrMeta?: string) {
            if (typeof metaOrMsg === "string") {
                pinoLogger.warn(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                pinoLogger.warn(metaOrMsg, msgOrMeta);
            } else {
                pinoLogger.warn(metaOrMsg);
            }
        },
        error(metaOrMsg: any, msgOrMeta?: string) {
            if (typeof metaOrMsg === "string") {
                pinoLogger.error(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                pinoLogger.error(metaOrMsg, msgOrMeta);
            } else {
                pinoLogger.error(metaOrMsg);
            }
        },
        debug(metaOrMsg: any, msgOrMeta?: string) {
            if (typeof metaOrMsg === "string") {
                pinoLogger.debug(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                pinoLogger.debug(metaOrMsg, msgOrMeta);
            } else {
                pinoLogger.debug(metaOrMsg);
            }
        },
        trace(metaOrMsg: any, msgOrMeta?: string) {
            if (typeof metaOrMsg === "string") {
                pinoLogger.trace(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                pinoLogger.trace(metaOrMsg, msgOrMeta);
            } else {
                pinoLogger.trace(metaOrMsg);
            }
        },
        fatal(metaOrMsg: any, msgOrMeta?: string) {
            if (typeof metaOrMsg === "string") {
                pinoLogger.fatal(msgOrMeta ?? {}, metaOrMsg);
            } else if (msgOrMeta) {
                pinoLogger.fatal(metaOrMsg, msgOrMeta);
            } else {
                pinoLogger.fatal(metaOrMsg);
            }
        },
        log(msg: string) {
            pinoLogger.info(msg);
        },
    };
}
