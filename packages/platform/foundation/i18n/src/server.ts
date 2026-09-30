import { createIntlRuntime, type EffectiveLocalization, type LocalizationDiagnostic, type MessageCatalog } from "./index";

export function createServerI18n(input: { readonly localization: EffectiveLocalization; readonly messages: MessageCatalog; readonly fallbackMessages?: MessageCatalog; readonly onDiagnostic?: (event: LocalizationDiagnostic) => void }) {
  return createIntlRuntime(input);
}
