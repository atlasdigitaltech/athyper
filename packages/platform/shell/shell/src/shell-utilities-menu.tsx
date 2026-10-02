"use client";
import { ChoiceSelect } from "@athyper/platform-ui";
import { useOptionalAppearanceProfile, type AppearancePreference } from "@athyper/platform-shell-app-foundation";
import { localeDefinition, type SupportedLocale } from "@athyper/platform-i18n";
import { THEME_FAMILIES, type ThemeFamily } from "@athyper/platform-theme/tokens";
import { useState, type ReactNode } from "react";
import { useShellI18n } from "./shell-i18n";

/** Client-only appearance switching; persisted per browser, not yet synced across devices. */
export function UtilitiesMenu({
  applicationName,
  planeDescriptor,
  currentLocale,
  localePolicy,
  onLocaleChange,
}: {
  readonly applicationName: string;
  readonly planeDescriptor?: string;
  readonly currentLocale?: string;
  readonly localePolicy?: Readonly<{ enabledLocales: readonly SupportedLocale[] }>;
  readonly onLocaleChange?: (localeCode: SupportedLocale) => Promise<void>;
}) {
  const t = useShellI18n().message;
  const appearance = useOptionalAppearanceProfile();
  const [localePending, setLocalePending] = useState(false);
  const [localeError, setLocaleError] = useState(false);
  const setPreference = (patch: AppearancePreference) => appearance?.setPreference(patch);
  return (
    <div className="athyper-shell__utilities">
      {appearance ? (
        <UtilitiesSection title={t("shell.utilities.appearance")}>
          <UtilitiesToggleGroup
            label={t("shell.utilities.theme")}
            value={appearance.profile.appearanceMode === "high_contrast" ? "system" : appearance.profile.appearanceMode}
            options={[
              { value: "system", label: t("shell.utilities.themeSystem") },
              { value: "light", label: t("shell.utilities.themeLight") },
              { value: "dark", label: t("shell.utilities.themeDark") },
            ]}
            onChange={(value) => setPreference({ appearanceMode: value as "system" | "light" | "dark" })}
          />
          <UtilitiesToggleGroup
            label={t("shell.utilities.density")}
            value={appearance.profile.densityCode}
            options={[
              { value: "compact", label: t("shell.utilities.densityCompact") },
              { value: "comfortable", label: t("shell.utilities.densityComfortable") },
              { value: "spacious", label: t("shell.utilities.densitySpacious") },
            ]}
            onChange={(value) => setPreference({ densityCode: value as "comfortable" | "compact" | "spacious" })}
          />
          <UtilitiesToggleGroup
            label={t("shell.utilities.designSystem")}
            value={appearance.themeFamily}
            options={THEME_FAMILIES.map((family) => ({ value: family, label: t(designSystemLabelKey(family)) }))}
            onChange={(value) => appearance.setThemeFamily(value as ThemeFamily)}
          />
        </UtilitiesSection>
      ) : null}
      {localePolicy && localePolicy.enabledLocales.length > 1 && onLocaleChange && currentLocale ? (
        <UtilitiesSection title={t("shell.utilities.languageRegion")}>
          <label className="athyper-shell__language athyper-shell__language--utilities">
            <ChoiceSelect
              label={t("shell.profile.language")}
              value={currentLocale}
              disabled={localePending}
              onChange={(locale) => {
                setLocalePending(true);
                setLocaleError(false);
                void onLocaleChange(locale as SupportedLocale)
                  .then(() => setLocalePending(false))
                  .catch(() => {
                    setLocalePending(false);
                    setLocaleError(true);
                  });
              }}
              options={localePolicy.enabledLocales.map((locale) => {
                const definition = localeDefinition(locale);
                return {
                  value: locale,
                  label:
                    definition.nativeName === definition.englishName
                      ? definition.nativeName
                      : `${definition.nativeName} — ${definition.englishName}`,
                };
              })}
            />
            {localeError ? <small role="alert">{t("shell.profile.languageError")}</small> : null}
          </label>
        </UtilitiesSection>
      ) : null}
      <UtilitiesSection title={t("shell.utilities.about")}>
        <dl className="athyper-shell__utilities-about">
          <div>
            <dt>{t("shell.utilities.aboutPlane")}</dt>
            <dd>{applicationName}</dd>
          </div>
          {planeDescriptor ? (
            <div>
              <dt />
              <dd>{planeDescriptor}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("shell.utilities.aboutAgent")}</dt>
            <dd>Atlas</dd>
          </div>
        </dl>
        <p className="athyper-shell__utilities-copyright">© 2026 Atlas Digital Technology Solutions</p>
      </UtilitiesSection>
    </div>
  );
}

function designSystemLabelKey(family: ThemeFamily): "shell.utilities.designSystemModern" | "shell.utilities.designSystemMono" {
  return family === "atlas-mono" ? "shell.utilities.designSystemMono" : "shell.utilities.designSystemModern";
}

function UtilitiesSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="athyper-shell__utilities-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function UtilitiesToggleGroup({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="athyper-shell__utilities-toggle-group" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
