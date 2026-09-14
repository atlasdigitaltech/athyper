import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import { useOptionalI18n } from "@athyper/platform-i18n/react";

export function useOverviewMessage() {
  const i18n = useOptionalI18n();
  return (key: keyof typeof entityEnglishMessages): string => {
    const value = i18n?.message(key);
    return value && value !== key ? value : entityEnglishMessages[key];
  };
}
