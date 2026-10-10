import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHART_COLOUR_CRITERIA, HIGH_CONTRAST_CHART_COLOUR_CRITERIA, validateChartColours, type ChartColourSet } from "./colour-validator";
import { CHART_COLOR_TOKENS, COLOR_MODES, FAMILY_COLOR_TOKENS, THEME_FAMILIES, type ColorMode, type ThemeFamily } from "./tokens";

// The accepted chart colour sets (Shared chart blueprint 13.4a.11), locked
// here so an edit cannot quietly break one (decision 26). Changing a value
// means changing it here too, with its validator report.

const accepted = {
  "atlas-modern": {
    light: ["#054e8d", "#c18304", "#2098f6", "#89385a", "#af71b6", "#6250d6", "#e93288", "#51a062", "#234b84", "#8e94a0", "#e3e8ef", "#8a94a6"],
    dark: ["#527ffa", "#b27d06", "#eb92af", "#1f7746", "#2ca08e", "#ac9fea", "#ce0c38", "#b825ae", "#b9c5d8", "#6b7486", "#2a3850", "#6b7a93"],
    "high-contrast": ["#4a78d0", "#faa825", "#f8c3ff", "#b1578d", "#05a7c2", "#ffff00", "#9a9a9a", "#3a3a3a", "#ffffff"],
  },
  "atlas-mono": {
    light: ["#4d4481", "#9a934a", "#4499d8", "#13524a", "#7f728b", "#b66d6d", "#8f4b68", "#5870b3", "#1a1a1a", "#949494", "#e6e6e6", "#8c8c8c"],
    dark: ["#95a3eb", "#857a33", "#e6c4e5", "#5da190", "#835a84", "#5079bc", "#586f4f", "#a48bb0", "#ededed", "#707070", "#333333", "#7a7a7a"],
    "high-contrast": ["#4a78d0", "#faa825", "#f8c3ff", "#b1578d", "#05a7c2", "#ffff00", "#9a9a9a", "#3a3a3a", "#ffffff"],
  },
} as const;

/** Status tone pairs the validator reports for each mode (decision 25); a
 * chart drawing both tones of a pair direct-labels their marks. */
const expectedTonePairs: Record<ColorMode, readonly string[]> = {
  light: ["tone warning and tone danger"],
  dark: ["tone success and tone danger"],
  "high-contrast": [],
};

/** The set the validator checks: the chart tokens, with the surface, tones and
 * label inks taken from the family's own colour tokens (13.4a.11). */
function chartSet(family: ThemeFamily, mode: ColorMode): ChartColourSet {
  const chart = CHART_COLOR_TOKENS[family][mode];
  const colors = FAMILY_COLOR_TOKENS[family][mode];
  return {
    surface: colors.surface,
    sequence: chart.sequence,
    single: chart.single,
    neutral: chart.neutral,
    grid: chart.grid,
    axis: chart.axis,
    tones: { neutral: colors.mutedForeground, success: colors.success, warning: colors.warning, danger: colors.danger },
    labelInks: [colors.surface, colors.foreground],
  };
}

test("every accepted set keeps its locked values", () => {
  for (const family of THEME_FAMILIES)
    for (const mode of COLOR_MODES) {
      const chart = CHART_COLOR_TOKENS[family][mode];
      assert.deepEqual([...chart.sequence, chart.single, chart.neutral, chart.grid, chart.axis], [...accepted[family][mode]], `${family} ${mode}`);
    }
  // High contrast is one set for both families, as the theme's own tokens are.
  assert.equal(CHART_COLOR_TOKENS["atlas-mono"]["high-contrast"], CHART_COLOR_TOKENS["atlas-modern"]["high-contrast"]);
  // The single series: Modern's brand in light, Mono's ink.
  assert.equal(CHART_COLOR_TOKENS["atlas-modern"].light.single, FAMILY_COLOR_TOKENS["atlas-modern"].light.brand.toLowerCase());
  for (const mode of ["light", "dark"] as const) assert.equal(CHART_COLOR_TOKENS["atlas-mono"][mode].single, FAMILY_COLOR_TOKENS["atlas-mono"][mode].foreground);
});

test("every accepted set passes the colour validator with nothing relieved", () => {
  for (const family of THEME_FAMILIES)
    for (const mode of COLOR_MODES) {
      const report = validateChartColours(chartSet(family, mode), mode === "high-contrast" ? HIGH_CONTRAST_CHART_COLOUR_CRITERIA : CHART_COLOUR_CRITERIA);
      assert.deepEqual(report.findings, [], `${family} ${mode}`);
      assert.deepEqual(report.relieved, [], `${family} ${mode}`);
      assert.deepEqual([...new Set(report.tonePairs.map((pair) => pair.element))], expectedTonePairs[mode], `${family} ${mode}`);
    }
});

test("styles.css declares the same chart colours in every family and mode", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const blocks: Record<ThemeFamily, Record<ColorMode, string>> = {
    "atlas-modern": { light: ':root, :root[data-theme="light"]', dark: ':root[data-theme="dark"]', "high-contrast": ':root[data-theme="high-contrast"]' },
    "atlas-mono": {
      light: ':root[data-theme-family="atlas-mono"][data-theme="light"], :root[data-theme-family="atlas-mono"]',
      dark: ':root[data-theme-family="atlas-mono"][data-theme="dark"]',
      "high-contrast": ':root[data-theme-family="atlas-mono"][data-theme="high-contrast"]',
    },
  };
  for (const family of THEME_FAMILIES)
    for (const mode of COLOR_MODES) {
      const start = css.indexOf(`${blocks[family][mode]} {`);
      assert.ok(start >= 0, `${family} ${mode} block`);
      const body = css.slice(start, css.indexOf("}", start));
      const declared = Object.fromEntries([...body.matchAll(/--a-chart-([a-z0-9]+):([^;]+);/g)].map((match) => [match[1], match[2]]));
      const chart = CHART_COLOR_TOKENS[family][mode];
      const expected: Record<string, string> = { single: chart.single, neutral: chart.neutral, grid: chart.grid, axis: chart.axis };
      // Positions a set does not carry are unset, so nothing inherits another mode's colour.
      for (let index = 0; index < 8; index += 1) expected[`${index + 1}`] = chart.sequence[index] ?? "initial";
      assert.deepEqual(declared, expected, `${family} ${mode}`);
    }
});
