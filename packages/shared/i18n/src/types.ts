/**
 * @athyper/i18n — Shared Types
 *
 * Type aliases re-exported from config for convenience.
 * Keeping types separate prevents consumers from pulling in runtime code.
 */
export type { Locale } from "./config.ts";

/**
 * Shape of a compiled intl messages record.
 * Keys are dot-separated message IDs (e.g. "common.actions.save").
 */
export type Messages = Record<string, string>;

/**
 * Shape of an intl namespace object.
 * Each JSON lang file exports this shape.
 */
export type MessageNamespace = Record<string, string>;
