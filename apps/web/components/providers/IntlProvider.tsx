"use client";

/**
 * IntlProvider — client-side runtime translator.
 *
 * Subscribes to `languageCode` in usePreferencesStore. When the locale changes,
 * dynamically imports the matching `lang/{locale}/common.json` and rebuilds an
 * `@formatjs/intl` instance, then exposes it via React context.
 *
 * Why not react-intl? `@athyper/i18n` already standardises on @formatjs/intl,
 * which works in both server and client. We avoid an extra dep by wrapping it
 * in a tiny context + hook here.
 *
 * Usage in a client component:
 *   const { formatMessage } = useIntl();
 *   formatMessage({ id: "user.language" });
 *
 * Note: English messages are bundled as the synchronous fallback so the first
 * render never sees raw message IDs. Other locales swap in once their JSON
 * resolves (a single network/parse tick).
 */

import { Fragment, cloneElement, createContext, isValidElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";
import { i18nConfig, isValidLocale, type Locale } from "@athyper/i18n/config";
import enCommon from "@athyper/i18n/lang/en/common.json";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";

type Messages = Record<string, string>;

type MinimalIntl = Pick<
  IntlShape,
  "locale" | "formatMessage" | "formatNumber" | "formatDate" | "formatTime" | "formatList" | "formatPlural"
>;

const formatjsCache = createIntlCache();
const messageCache = new Map<Locale, Messages>();
messageCache.set("en", enCommon as Messages);

/**
 * Static per-locale dynamic imports — one chunk per locale.
 *
 * A template-literal path like `@athyper/i18n/lang/${locale}/common.json` can't
 * be statically analyzed by webpack/turbopack across a workspace boundary, so
 * it fails silently at runtime. Each `import(literal)` here becomes its own
 * code-split chunk the bundler can resolve.
 */
const messageLoaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  en: () => import("@athyper/i18n/lang/en/common.json") as Promise<{ default: Messages }>,
  ar: () => import("@athyper/i18n/lang/ar/common.json") as Promise<{ default: Messages }>,
  ms: () => import("@athyper/i18n/lang/ms/common.json") as Promise<{ default: Messages }>,
  ta: () => import("@athyper/i18n/lang/ta/common.json") as Promise<{ default: Messages }>,
  hi: () => import("@athyper/i18n/lang/hi/common.json") as Promise<{ default: Messages }>,
  fr: () => import("@athyper/i18n/lang/fr/common.json") as Promise<{ default: Messages }>,
  de: () => import("@athyper/i18n/lang/de/common.json") as Promise<{ default: Messages }>,
};

async function loadMessages(locale: Locale): Promise<Messages> {
  const cached = messageCache.get(locale);
  if (cached) return cached;
  const baseline = messageCache.get("en") ?? (enCommon as Messages);
  if (locale === "en") {
    messageCache.set("en", baseline);
    return baseline;
  }
  try {
    const mod = await messageLoaders[locale]();
    // Merge over EN baseline so any key missing from the target locale falls
    // back to English instead of rendering the raw message ID.
    const merged: Messages = { ...baseline, ...mod.default };
    messageCache.set(locale, merged);
    return merged;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] failed to load messages for "${locale}"`, err);
    }
    return baseline;
  }
}

function buildIntl(locale: Locale, messages: Messages): MinimalIntl {
  return createIntl({ locale, messages, defaultLocale: i18nConfig.defaultLocale }, formatjsCache);
}

const IntlContext = createContext<MinimalIntl | null>(null);

export function IntlProvider({ children }: { children: ReactNode }) {
  const languageCode = usePreferencesStore((s) => s.languageCode);
  const locale: Locale = isValidLocale(languageCode) ? languageCode : i18nConfig.defaultLocale;

  const [messages, setMessages] = useState<Messages>(
    () => messageCache.get(locale) ?? (enCommon as Messages),
  );

  useEffect(() => {
    let cancelled = false;
    void loadMessages(locale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    return () => { cancelled = true; };
  }, [locale]);

  const intl = useMemo(() => buildIntl(locale, messages), [locale, messages]);

  return <IntlContext.Provider value={intl}>{children}</IntlContext.Provider>;
}

export function useIntl(): MinimalIntl {
  const ctx = useContext(IntlContext);
  if (!ctx) {
    throw new Error("useIntl must be used inside <IntlProvider>");
  }
  return ctx;
}

/**
 * React-aware rich-text formatter. `@formatjs/intl`'s native types restrict
 * ICU tag callbacks to `string | string[]`; this wrapper widens the return
 * type to `ReactNode` so callers can render JSX inside tags like
 * `<strong>...</strong>` or `<code>...</code>`.
 *
 * Two places in the formatjs pipeline produce unkeyed arrays that would
 * trip React's "each child should have a unique key" warning:
 *
 *   1. The `chunks` argument passed INTO each tag callback — formatjs hands
 *      these in as a plain array of segments. We wrap each in a keyed
 *      Fragment so `<strong>{chunks}</strong>` renders cleanly.
 *   2. The OUTER result of formatMessage — formatjs interleaves plain text
 *      and the callback-rendered elements into another unkeyed array. We
 *      pass it through React.Children.toArray to auto-key.
 *
 * Usage:
 *   const formatRich = useFormatRich();
 *   formatRich({ id: "..." }, { strong: (chunks) => <strong>{chunks}</strong> });
 */
export function useFormatRich(): (
  descriptor: { id: string; defaultMessage?: string; description?: string },
  values?: Record<string, ReactNode | ((chunks: ReactNode) => ReactNode)>,
) => ReactNode {
  const { formatMessage } = useIntl();
  return (descriptor, values) => {
    const wrapped: Record<string, unknown> = {};
    if (values) {
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === "function") {
          const fn = value as (chunks: ReactNode) => ReactNode;
          wrapped[key] = (chunks: ReactNode) => {
            const arr = Array.isArray(chunks) ? chunks : [chunks];
            // Fast path: tags whose content is plain text (the overwhelming
            // majority — e.g. `<strong>Some words</strong>`) get a single
            // joined string so `<strong>{chunks}</strong>` renders a single
            // string child and React never sees an array.
            const allPrimitive = arr.every(
              (c) =>
                c == null ||
                typeof c === "string" ||
                typeof c === "number" ||
                typeof c === "boolean",
            );
            if (allPrimitive) {
              return fn(arr.filter((c) => c != null).join(""));
            }
            // Mixed/nested content — wrap each chunk in a keyed Fragment.
            const keyed = arr.map((chunk, i) => (
              <Fragment key={i}>{chunk}</Fragment>
            ));
            return fn(keyed);
          };
        } else {
          wrapped[key] = value;
        }
      }
    }
    const result = formatMessage(
      descriptor,
      wrapped as never,
    ) as unknown as ReactNode;
    // Explicitly assign keys to every entry. Children.toArray usually does
    // this, but with formatjs's output some elements lose their keys in
    // transit; this version is bulletproof: clone elements with a new key,
    // wrap primitives in a keyed Fragment.
    if (!Array.isArray(result)) return result;
    return result.map((node, i) => {
      if (isValidElement(node)) {
        return cloneElement(node, { key: `fm-${i}` });
      }
      return <Fragment key={`fm-${i}`}>{node}</Fragment>;
    });
  };
}
