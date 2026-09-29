import assert from "node:assert/strict";
import * as React from "react";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { COLOR_MODES, COLOR_TOKENS, DEFAULT_THEME_FAMILY, DENSITY_MODES, DENSITY_TOKENS, MONO_COLOR_TOKENS, REQUIRED_COLOR_TOKENS, THEME_FAMILIES, ThemeScript, createThemeBootstrapScript, resolveColorMode } from "../../packages/platform/foundation/theme/src/index";
import { ATLAS_MODERN_BRAND, ATLAS_MONO_BRAND } from "../../packages/platform/foundation/brand/src/index";

describe("foundation theme contract", () => {
  it("has every semantic token in light, dark, and high-contrast modes", () => {
    assert.deepEqual(COLOR_MODES, ["light", "dark", "high-contrast"]);
    for (const mode of COLOR_MODES) assert.deepEqual(Object.keys(COLOR_TOKENS[mode]).sort(), [...REQUIRED_COLOR_TOKENS].sort());
    const css = readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8");
    for (const token of REQUIRED_COLOR_TOKENS) {
      const cssName = token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      assert.match(css, new RegExp(`--a-${cssName}:`), `missing CSS variable for ${token}`);
    }
  });

  it("uses Atlas Modern as the shared default interaction theme", () => {
    assert.deepEqual(THEME_FAMILIES, ["atlas-modern", "atlas-mono"]);
    assert.equal(DEFAULT_THEME_FAMILY, "atlas-modern");
    assert.equal(COLOR_TOKENS.light.primary, "var(--a-brand)");
    assert.equal(COLOR_TOKENS.light.brand, ATLAS_MODERN_BRAND.colors.primary);
    assert.equal(COLOR_TOKENS.light.primaryForeground, "var(--a-brand-foreground)");
    assert.equal(COLOR_TOKENS.light.brandForeground, ATLAS_MODERN_BRAND.colors.primaryForeground);
    assert.equal(COLOR_TOKENS.dark.brandHover, "color-mix(in srgb, var(--a-brand) 42%, white)");
    assert.notEqual(COLOR_TOKENS.dark.primary, COLOR_TOKENS.dark.brandHover);
    const iamTokens = readFileSync("deploy/config/iam/themes/neon/login/resources/css/iam.tokens.css", "utf8");
    assert.match(iamTokens, /--a-theme-family:atlas-modern/);
    assert.match(iamTokens, /--a-primary: var\(--a-brand\)/);
    assert.match(iamTokens, /--a-brand: #234B84/);
    assert.match(iamTokens, /--a-story-start: color-mix\(in srgb, var\(--a-brand\)/);
    assert.match(iamTokens, /--plane-accent:var\(--a-primary\)/);
    const iamResolver = readFileSync("deploy/config/iam/themes/neon/login/_theme-resolver.ftl", "utf8");
    assert.match(iamResolver, /fallbackTheme = "atlas-modern"/);
    for (const page of ["deploy/compose/instance/config/nginx/status.html", "deploy/compose/platform/outage/status.html"]) {
      const html = readFileSync(page, "utf8");
      assert.match(html, /data-theme-family="atlas-modern"/);
      assert.match(html, /theme-color" content="#234B84"/);
    }
  });

  it("has an Atlas Mono family with full token coverage and unchanged status colors", () => {
    for (const mode of COLOR_MODES) assert.deepEqual(Object.keys(MONO_COLOR_TOKENS[mode]).sort(), [...REQUIRED_COLOR_TOKENS].sort());
    assert.equal(MONO_COLOR_TOKENS.light.brand, ATLAS_MONO_BRAND.colors.primary);
    assert.equal(MONO_COLOR_TOKENS.light.brandForeground, ATLAS_MONO_BRAND.colors.primaryForeground);
    assert.notEqual(MONO_COLOR_TOKENS.light.background, COLOR_TOKENS.light.background);
    for (const mode of ["light", "dark"] as const) assert.equal(MONO_COLOR_TOKENS[mode].focus, "var(--a-selection-subtle-foreground)");
    assert.equal(MONO_COLOR_TOKENS["high-contrast"].focus, COLOR_TOKENS["high-contrast"].focus);
    for (const mode of COLOR_MODES) {
      for (const token of ["danger", "dangerForeground", "warning", "warningForeground", "success", "successForeground"] as const) {
        assert.equal(MONO_COLOR_TOKENS[mode][token], COLOR_TOKENS[mode][token], `${mode}.${token} should stay chromatic so status meaning does not depend on hue alone`);
      }
    }
  });

  it("has complete compact, comfortable and spacious density modes with accessible touch targets", () => {
    assert.deepEqual(DENSITY_MODES, ["compact", "comfortable", "spacious"]);
    for (const density of DENSITY_MODES) {
      assert.deepEqual(Object.keys(DENSITY_TOKENS[density]).sort(), ["controlHeight", "pageGap", "space", "touchTarget"]);
      assert.ok(parseFloat(DENSITY_TOKENS[density].touchTarget) >= 2.75);
    }
  });

  it("resolves validated profile, tenant, platform, then operating-system preference", () => {
    assert.equal(resolveColorMode({ sessionProfile: "dark", tenantDefault: "light" }), "dark");
    assert.equal(resolveColorMode({ sessionProfile: "invalid", tenantDefault: "high-contrast" }), "high-contrast");
    assert.equal(resolveColorMode({ tenantDefault: "invalid", platformDefault: "dark" }), "dark");
    assert.equal(resolveColorMode({ systemHighContrast: true, systemDark: true }), "high-contrast");
    assert.equal(resolveColorMode({ systemDark: true }), "dark");
  });

  it("emits a synchronous head script that applies mode before body content", () => {
    const html = renderToStaticMarkup(<html><head><ThemeScript platformDefault="light" /></head><body><main>App</main></body></html>);
    assert.ok(html.indexOf("data-athyper-theme-script") < html.indexOf("<body>"));
    const script = createThemeBootstrapScript({ sessionMode: "dark" });
    assert.match(script, /document\.documentElement/);
    assert.match(script, /dataset\.theme/);
    assert.match(script, /dataset\.themeFamily/);
    assert.match(script, /atlas-modern/);
    assert.match(script, /m==="dark"\|\|m==="high-contrast"\?"dark":"light"/);
    assert.doesNotMatch(script, /<\/script/i);
  });

  it("lets operating-system preference determine the initial app theme, forwarding only the saved design-system family", () => {
    for (const plane of ["neon", "mesh", "studio"]) {
      const layout = readFileSync(`apps/${plane}/app/layout.tsx`, "utf8");
      assert.match(layout, /<ThemeScript \{\.\.\.\(themeFamily\?\{themeFamily\}:\{\}\)\} \/>/);
      assert.doesNotMatch(layout, /<ThemeScript[^>]*platformDefault="light"/);
      assert.doesNotMatch(layout, /<ThemeScript[^>]*sessionMode=/);
    }
  });

  it("defines focus, reduced-motion, touch, and forced-color safeguards", () => {
    const themeCss = readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8");
    const uiCss = readFileSync("packages/platform/foundation/ui/src/styles.css", "utf8");
    assert.match(themeCss, /:focus-visible/);
    assert.match(themeCss, /prefers-reduced-motion:reduce/);
    assert.match(themeCss, /forced-colors:active/);
    assert.match(uiCss, /pointer:coarse/);
    assert.match(uiCss, /--a-touch-target/);
  });
});
