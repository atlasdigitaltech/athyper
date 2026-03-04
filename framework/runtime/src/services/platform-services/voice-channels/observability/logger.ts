/**
 * Voice & Channels (TEL) — scoped logger factory.
 * Wraps base Logger with TEL module bindings (same pattern as INT module).
 */

import type { Logger } from "../../../../kernel/logger.js";

export type TelLogCategory =
    | "lifecycle"
    | "call"
    | "recording"
    | "ivr"
    | "sms"
    | "webhook"
    | "cti"
    | "crm"
    | "analytics";

export function createTelLogger(baseLogger: Logger, category: TelLogCategory): Logger {
    const bindings = { module: "TEL", category };

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
