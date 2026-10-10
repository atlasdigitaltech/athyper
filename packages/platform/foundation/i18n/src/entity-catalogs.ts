import { mergeCatalogs, canonicalLocale, type MessageCatalog } from "./index";
import { entityEnglishMessages } from "./entity-messages";
import { chartMessages } from "./catalogs/chart";
import { collaborationMessages } from "./catalogs/collaboration";
import { entityRuntimeMessages } from "./catalogs/entity-runtime";

export const ENTITY_CATALOG_REVISION = "entity-ui:1";
export const ENTITY_CATALOG_LOCALES = ["en", "ms", "ar"] as const;
// Shared framework messages only. Entity-specific translations are published
// with metadata and resolved from the descriptor at render time.
const catalogs = Object.fromEntries(ENTITY_CATALOG_LOCALES.map((locale, index) => [locale,
  mergeCatalogs(Object.fromEntries(Object.entries(collaborationMessages).map(([key, values]) => [key, values[index]!])),
    Object.fromEntries(Object.entries(entityRuntimeMessages).map(([key, values]) => [key, values[index]!])),
    Object.fromEntries(Object.entries(chartMessages).map(([key, values]) => [key, values[index]!]))),
])) as Record<(typeof ENTITY_CATALOG_LOCALES)[number], MessageCatalog>;
export const entityFallbackMessages = mergeCatalogs(entityEnglishMessages, catalogs.en);
export function entityMessages(locale: string): MessageCatalog {
  const language = new Intl.Locale(canonicalLocale(locale)).language;
  // Missing languages must use the fallback catalog's plural rules, not the
  // requested language's rules applied to English text.
  return catalogs[language as keyof typeof catalogs] ?? {};
}
