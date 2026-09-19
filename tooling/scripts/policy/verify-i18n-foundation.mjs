import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
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
const localePolicy = read("server/db/ddl/common/control/03_tables.sql");
if (!localePolicy.includes("fallback_locale_code") || !localePolicy.includes("enabled_locale_codes")) violations.push("canonical plane policy storage must retain locale fallback and enablement controls");
const localeCatalog = read("server/db/ddl/common/control/12_ui_locale_catalog_seed.sql") + read("server/db/ddl/common/shared/reference-data/005_locale.sql");
if (!localeCatalog.includes("'zh-Hans'") || !localeCatalog.includes("'en'")) violations.push("canonical locale catalog must cover governed locales and English fallback");
const normalizedDdl = read("server/db/ddl/common/shared/03_tables.sql") + localePolicy + read("server/db/ddl/common/master/03_platform_tables.sql");
for (const boundary of ["shared.locale", "control.ui_locale_catalog", "master.tenant_locale_activation"]) if (!normalizedDdl.includes(boundary)) violations.push(`canonical locale DDL is missing ${boundary}`);
for (const plane of ["studio", "neon", "mesh"]) {
  const manifest = read(`server/db/ddl/planes/${plane}/_manifest.txt`);
  for (const entry of ["common/shared/03_tables.sql", "common/control/03_tables.sql", "common/control/12_ui_locale_catalog_seed.sql"]) if (!manifest.includes(entry)) violations.push(`${plane} DDL manifest is missing ${entry}`);
}

if (violations.length) {
  console.error("i18n foundation policy failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else console.log("i18n foundation policy passed");
