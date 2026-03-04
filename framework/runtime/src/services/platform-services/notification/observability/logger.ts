/**
 * Notification module structured logger.
 *
 * Creates a child logger tagged with module: "NOTIFY" and a category
 * for structured filtering. Uses the kernel Pino logger.
 */

import type { Logger } from "../../../../kernel/logger.js";

export type NotifyLogCategory =
    | "planning"
    | "delivery"
    | "callback"
    | "template"
    | "preference"
    | "dedup"
    | "adapter"
    | "lifecycle"
    | "dlq"
    | "explain"
    | "digest";

/**
 * Create a notification-scoped child logger.
 * Adds module and category to every log line.
 */
export function createNotifyLogger(
    baseLogger: Logger,
    category: NotifyLogCategory,
): Logger {
    // Pino child() attaches default bindings — we simulate this
    // by wrapping with module + category metadata.
    const bindings = { module: "NOTIFY", category };

    return {
        info: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.info(bindings, metaOrMsg);
            } else {
                baseLogger.info({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        warn: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.warn(bindings, metaOrMsg);
            } else {
                baseLogger.warn({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        error: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.error(bindings, metaOrMsg);
            } else {
                baseLogger.error({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        debug: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.debug(bindings, metaOrMsg);
            } else {
                baseLogger.debug({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        trace: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.trace(bindings, metaOrMsg);
            } else {
                baseLogger.trace({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        fatal: (metaOrMsg: any, msgOrMeta?: any) => {
            if (typeof metaOrMsg === "string") {
                baseLogger.fatal(bindings, metaOrMsg);
            } else {
                baseLogger.fatal({ ...bindings, ...metaOrMsg }, msgOrMeta);
            }
        },
        log: (msg: string) => baseLogger.log(msg),
    };
}
