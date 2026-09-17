"use client";
import {
  createEffectiveLocalization,
  createIntlRuntime,
} from "@athyper/platform-i18n";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { shellEnglishMessages } from "./messages";

const FALLBACK_I18N = createIntlRuntime({
  localization: createEffectiveLocalization({
    uiLocale: "en",
    formatLocale: "en-US",
  }),
  messages: shellEnglishMessages,
});
export function useShellI18n() {
  return useOptionalI18n() ?? FALLBACK_I18N;
}
