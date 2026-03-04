/**
 * Integration Hub — scoped logger factory.
 * Wraps base Logger with INT module bindings (same pattern as notification module).
 */

import type { Logger } from "../../../../kernel/logger.js";

export type IntLogCategory =
    | "lifecycle"
    | "connector"
    | "delivery"
    | "orchestration"
    | "webhook"
    | "mapping"
    | "outbox"
    | "rate-limit";

export function createIntLogger(baseLogger: Logger, category: IntLogCategory): Logger {
    const bindings = { module: "INT", category };

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
