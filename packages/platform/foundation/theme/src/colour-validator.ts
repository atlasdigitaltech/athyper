// Chart colour validator (Shared chart blueprint, section 13.4a.1; step A5.1a).
// A pure module with deterministic inputs: WCAG relative luminance and
// contrast, colour-vision deficiency simulation, and CIEDE2000 colour
// difference. Every chart colour set in the theme must pass it before any
// chart draws with it; it belongs to the design system, not the chart, so
// other data colours can use it later.

/** A colour as six-digit hex, `#rrggbb`. */
export type HexColour = string;

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: HexColour): readonly [number, number, number] {
  if (!HEX.test(hex)) throw new TypeError(`Not a #rrggbb colour: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** sRGB channel (0–255) to linear light (0–1). */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearRgb(hex: HexColour): readonly [number, number, number] {
  const [r, g, b] = channels(hex);
  return [linear(r), linear(g), linear(b)];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: HexColour): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrastRatio(a: HexColour, b: HexColour): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type ColourVision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";
export const COLOUR_VISIONS: readonly ColourVision[] = Object.freeze(["normal", "protanopia", "deuteranopia", "tritanopia"]);

/** Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB. */
const DEFICIENCY: Readonly<Record<Exclude<ColourVision, "normal">, readonly (readonly [number, number, number])[]>> = Object.freeze({
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
});

function seen(hex: HexColour, vision: ColourVision): readonly [number, number, number] {
  const rgb = linearRgb(hex);
  if (vision === "normal") return rgb;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return DEFICIENCY[vision].map((row) => clamp(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])) as unknown as readonly [number, number, number];
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Linear sRGB to CIELAB, D65 white. */
function labOf([r, g, b]: readonly [number, number, number]): Lab {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** A colour in CIELAB as a viewer with the given vision sees it. */
export function labAsSeen(hex: HexColour, vision: ColourVision = "normal"): Lab {
  return labOf(seen(hex, vision));
}

/** CIEDE2000 colour difference (Sharma, Wu and Dalal, 2005), kL = kC = kH = 1. */
export function ciede2000(one: Lab, two: Lab): number {
  const rad = Math.PI / 180;
  const c1 = Math.hypot(one.a, one.b), c2 = Math.hypot(two.a, two.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1 = (1 + g) * one.a, a2 = (1 + g) * two.a;
  const cp1 = Math.hypot(a1, one.b), cp2 = Math.hypot(a2, two.b);
  const hue = (b: number, a: number) => {
    if (b === 0 && a === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const hp1 = hue(one.b, a1), hp2 = hue(two.b, a2);
  const dL = two.l - one.l;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * rad);
  const lBar = (one.l + two.l) / 2;
  const cpBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hBar /= 2;
    else hBar = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad) + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** The colour difference between two colours as a viewer with the given vision sees them. */
export function colourDistance(a: HexColour, b: HexColour, vision: ColourVision = "normal"): number {
  return ciede2000(labAsSeen(a, vision), labAsSeen(b, vision));
}

/** The criteria per element class (13.4a.1). The two distances are
 * CIEDE2000 values, recorded with their reasons in the blueprint: the
 * Okabe-Ito palette, the reference for colour-blind-safe categories, passes
 * with margin (closest neighbours 42.9 normal, 14.0 protanopia), while two
 * near-identical blues (3.3) and red against green under deuteranopia (4.6)
 * fail. */
export const CHART_COLOUR_CRITERIA = Object.freeze({
  /** How many sequence colours a set carries. */
  sequenceLength: 8,
  /** Series, single-series and tone fills against the plot background (WCAG 1.4.11). */
  fillContrast: 3,
  /** Axis lines against the background (WCAG 1.4.11). */
  axisContrast: 3,
  /** Label text drawn on a fill (WCAG 1.4.3). */
  labelContrast: 4.5,
  /** Every pair of sequence colours, normal colour vision (decision 23:
   * colours are keyed, so any two can be drawn side by side). */
  neighbourDistance: 15,
  /** Every pair of sequence colours, under each simulated deficiency. */
  neighbourDistanceDeficient: 10,
  /** The floor under relief: a relieved series fill still reaches this, so
   * its marks are visible at all (decision 22). */
  reliefFloor: 2,
});

/** High contrast carries fewer, more widely separated colours, and a chart
 * under it caps its series at that count (decision 27). */
export const HIGH_CONTRAST_CHART_COLOUR_CRITERIA = Object.freeze({ ...CHART_COLOUR_CRITERIA, sequenceLength: 5 });

/** One chart colour set: one family in one mode (13.4a.2). */
export interface ChartColourSet {
  /** The plot background the marks sit on. */
  readonly surface: HexColour;
  /** `--a-chart-1` … `--a-chart-8`, in sequence order (`--a-chart-1` … `--a-chart-5` under high contrast). */
  readonly sequence: readonly HexColour[];
  /** `--a-chart-single`. */
  readonly single: HexColour;
  /** `--a-chart-neutral` ("Others"). */
  readonly neutral: HexColour;
  readonly grid: HexColour;
  readonly axis: HexColour;
  /** The status tone colours a chart uses for meaning. */
  readonly tones: Readonly<Record<"neutral" | "success" | "warning" | "danger", HexColour>>;
  /** The text colours a data label may be drawn in, on a fill. */
  readonly labelInks: readonly HexColour[];
}

export type ChartColourFindingCode =
  | "CHART_COLOUR_SEQUENCE_LENGTH"
  | "CHART_FILL_CONTRAST"
  | "CHART_RELIEF_FLOOR"
  | "CHART_TONE_DISTANCE"
  | "CHART_NEUTRAL_DISTANCE"
  | "CHART_OTHERS_DISTANCE"
  | "CHART_TONE_PAIR_DISTANCE"
  | "CHART_NEIGHBOUR_DISTANCE"
  | "CHART_AXIS_CONTRAST"
  | "CHART_GRID_DOMINATES";

export interface ChartColourFinding {
  readonly code: ChartColourFindingCode;
  /** Which element, for example "sequence 3", "tone success", "sequence 2 and 3". */
  readonly element: string;
  readonly vision?: ColourVision;
  readonly measured: number;
  /** The bound the measurement had to meet (a minimum, or for the grid a maximum). */
  readonly required: number;
}

export interface ChartFillReport {
  readonly element: string;
  readonly colour: HexColour;
  /** `series` (sequence, single, neutral): identification by colour, which
   * the relief rule covers. `tone`: identification by meaning, always 3:1. */
  readonly role: "series" | "tone";
  readonly contrast: number;
  /** A series fill under 3:1, allowed by the relief rule: every mark drawn in
   * it must carry a direct label, and the data table must be available. */
  readonly relieved: boolean;
  /** The label ink with the highest contrast on this fill, and whether it is
   * enough to draw a label inside the mark; otherwise labels go outside. */
  readonly labelInk: HexColour;
  readonly labelContrast: number;
  readonly labelInside: boolean;
}

export interface ChartColourReport {
  readonly pass: boolean;
  readonly findings: readonly ChartColourFinding[];
  readonly fills: readonly ChartFillReport[];
  /** Series fills under 3:1 that the relief rule allows (see `relieved`). */
  readonly relieved: readonly string[];
  /** The closest pair of sequence colours, per vision (decision 23). */
  readonly closestPairs: Readonly<Record<ColourVision, { readonly element: string; readonly distance: number }>>;
  /** Pairs of meaningful status tones that are not distinct under some
   * vision (`CHART_TONE_PAIR_DISTANCE`, decision 25). Informational: they do
   * not fail the set, but a chart drawing both tones direct-labels their
   * marks, so meaning never rests on hue alone. */
  readonly tonePairs: readonly ChartColourFinding[];
  readonly axisContrast: number;
  readonly gridContrast: number;
}

/** Checks one chart colour set against the 13.4a.1 criteria with the relief
 * rule (13.4a.7). Pure and deterministic: the same set always gives the same
 * report.
 *
 * Relief: a series fill (sequence, single, neutral) below 3:1 is allowed,
 * and reported as relieved, because its marks carry direct labels and the
 * data table is available. Status tones identify by meaning, as badges and
 * Board lanes do without labels, so they always meet 3:1; so do the axis and
 * the grid's reference. A relieved fill still reaches the relief floor
 * (2:1), every meaningful status tone stands apart from every sequence
 * colour under every simulated vision, and the neutral tone from "Others"
 * (decisions 21, 22 and 24), and "Others" from every sequence colour
 * (decision 28). Status tone pairs that are not distinct are
 * reported in `tonePairs`, without failing the set (decision 25). */
export function validateChartColours(set: ChartColourSet, criteria = CHART_COLOUR_CRITERIA): ChartColourReport {
  const findings: ChartColourFinding[] = [];
  if (set.sequence.length !== criteria.sequenceLength)
    findings.push({ code: "CHART_COLOUR_SEQUENCE_LENGTH", element: "sequence", measured: set.sequence.length, required: criteria.sequenceLength });
  if (!set.labelInks.length) throw new TypeError("A chart colour set needs at least one label ink");
  const filled: [string, HexColour, ChartFillReport["role"]][] = [
    ...set.sequence.map((colour, index): [string, HexColour, "series"] => [`sequence ${index + 1}`, colour, "series"]),
    ["single", set.single, "series"],
    ["neutral", set.neutral, "series"],
    ...(Object.entries(set.tones) as [string, HexColour][]).map(([tone, colour]): [string, HexColour, "tone"] => [`tone ${tone}`, colour, "tone"]),
  ];
  const fills = filled.map(([element, colour, role]) => {
    const contrast = contrastRatio(colour, set.surface);
    const relieved = role === "series" && contrast < criteria.fillContrast;
    if (contrast < criteria.fillContrast && !relieved) findings.push({ code: "CHART_FILL_CONTRAST", element, measured: contrast, required: criteria.fillContrast });
    if (relieved && contrast < criteria.reliefFloor) findings.push({ code: "CHART_RELIEF_FLOOR", element, measured: contrast, required: criteria.reliefFloor });
    const [labelInk, labelContrast] = set.labelInks
      .map((ink): [HexColour, number] => [ink, contrastRatio(ink, colour)])
      .reduce((best, next) => (next[1] > best[1] ? next : best));
    return Object.freeze({ element, colour, role, contrast, relieved, labelInk, labelContrast, labelInside: labelContrast >= criteria.labelContrast });
  });
  const closest = {} as Record<ColourVision, { element: string; distance: number }>;
  for (const vision of COLOUR_VISIONS) {
    const required = vision === "normal" ? criteria.neighbourDistance : criteria.neighbourDistanceDeficient;
    // Every pair, not only palette neighbours: colours are assigned by key
    // (decision 19), so any two can be drawn side by side (decision 23).
    for (let first = 0; first < set.sequence.length; first += 1)
      for (let second = first + 1; second < set.sequence.length; second += 1) {
        const element = `sequence ${first + 1} and ${second + 1}`;
        const distance = colourDistance(set.sequence[first]!, set.sequence[second]!, vision);
        if (!closest[vision] || distance < closest[vision].distance) closest[vision] = { element, distance };
        if (distance < required) findings.push({ code: "CHART_NEIGHBOUR_DISTANCE", element, vision, measured: distance, required });
      }
  }
  // The meaningful status tones stand apart from every sequence colour under
  // every vision, so a toned category never looks like an arbitrary one
  // (decision 21). The neutral tone is deliberately unobtrusive and is not
  // held to it (decision 24).
  const meaningful = (Object.entries(set.tones) as [string, HexColour][]).filter(([tone]) => tone !== "neutral");
  for (const [tone, colour] of meaningful)
    for (const vision of COLOUR_VISIONS) {
      const required = vision === "normal" ? criteria.neighbourDistance : criteria.neighbourDistanceDeficient;
      set.sequence.forEach((series, index) => {
        const distance = colourDistance(colour, series, vision);
        if (distance < required) findings.push({ code: "CHART_TONE_DISTANCE", element: `tone ${tone} and sequence ${index + 1}`, vision, measured: distance, required });
      });
    }
  // The neutral tone and "Others" are both greys; they must not be mistaken
  // for each other where a neutral status and "Others" share a chart
  // (decision 24).
  const tonePairs: ChartColourFinding[] = [];
  for (const vision of COLOUR_VISIONS) {
    const required = vision === "normal" ? criteria.neighbourDistance : criteria.neighbourDistanceDeficient;
    const distance = colourDistance(set.tones.neutral, set.neutral, vision);
    if (distance < required) findings.push({ code: "CHART_NEUTRAL_DISTANCE", element: "tone neutral and neutral", vision, measured: distance, required });
    // "Others" is drawn beside the series it summarises; a series that looks
    // like it reads as part of the remainder (decision 28).
    set.sequence.forEach((series, index) => {
      const apart = colourDistance(set.neutral, series, vision);
      if (apart < required) findings.push({ code: "CHART_OTHERS_DISTANCE", element: `neutral and sequence ${index + 1}`, vision, measured: apart, required });
    });
    // Status against status (decision 25): reported, not failed.
    for (let first = 0; first < meaningful.length; first += 1)
      for (let second = first + 1; second < meaningful.length; second += 1) {
        const pair = colourDistance(meaningful[first]![1], meaningful[second]![1], vision);
        if (pair < required)
          tonePairs.push({ code: "CHART_TONE_PAIR_DISTANCE", element: `tone ${meaningful[first]![0]} and tone ${meaningful[second]![0]}`, vision, measured: pair, required });
      }
  }
  const axisContrast = contrastRatio(set.axis, set.surface);
  if (axisContrast < criteria.axisContrast) findings.push({ code: "CHART_AXIS_CONTRAST", element: "axis", measured: axisContrast, required: criteria.axisContrast });
  // Grid lines must sit below every data fill that meets the fill criterion,
  // so the data dominates. The reference is the criterion, not the weakest
  // actual fill: a relieved fill is too weak to compete with anything, and
  // measuring against it would make the grid invisible (audit round 13).
  const gridContrast = contrastRatio(set.grid, set.surface);
  if (gridContrast >= criteria.fillContrast) findings.push({ code: "CHART_GRID_DOMINATES", element: "grid", measured: gridContrast, required: criteria.fillContrast });
  return Object.freeze({
    pass: !findings.length,
    findings: Object.freeze(findings),
    fills: Object.freeze(fills),
    relieved: Object.freeze(fills.filter((fill) => fill.relieved).map((fill) => fill.element)),
    closestPairs: Object.freeze(closest),
    tonePairs: Object.freeze(tonePairs),
    axisContrast,
    gridContrast,
  });
}
