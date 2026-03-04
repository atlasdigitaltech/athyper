/**
 * Document Services — Structured Logger
 *
 * Wraps the base logger with module + category bindings.
 */

import type { Logger } from "../../../../kernel/logger.js";

export type DocLogCategory =
    | "template"
    | "render"
    | "output"
    | "storage"
    | "lifecycle"
    | "adapter"
    | "composer"
    | "brand"
    | "letterhead"
    | "audit"
    | "dlq"
    | "recovery";

export function createDocLogger(
    baseLogger: Logger,
    category: DocLogCategory,
): Logger {
    const bindings = { module: "DOC", category };

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
    } as Logger;
}
