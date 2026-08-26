import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const violations = [];

for (const plane of ["studio", "neon", "mesh"]) {
  const layout = read(`apps/${plane}/app/layout.tsx`);
  if (!layout.includes("resolveRequestLocale") || !/<html lang=\{locale\} dir=\{textDirection\(locale\)\}/.test(layout)) violations.push(`${plane} must resolve both html lang and dir before hydration`);
  const manifest = JSON.parse(read(`apps/${plane}/package.json`));
  if (!manifest.dependencies?.["@athyper/platform-i18n"]) violations.push(`${plane} must declare the canonical i18n package`);
}

const i18n = read("packages/platform/foundation/i18n/src/index.ts");
for (const capability of ["resolveRequestLocale", "createEffectiveLocalization", "createIntlRuntime", "textDirection"]) if (!i18n.includes(`function ${capability}`)) violations.push(`canonical i18n package is missing ${capability}`);
for (const locale of ["en", "ar", "ms", "zh-Hans", "hi", "ta", "fr", "de"]) if (!i18n.includes(`code: "${locale}"`)) violations.push(`canonical locale registry is missing ${locale}`);
if (!i18n.includes("rolloutWave") || !i18n.includes("Simplified Chinese")) violations.push("canonical locale registry must declare rollout governance and script-specific Chinese");

const shell = read("packages/platform/shell/shell/src/index.tsx"), messages = read("packages/platform/shell/shell/src/messages.ts"), styles = read("packages/platform/shell/shell/src/styles.css");
if (!shell.includes("IntlProvider") || !shell.includes("fallbackMessages")) violations.push("shared shell must provide catalog fallback");
if (!messages.includes("shellArabicMessages")) violations.push("shared shell must publish an Arabic catalog");
if (!styles.includes("[dir=rtl] .athyper-shell__rail") || !styles.includes("translateX(105%)")) violations.push("shared shell must mirror desktop and mobile RTL geometry");
if (!shell.includes("onLocaleChange") || !read("packages/platform/shell/shell/src/client.tsx").includes("localePolicy.enabledLocales")) violations.push("shared shell must constrain user selection to the effective plane policy");
const studioLocalization=read("apps/studio/app/(shell)/operations/localization/page.tsx");
if (!studioLocalization.includes("studio.platform.catalog.manage") || !studioLocalization.includes("updateLocalePolicyOperation")) violations.push("Studio must own governed plane-language activation");
for (const gate of ["coveragePct", "linguisticReviewPassed", "layoutReviewPassed", "automatedTestsPassed", "qualified"]) if (!studioLocalization.includes(gate)) violations.push(`Studio catalog governance is missing ${gate}`);
const localeMigration=read("server/db/migrations/20260825_plane_locale_policy.sql");
if (!localeMigration.includes("fallback_locale_code = 'en'") || !localeMigration.includes("enabled_locale_codes")) violations.push("plane policy storage must retain English as an emergency fallback");
const governanceMigration=read("server/db/migrations/20260825_locale_catalog_governance.sql");
if (!governanceMigration.includes("locale_catalog_governance") || !governanceMigration.includes("'zh-Hans'") || !governanceMigration.includes("fallback_locale_code = 'en'")) violations.push("plane catalog governance migration must cover all locale evidence and English fallback");
const normalizedMigration=read("server/db/migrations/20260825_normalized_locale_catalog.sql");
for (const boundary of ["shared.locale", "control.ui_locale_catalog", "master.tenant_locale_activation"]) if (!normalizedMigration.includes(boundary)) violations.push(`normalized locale migration is missing ${boundary}`);
for (const locale of ["'en'", "'ar'", "'ms'", "'zh-Hans'", "'hi'", "'ta'", "'fr'", "'de'"]) if (!normalizedMigration.includes(locale)) violations.push(`normalized locale migration is missing ${locale}`);
for (const manifest of ["studio", "neon", "mesh"]) if (!read(`server/db/migrations/manifests/${manifest}.txt`).includes("20260825_normalized_locale_catalog.sql")) violations.push(`${manifest} migration manifest must install normalized locale governance`);

if (violations.length) {
  console.error("i18n foundation policy failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else console.log("i18n foundation policy passed");
