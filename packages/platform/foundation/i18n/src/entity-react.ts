"use client";
import { useMemo } from "react";
import { createEffectiveLocalization, createIntlRuntime, type EffectiveLocalization, type IntlRuntime } from "./index";
import { useOptionalI18n } from "./react";
import { entityMessages, entityFallbackMessages } from "./entity-catalogs";

const fallbackLocalization = createEffectiveLocalization({ uiLocale: "en", formatLocale: "en-US" });
// A feed with hundreds of cards shares one formatter cache per immutable shell
// localization, rather than compiling the same ICU messages for every card.
const runtimes = new WeakMap<EffectiveLocalization, IntlRuntime>();
/** Uses the shell's governed locale; never reads browser language independently. */
export function useEntityI18n() {
  const context = useOptionalI18n();
  const localization = context?.localization ?? fallbackLocalization;
  const fallback = useMemo(() => {
    let runtime = runtimes.get(localization);
    if (!runtime) {
      runtime = createIntlRuntime({ localization, messages: entityMessages(localization.catalogLocale), fallbackMessages: entityFallbackMessages });
      runtimes.set(localization, runtime);
    }
    return runtime;
  }, [localization]);
  // The shell already owns the governed locale and shared framework catalog.
  // Reuse it so shell and entity messages cannot select different languages.
  return context ?? fallback;
}
