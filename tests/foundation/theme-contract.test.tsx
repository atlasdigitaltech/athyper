import assert from "node:assert/strict";
import * as React from "react";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BREAKPOINT_SCALE, CONTAINER_ONLY_BREAKPOINTS, COLOR_MODES, COLOR_TOKENS, DEFAULT_THEME_FAMILY, DENSITY_MODES, DENSITY_TOKENS, MONO_COLOR_TOKENS, REQUIRED_COLOR_TOKENS, THEME_FAMILIES, ThemeScript, createThemeBootstrapScript, resolveColorMode } from "../../packages/platform/foundation/theme/src/index";
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
      assert.deepEqual(Object.keys(DENSITY_TOKENS[density]).sort(), ["cellPaddingBlock", "cellPaddingInline", "controlHeight", "controlHeightSmall", "dataFontSize", "dataLineHeight", "headerHeight", "iconButton", "labelFontSize", "labelLineHeight", "pageGap", "panelGutter", "rowHeight", "sectionFontSize", "sectionGap", "sectionLineHeight", "space", "stackGap", "touchTarget"]);
      assert.ok(parseFloat(DENSITY_TOKENS[density].touchTarget) >= 2.75);
      // WCAG 2.2 target size (minimum) 24px for pointer targets.
      assert.ok(parseFloat(DENSITY_TOKENS[density].iconButton) >= 1.5);
    }
    // Rows, controls and spacing grow monotonically from compact to spacious.
    for (const key of ["rowHeight", "headerHeight", "controlHeight", "controlHeightSmall", "iconButton", "dataFontSize", "dataLineHeight", "labelFontSize", "labelLineHeight", "sectionFontSize", "sectionLineHeight", "stackGap", "sectionGap"] as const)
      assert.ok(parseFloat(DENSITY_TOKENS.compact[key]) < parseFloat(DENSITY_TOKENS.comfortable[key]) && parseFloat(DENSITY_TOKENS.comfortable[key]) < parseFloat(DENSITY_TOKENS.spacious[key]), key);
  });

  it("has one ascending breakpoint scale that the entity list tiers use", async () => {
    const values = Object.values(BREAKPOINT_SCALE);
    assert.deepEqual([...values].sort((a, b) => a - b), values);
    const { LIST_NARROW_MAX_REM, LIST_WIDE_MIN_REM } = await import("../../packages/platform/entity/runtime/list-view/src/presentation-tier");
    assert.equal(LIST_NARROW_MAX_REM, BREAKPOINT_SCALE.narrow);
    assert.equal(LIST_WIDE_MIN_REM, BREAKPOINT_SCALE.wide);
    // The container-only compact tier splits the side panel's own width range,
    // so components can tell a narrow panel from a roomy one.
    assert.deepEqual([...CONTAINER_ONLY_BREAKPOINTS], ["compact"]);
    const { TOOL_PANEL_MIN_WIDTH, TOOL_PANEL_MAX_WIDTH } = await import("../../packages/platform/shell/shell/src/workspace-tool-panel");
    assert.ok(BREAKPOINT_SCALE.compact * 16 > TOOL_PANEL_MIN_WIDTH && BREAKPOINT_SCALE.compact * 16 < TOOL_PANEL_MAX_WIDTH);
    assert.ok(BREAKPOINT_SCALE.compact < BREAKPOINT_SCALE.narrow);
  });

  it("gives scripts the same viewport widths as stylesheets", async () => {
    const { viewportQuery } = await import("../../packages/platform/foundation/theme/src/tokens");
    assert.equal(viewportQuery({ below: "medium" }), "(width < 48rem)");
    assert.equal(viewportQuery({ from: "extraWide" }), "(width >= 80rem)");
    assert.equal(viewportQuery({ from: "medium", below: "extraWide" }), "(48rem <= width < 80rem)");
    assert.throws(() => viewportQuery({}));
    // A panel can be pinned exactly where the shell reserves its width (styles.css).
    const { TOOL_PANEL_PIN_QUERY } = await import("../../packages/platform/shell/shell/src/workspace-tool-panel");
    assert.equal(TOOL_PANEL_PIN_QUERY, "(width >= 80rem)");
    const shell = readFileSync("packages/platform/shell/shell/src/styles.css", "utf8");
    assert.match(shell, /@media \(width >= 80rem\)\{\.athyper-shell\[data-workspace-panel-pinned=true\] \.athyper-shell__body\{margin-inline-end/);
  });

  it("defines the same density token values in CSS for any [data-density] subtree", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8");
    const cssName = (key: string) => `--a-${key === "space" || key === "pageGap" || key === "controlHeight" || key === "touchTarget" ? "" : "density-"}${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    for (const density of DENSITY_MODES) {
      const block = css.match(new RegExp(`\\[data-density="${density}"\\] \\{([^}]*)\\}`))?.[1];
      assert.ok(block, `missing [data-density="${density}"] block`);
      for (const [key, value] of Object.entries(DENSITY_TOKENS[density])) {
        const declared = block!.match(new RegExp(`${cssName(key)}:([^;]+);`))?.[1];
        assert.equal(parseFloat(declared ?? "NaN"), parseFloat(value), `${density} ${key}`);
      }
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
