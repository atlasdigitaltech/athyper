/**
 * @athyper/platform-i18n — Shared Types
 *
 * Type aliases re-exported from config for convenience.
 * Keeping types separate prevents consumers from pulling in runtime code.
 */
export type { Locale } from "./config.ts";

declare const _messagesBrand: unique symbol;
declare const _namespaceBrand: unique symbol;

/**
 * Flat merged intl messages record — all loaded namespaces combined.
 * Keys are dot-separated message IDs (e.g. "common.actions.save").
 * Produced by getIntl() / loadModuleMessages().
 */
export type Messages = Record<string, string> & { readonly [_messagesBrand]?: "Messages" };

/**
 * A single JSON lang file's key-value pairs before merging.
 * Returned by raw JSON imports (e.g. lang/en/common.json).
 */
export type MessageNamespace = Record<string, string> & { readonly [_namespaceBrand]?: "MessageNamespace" };
