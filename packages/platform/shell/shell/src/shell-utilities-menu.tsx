"use client";
import { ChoiceSelect } from "@athyper/platform-ui";
import { useOptionalAppearanceProfile, type AppearancePreference } from "@athyper/platform-shell-app-foundation";
import { localeDefinition, type SupportedLocale } from "@athyper/platform-i18n";
import { THEME_FAMILIES, type ThemeFamily } from "@athyper/platform-theme/tokens";
import { useState, type ReactNode } from "react";
import { useShellI18n } from "./shell-i18n";

/** Personal preferences: theme, density, design system and language, saved to the
 * principal's profile so they follow the person to every device. */
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
      <UtilitiesSection title={t("shell.utilities.appearance")}>
        {appearance ? (<>
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
        </>) : null}
        <LanguageRow
          currentLocale={currentLocale}
          localePolicy={localePolicy}
          onLocaleChange={onLocaleChange}
        />
      </UtilitiesSection>
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

/** Language sits with the other personal preferences. Up to three languages are a
 * segmented choice, more a select; one enabled language is shown read-only so the
 * setting never looks missing. */
function LanguageRow({
  currentLocale = "en",
  localePolicy,
  onLocaleChange,
}: {
  readonly currentLocale?: string | undefined;
  readonly localePolicy?: Readonly<{ enabledLocales: readonly SupportedLocale[] }> | undefined;
  readonly onLocaleChange?: ((localeCode: SupportedLocale) => Promise<void>) | undefined;
}) {
  const t = useShellI18n().message;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const locales = localePolicy?.enabledLocales ?? [];
  const name = (locale: string) => { try { return localeDefinition(locale as SupportedLocale).nativeName; } catch { return locale; } };
  if (locales.length < 2 || !onLocaleChange)
    return (
      <div className="athyper-shell__utilities-toggle-group athyper-shell__utilities-readonly">
        <span>{t("shell.profile.language")}</span>
        <div><strong>{name(locales[0] ?? currentLocale)}</strong><small>{t("shell.utilities.languageOnly")}</small></div>
      </div>
    );
  const choose = (locale: string) => {
    if (locale === currentLocale) return;
    setPending(true);
    setFailed(false);
    void onLocaleChange(locale as SupportedLocale).then(() => setPending(false)).catch(() => { setPending(false); setFailed(true); });
  };
  return (
    <>
      {locales.length <= 3 ? (
        <UtilitiesToggleGroup
          label={t("shell.profile.language")}
          value={currentLocale}
          disabled={pending}
          options={locales.map((locale) => ({ value: locale, label: name(locale), lang: locale }))}
          onChange={choose}
        />
      ) : (
        <div className="athyper-shell__utilities-toggle-group">
          <span>{t("shell.profile.language")}</span>
          <ChoiceSelect
            label={t("shell.profile.language")}
            value={currentLocale}
            disabled={pending}
            onChange={choose}
            options={locales.map((locale) => ({ value: locale, label: name(locale) }))}
          />
        </div>
      )}
      {failed ? <small className="athyper-shell__utilities-error" role="alert">{t("shell.profile.languageError")}</small> : null}
    </>
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
  disabled = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string; readonly lang?: string }[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
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
            disabled={disabled}
            lang={option.lang}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
