/**
 * @athyper/i18n — Intl Instance Factory
 *
 * Loads locale messages and returns a formatjs intl instance.
 * Intended for server-side use (Server Components, API Routes).
 *
 * Usage:
 *   import { getIntl } from "@athyper/i18n/intl";
 *   const intl = await getIntl("en");
 *   intl.formatMessage({ id: "common.actions.save" })
 *
 * Message loading strategy:
 *   1. lang/{locale}/common.json              — always loaded (base)
 *   2. lang/{locale}/dashboard/_widgets.json  — always loaded (base)
 *   3. lang/{locale}/dashboard/{moduleCode}.json — loaded on demand via loadModuleMessages()
 *
 * Cache behaviour:
 *   Production: base messages are loaded once and held for the process lifetime.
 *   Development: base messages are reloaded on every call so translation edits
 *     are picked up without a process restart. Any module messages already merged
 *     into the cache are preserved — they are merged UNDER the fresh base so that
 *     a changed common key always wins, while module-specific keys are not lost.
 *   Call clearIntlCache() to force a full reset in either mode.
 */
import { createIntl, createIntlCache } from "@formatjs/intl";
import type { Locale } from "./config.ts";
import type { Messages } from "./types.ts";

// formatjs shared cache (reduces object allocations for same locale)
const formatjsCache = createIntlCache();

// In-memory message cache keyed by locale
const messageCache = new Map<Locale, Messages>();

/**
 * Load and merge base messages for a locale.
 *
 * In production the cache is consulted first; in development base files are
 * always re-read from disk (to pick up edits) but any module-specific strings
 * already merged into the cache are preserved by merging them UNDER the fresh
 * base — so a changed common key wins while module keys are not erased.
 */
async function loadMessages(locale: Locale): Promise<Messages> {
  if (process.env["NODE_ENV"] !== "development" && messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  // Load fresh base files from disk.
  const base: Messages = {};

  // ── Core: common strings ─────────────────────────────────────
  try {
    const common = (await import(`../lang/${locale}/common.json`, {
      with: { type: "json" },
    })).default as Messages;
    Object.assign(base, common);
  } catch {
    // Locale may not have a common file yet — silently skip
  }

  // ── Core: dashboard widget strings ───────────────────────────
  try {
    const widgets = (await import(`../lang/${locale}/dashboard/_widgets.json`, {
      with: { type: "json" },
    })).default as Messages;
    Object.assign(base, widgets);
  } catch {
    // Widget file may not exist yet — silently skip
  }

  // In dev mode, preserve any module messages already in cache. Module keys
  // don't overlap with base keys (separate namespaces), so spreading existing
  // first and then base on top means fresh common edits always win.
  const existing = messageCache.get(locale) ?? {};
  const messages: Messages = { ...existing, ...base };
  messageCache.set(locale, messages);
  return messages;
}

/**
 * Get an intl instance for the given locale with core messages loaded.
 * Module-specific dashboard messages must be merged separately via
 * loadModuleMessages() if needed.
 */
export async function getIntl(locale: Locale) {
  const messages = await loadMessages(locale);
  return createIntl({ locale, messages }, formatjsCache);
}

/**
 * Load additional module-specific dashboard messages into cache.
 * Call this in module dashboard pages before rendering.
 *
 * @param locale  - target locale
 * @param moduleCode - e.g. "ACC", "BUY", "CRM"
 */
export async function loadModuleMessages(
  locale: Locale,
  moduleCode: string,
): Promise<Messages> {
  // Ensure the locale cache contains the base bundle before merging module
  // strings. In production, loadMessages() returns a cached locale as-is, so
  // a module-only cache entry would make getIntl() miss common.json later.
  const existing = await loadMessages(locale);

  try {
    const mod = (await import(`../lang/${locale}/dashboard/${moduleCode}.json`, {
      with: { type: "json" },
    })).default as Messages;
    const merged = { ...existing, ...mod };
    messageCache.set(locale, merged);
    return merged;
  } catch {
    return existing;
  }
}

/** Clear the message cache — used in development for hot reload. */
export function clearIntlCache(): void {
  messageCache.clear();
}
