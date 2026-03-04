/**
 * Intl provider — loads locale messages and creates intl instance.
 *
 * Usage (server component):
 *   const intl = await getIntl('en');
 *   intl.formatMessage({ id: 'dashboard.ACC.overview.title' })
 *
 * Messages are loaded dynamically per locale to enable code splitting.
 */

import { createIntl, createIntlCache } from "@formatjs/intl";

import type { Locale } from "./config.js";

// formatjs intl cache (reused across calls for same locale)
const cache = createIntlCache();

// In-memory message cache per locale
const messageCache = new Map<Locale, Record<string, string>>();

/**
 * Load all messages for a locale by merging common + dashboard modules.
 */
async function loadMessages(locale: Locale): Promise<Record<string, string>> {
    // In development, skip the cache so new/changed keys are picked up immediately
    if (process.env.NODE_ENV !== "development" && messageCache.has(locale)) {
        return messageCache.get(locale)!;
    }

    const messages: Record<string, string> = {};

    // Load common translations
    try {
        const common = (await import(`../lang/${locale}/common.json`, { with: { type: "json" } })).default;
        Object.assign(messages, common);
    } catch {
        // Common file may not exist for all locales yet
    }

    // Load widget translations
    try {
        const widgets = (await import(`../lang/${locale}/dashboard/_widgets.json`, { with: { type: "json" } })).default;
        Object.assign(messages, widgets);
    } catch {
        // Widgets file may not exist yet
    }

    // Load all module dashboard translations
    const moduleCodes = [
        "ACC", "PAY", "TREASURY", "BUDGET", "PAYG",
        "CRM", "SRM", "SOURCE", "CONTRACT", "BUY", "SALE",
        "INV", "QMS", "SUBCON", "DEMAND", "WMS", "LOGISTICS",
        "MAINT", "MFG",
        "ASSET", "ASSETREMS", "ASSETFM",
        "HRM", "PRL",
        "PRJ", "SVC",
        "REF", "REL", "MDG",
    ];

    for (const code of moduleCodes) {
        try {
            const mod = (await import(`../lang/${locale}/dashboard/${code}.json`, { with: { type: "json" } })).default;
            Object.assign(messages, mod);
        } catch {
            // Module translation may not exist yet — skip silently
        }
    }

    messageCache.set(locale, messages);
    return messages;
}

/**
 * Get an intl instance for the given locale.
 * Messages are loaded and cached on first call.
 */
export async function getIntl(locale: Locale) {
    const messages = await loadMessages(locale);
    return createIntl({ locale, messages }, cache);
}

/**
 * Clear the message cache (useful for hot reload in development).
 */
export function clearIntlCache(): void {
    messageCache.clear();
}
