import type { ChartDataV1, ChartTone } from "@athyper/contract-platform-chart";
import { CHART_COLOUR_CRITERIA, COLOUR_VISIONS, colourDistance, contrastRatio } from "@athyper/platform-theme/colour-validator";
import { CHART_COLOR_TOKENS, DEFAULT_THEME_FAMILY, FAMILY_COLOR_TOKENS, isColorMode, isThemeFamily, type ColorMode, type ThemeFamily } from "@athyper/platform-theme/tokens";

// The Chart's pure parts (Shared chart blueprint 13.3 and 13.4a): value-axis
// ticks, which colour token each mark takes, and the checks the component makes
// on the colours it actually draws. Drawing uses the CSS tokens; these checks
// read the same values from the theme's token tables.

/** "Nice" round ticks covering [min, max], always including zero. */
export function chartTicks(min: number, max: number, target = 5): { readonly ticks: readonly number[]; readonly min: number; readonly max: number; readonly decimals: number } {
  let low = Math.min(0, min), high = Math.max(0, max);
  if (low === high) high = low + 1;
  const rough = (high - low) / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power);
  low = Math.floor(low / step) * step;
  high = Math.ceil(high / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(Number(tick.toFixed(decimals)));
  return { ticks, min: low, max: high, decimals };
}

/** The colour token a mark is drawn in. */
export type ChartSlot =
  | { readonly kind: "sequence"; readonly index: number }
  | { readonly kind: "single" }
  | { readonly kind: "neutral" }
  | { readonly kind: "tone"; readonly tone: ChartTone };

export function slotClass(slot: ChartSlot): string {
  switch (slot.kind) {
    case "sequence": return `a-chart__fill--${slot.index + 1}`;
    case "tone": return `a-chart__fill--tone-${slot.tone}`;
    default: return `a-chart__fill--${slot.kind}`;
  }
}
const slotKey = (slot: ChartSlot) => slotClass(slot);

/** The colours in force, read from the document's theme attributes. */
export interface ChartTheme {
  readonly family: ThemeFamily;
  readonly mode: ColorMode;
}
export function documentChartTheme(root: Element | null | undefined): ChartTheme {
  const family = root?.getAttribute("data-theme-family"), mode = root?.getAttribute("data-theme");
  return { family: isThemeFamily(family) ? family : DEFAULT_THEME_FAMILY, mode: isColorMode(mode) ? mode : "light" };
}
/** How many sequence colours the theme carries: 8, or 5 under high contrast (decision 27). */
export function chartSeriesLimit(theme: ChartTheme): number {
  return CHART_COLOR_TOKENS[theme.family][theme.mode].sequence.length;
}
/** A slot's colour in the theme, as hex. */
export function slotColour(slot: ChartSlot, theme: ChartTheme): string {
  const chart = CHART_COLOR_TOKENS[theme.family][theme.mode], colors = FAMILY_COLOR_TOKENS[theme.family][theme.mode];
  switch (slot.kind) {
    case "sequence": return chart.sequence[slot.index % chart.sequence.length]!;
    case "single": return chart.single;
    case "neutral": return chart.neutral;
    case "tone": { const tone = slot.tone; return tone === "neutral" ? colors.mutedForeground : colors[tone]; }
  }
}
/** The label ink that reads on a fill: the surface or the foreground, whichever
 * reaches 4.5:1; undefined when neither does, so the label is not drawn inside. */
export function labelInk(slot: ChartSlot, theme: ChartTheme): "surface" | "foreground" | undefined {
  const colors = FAMILY_COLOR_TOKENS[theme.family][theme.mode], fill = slotColour(slot, theme);
  const [ink, contrast] = (["surface", "foreground"] as const).map((name) => [name, contrastRatio(colors[name], fill)] as const).reduce((best, next) => (next[1] > best[1] ? next : best));
  return contrast >= CHART_COLOUR_CRITERIA.labelContrast ? ink : undefined;
}

const apart = (a: string, b: string) =>
  COLOUR_VISIONS.every((vision) => colourDistance(a, b, vision) >= (vision === "normal" ? CHART_COLOUR_CRITERIA.neighbourDistance : CHART_COLOUR_CRITERIA.neighbourDistanceDeficient));

/** Decision 20: colours are keyed, so check the pairs a chart actually draws.
 * Returns each pair of distinct keys whose colours are the same token or are not
 * distinct under some vision, apart from status tones (decision 25 labels those). */
export function chartColourConflicts(drawn: readonly { readonly key: string; readonly slot: ChartSlot }[], theme: ChartTheme): readonly (readonly [string, string])[] {
  const conflicts: [string, string][] = [];
  for (let first = 0; first < drawn.length; first += 1)
    for (let second = first + 1; second < drawn.length; second += 1) {
      const a = drawn[first]!, b = drawn[second]!;
      if (a.key === b.key || (a.slot.kind === "tone" && b.slot.kind === "tone")) continue;
      if (slotKey(a.slot) === slotKey(b.slot) || !apart(slotColour(a.slot, theme), slotColour(b.slot, theme))) conflicts.push([a.key, b.key]);
    }
  return conflicts;
}

/** Decision 25: the tones drawn together that are not distinct under some
 * vision. Marks in these tones carry direct labels, so meaning never rests on
 * hue alone. */
export function closeTones(tones: readonly ChartTone[], theme: ChartTheme): ReadonlySet<ChartTone> {
  const unique = [...new Set(tones)], close = new Set<ChartTone>();
  for (let first = 0; first < unique.length; first += 1)
    for (let second = first + 1; second < unique.length; second += 1) {
      const a = unique[first]!, b = unique[second]!;
      if (!apart(slotColour({ kind: "tone", tone: a }, theme), slotColour({ kind: "tone", tone: b }, theme))) { close.add(a); close.add(b); }
    }
  return close;
}

/** The slot of a keyed category or series (13.4a.3): its tone when the consumer
 * declares one, otherwise its palette position (the consumer's fixed reference
 * order when it has one, else its position among the given keys), wrapping. */
export function keyedSlot(key: string, position: number, limit: number, toneOf?: (key: string) => ChartTone | undefined, paletteIndexOf?: (key: string) => number | undefined): ChartSlot {
  const tone = toneOf?.(key);
  if (tone) return { kind: "tone", tone };
  return { kind: "sequence", index: (paletteIndexOf?.(key) ?? position) % limit };
}

/** A stable signature of the data, to restart the fade when it changes. */
export function chartSignature(data: ChartDataV1): string {
  return JSON.stringify([data.categories.map((item) => item.key), data.series.map((item) => item.key), data.points]);
}
