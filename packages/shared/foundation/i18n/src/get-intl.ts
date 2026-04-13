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
 *   1. lang/{locale}/common.json   — always loaded
 *   2. lang/{locale}/dashboard/_widgets.json — always loaded
 *   3. lang/{locale}/dashboard/{moduleCode}.json — loaded on demand
 *
 * Results are cached per locale (cleared by clearIntlCache() for hot reload).
 */
import { createIntl, createIntlCache } from "@formatjs/intl";
import type { Locale } from "./config.ts";
import type { Messages } from "./types.ts";

// formatjs shared cache (reduces object allocations for same locale)
const formatjsCache = createIntlCache();

// In-memory message cache keyed by locale
const messageCache = new Map<Locale, Messages>();

/**
 * Load and merge messages for a locale.
 * Core files (common + widgets) are loaded eagerly;
 * module dashboard files are loaded on demand via loadModuleMessages().
 */
async function loadMessages(locale: Locale): Promise<Messages> {
  if (process.env["NODE_ENV"] !== "development" && messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  const messages: Messages = {};

  // ── Core: common strings ─────────────────────────────────────
  try {
    const common = (await import(`../lang/${locale}/common.json`, {
      with: { type: "json" },
    })).default as Messages;
    Object.assign(messages, common);
  } catch {
    // Locale may not have a common file yet — silently skip
  }

  // ── Core: dashboard widget strings ───────────────────────────
  try {
    const widgets = (await import(`../lang/${locale}/dashboard/_widgets.json`, {
      with: { type: "json" },
    })).default as Messages;
    Object.assign(messages, widgets);
  } catch {
    // Widget file may not exist yet — silently skip
  }

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
  const existing = messageCache.get(locale) ?? {};

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
