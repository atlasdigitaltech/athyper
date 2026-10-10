import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART_COLOUR_CRITERIA,
  ciede2000,
  colourDistance,
  contrastRatio,
  labAsSeen,
  relativeLuminance,
  validateChartColours,
  type ChartColourSet,
} from "./colour-validator";

// The chart colour validator (Shared chart blueprint 13.4a.1, step A5.1a).

test("WCAG luminance and contrast", () => {
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  // #777777 on white is the familiar just-below-AA grey.
  assert.equal(contrastRatio("#777777", "#ffffff").toFixed(2), "4.48");
  assert.throws(() => contrastRatio("#fff", "#000000"), /Not a #rrggbb colour/);
});

test("CIEDE2000 matches the published test data (Sharma, Wu and Dalal, 2005)", () => {
  const pairs: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  ];
  for (const [one, two, expected] of pairs) {
    const lab = (v: [number, number, number]) => ({ l: v[0], a: v[1], b: v[2] });
    assert.equal(ciede2000(lab(one), lab(two)).toFixed(4), expected.toFixed(4), `${one} / ${two}`);
    // The difference is symmetric.
    assert.equal(ciede2000(lab(two), lab(one)).toFixed(4), expected.toFixed(4));
  }
});

test("sRGB white is CIELAB 100, 0, 0 and greys stay grey under every deficiency", () => {
  const white = labAsSeen("#ffffff");
  assert.equal(white.l.toFixed(2), "100.00");
  assert.ok(Math.abs(white.a) < 0.01 && Math.abs(white.b) < 0.01);
  for (const vision of ["protanopia", "deuteranopia", "tritanopia"] as const)
    assert.ok(colourDistance("#808080", "#808080", vision) === 0 && colourDistance("#000000", "#ffffff", vision) > 99);
});

test("the distance thresholds separate known-good from known-bad colour pairs", () => {
  // Red against green: distinct for normal vision, nearly lost under deuteranopia.
  assert.ok(colourDistance("#d62728", "#2ca02c") > CHART_COLOUR_CRITERIA.neighbourDistance);
  assert.ok(colourDistance("#d62728", "#2ca02c", "deuteranopia") < CHART_COLOUR_CRITERIA.neighbourDistanceDeficient);
  // Two near-identical blues fail for everyone.
  assert.ok(colourDistance("#1f77b4", "#2a7fc0") < CHART_COLOUR_CRITERIA.neighbourDistance);
  // Okabe-Ito's neighbours pass for every vision.
  const okabeIto = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#000000"];
  for (const vision of ["normal", "protanopia", "deuteranopia", "tritanopia"] as const)
    for (let index = 0; index + 1 < okabeIto.length; index += 1)
      assert.ok(
        colourDistance(okabeIto[index]!, okabeIto[index + 1]!, vision) >= (vision === "normal" ? CHART_COLOUR_CRITERIA.neighbourDistance : CHART_COLOUR_CRITERIA.neighbourDistanceDeficient),
        `${vision} ${index}`,
      );
});

// A light set that meets every criterion, found by search: every fill
// reaches 3:1 on white, every pair (not only neighbours) is distinct under
// every vision, and every colour stands apart from the theme's own light
// status tones. A test fixture, not a proposed palette.
const passing: ChartColourSet = {
  surface: "#ffffff",
  sequence: ["#4d1a1a", "#cc8066", "#a18a17", "#1a4d3b", "#008f83", "#0070e0", "#002a66", "#0038e0"],
  single: "#234b84",
  neutral: "#94949c",
  grid: "#e4e4e0",
  axis: "#6a6a75",
  tones: { neutral: "#5b6578", success: "#067647", warning: "#b54708", danger: "#b42318" },
  labelInks: ["#ffffff", "#16161a"],
};

test("a set meeting every criterion passes, and the report is deterministic", () => {
  const report = validateChartColours(passing);
  assert.deepEqual(report.findings, []);
  assert.equal(report.pass, true);
  assert.equal(report.fills.length, 8 + 1 + 1 + 4);
  assert.ok(report.axisContrast >= 3 && report.gridContrast < 3);
  assert.deepEqual(report.relieved, []);
  assert.deepEqual(validateChartColours(passing), report);
  // Labels: each fill names the ink that reads best on it; dark fills take
  // white, the light coral takes the dark ink.
  assert.equal(report.fills.find((fill) => fill.element === "sequence 1")!.labelInk, "#ffffff");
  assert.equal(report.fills.find((fill) => fill.element === "sequence 2")!.labelInk, "#16161a");
});

test("each criterion reports its own finding", () => {
  const codes = (set: ChartColourSet) => validateChartColours(set).findings.map((finding) => `${finding.code} ${finding.element}${finding.vision ? ` ${finding.vision}` : ""}`);
  // A pale tone under 3:1 fails: tones identify by meaning, without labels.
  assert.ok(codes({ ...passing, tones: { ...passing.tones, success: "#1baf7a" } }).includes("CHART_FILL_CONTRAST tone success"));
  // Neighbours too close: two blues side by side.
  assert.ok(codes({ ...passing, sequence: ["#35577d", "#3a5c83", ...passing.sequence.slice(2)] }).includes("CHART_NEIGHBOUR_DISTANCE sequence 1 and 2 normal"));
  // Red then green: fine for normal vision, lost under deuteranopia.
  const redGreen = codes({ ...passing, sequence: ["#b02525", "#2f7d32", ...passing.sequence.slice(2)] });
  assert.ok(redGreen.includes("CHART_NEIGHBOUR_DISTANCE sequence 1 and 2 deuteranopia"));
  assert.ok(!redGreen.includes("CHART_NEIGHBOUR_DISTANCE sequence 1 and 2 normal"));
  // A faint axis; a grid that competes with the data; a short sequence.
  assert.deepEqual(codes({ ...passing, axis: "#d0d0d0" }), ["CHART_AXIS_CONTRAST axis"]);
  // A grid at the fill criterion competes with the data.
  assert.deepEqual(codes({ ...passing, grid: "#6a6a75" }), ["CHART_GRID_DOMINATES grid"]);
  assert.ok(codes({ ...passing, sequence: passing.sequence.slice(0, 7) }).includes("CHART_COLOUR_SEQUENCE_LENGTH sequence"));
  // A pale tone fails like any other fill.
  assert.ok(codes({ ...passing, tones: { ...passing.tones, warning: "#fab219" } }).includes("CHART_FILL_CONTRAST tone warning"));
});

test("a pale fill takes dark label ink, or puts its label outside", () => {
  const report = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 0 ? "#9ec5f0" : colour)) });
  const pale = report.fills[0]!;
  assert.equal(pale.labelInk, "#16161a");
  assert.equal(pale.labelInside, true);
  const mid = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 0 ? "#7d7d7d" : colour)) }).fills[0]!;
  // This mid grey reaches 4.5:1 with neither ink, so its label is drawn outside.
  assert.ok(contrastRatio("#7d7d7d", "#ffffff") < 4.5 && contrastRatio("#7d7d7d", "#16161a") < 4.5);
  assert.equal(mid.labelInside, false);
});

test("the relief rule: a pale series fill is relieved, a pale tone is not, and the grid keeps its reference", () => {
  // Amber at 2.2:1 as a sequence colour (in place of the coral, so every
  // pair stays distinct): allowed, reported as relieved.
  const pale = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 1 ? "#eda100" : colour)), neutral: "#b0b0b0" });
  assert.equal(pale.pass, true);
  assert.deepEqual(pale.relieved, ["sequence 2", "neutral"]);
  const amber = pale.fills.find((fill) => fill.element === "sequence 2")!;
  assert.equal(amber.role, "series");
  assert.ok(amber.relieved && amber.contrast < 3);
  // Its marks need direct labels; dark ink reaches 4.5:1 on it, so they sit inside.
  assert.equal(amber.labelInk, "#16161a");
  // The grid is measured against the criterion, not against the relieved
  // 2.2:1 fill, so a visible grid still passes.
  assert.ok(pale.gridContrast > 1.2 && !pale.findings.some((finding) => finding.code === "CHART_GRID_DOMINATES"));
  // The same amber as the warning tone fails: tones always meet 3:1.
  const tone = validateChartColours({ ...passing, tones: { ...passing.tones, warning: "#eda100" } });
  assert.ok(tone.findings.some((finding) => finding.code === "CHART_FILL_CONTRAST" && finding.element === "tone warning"));
  assert.equal(tone.fills.find((fill) => fill.element === "tone warning")!.relieved, false);
});

test("decision 22: a relieved series fill still reaches the 2:1 floor", () => {
  // Okabe-Ito's yellow is 1.32:1 on white: too faint even with a label.
  const faint = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 2 ? "#f0e442" : colour)) });
  const finding = faint.findings.find((item) => item.code === "CHART_RELIEF_FLOOR");
  assert.equal(finding?.element, "sequence 3");
  assert.equal(finding?.required, CHART_COLOUR_CRITERIA.reliefFloor);
  assert.equal(faint.pass, false);
});

test("decision 21: a status tone stands apart from every sequence colour under every vision", () => {
  // A sequence colour equal to the success tone fails for everyone.
  const same = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 4 ? passing.tones.success : colour)) });
  const visions = same.findings.filter((item) => item.code === "CHART_TONE_DISTANCE" && item.element === "tone success and sequence 5").map((item) => item.vision);
  assert.deepEqual(visions, ["normal", "protanopia", "deuteranopia", "tritanopia"]);
  // A colour distinct for normal vision but lost under deuteranopia is caught too.
  const lost = validateChartColours({ ...passing, tones: { ...passing.tones, danger: "#b42318" }, sequence: passing.sequence.map((colour, index) => (index === 3 ? "#3d7a00" : colour)) });
  assert.ok(lost.findings.some((item) => item.code === "CHART_TONE_DISTANCE" && item.vision !== "normal"));
});

test("decision 23: every pair of sequence colours is distinct, not only neighbours", () => {
  // Eight alternating dark and light reds pass a neighbours-only rule, but
  // positions 1 and 3 are nearly the same colour.
  const reds = validateChartColours({ ...passing, sequence: ["#5c2323", "#cd7a7a", "#691616", "#df7368", "#5c2923", "#f4662a", "#691f16", "#c1855c"] });
  assert.ok(reds.findings.some((item) => item.code === "CHART_NEIGHBOUR_DISTANCE" && item.element === "sequence 1 and 3" && item.vision === "normal"));
  // Okabe-Ito's colours pass every pair (its contrast and tones aside).
  const okabeIto = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#000000"];
  const report = validateChartColours({ ...passing, sequence: okabeIto });
  assert.ok(!report.findings.some((item) => item.code === "CHART_NEIGHBOUR_DISTANCE"));
  assert.equal(report.closestPairs.tritanopia.element, "sequence 2 and 4");
  assert.equal(report.closestPairs.normal.distance.toFixed(1), "21.7");
});

test("decision 24: the neutral tone is free of decision 21 but stands apart from Others", () => {
  // A sequence colour equal to the neutral tone is not a tone collision...
  const grey = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 4 ? passing.tones.neutral : colour)) });
  assert.ok(!grey.findings.some((item) => item.code === "CHART_TONE_DISTANCE"));
  // ...but an Others grey next to the neutral tone is (6.0 apart for normal vision).
  const others = validateChartColours({ ...passing, neutral: "#6b6b75" });
  const finding = others.findings.find((item) => item.code === "CHART_NEUTRAL_DISTANCE" && item.vision === "normal");
  assert.equal(finding?.element, "tone neutral and neutral");
  assert.equal(finding?.measured.toFixed(1), "6.0");
  assert.equal(others.pass, false);
});

test("decision 25: status tones against each other are reported without failing the set", () => {
  // The theme's light warning and danger: 4.7 apart under deuteranopia.
  const report = validateChartColours(passing);
  assert.equal(report.pass, true);
  const pair = report.tonePairs.find((item) => item.element === "tone warning and tone danger" && item.vision === "deuteranopia");
  assert.equal(pair?.code, "CHART_TONE_PAIR_DISTANCE");
  assert.equal(pair?.measured.toFixed(1), "4.7");
  assert.ok(!report.tonePairs.some((item) => item.element.includes("neutral")));
  // A warning separated from danger by lightness, not only hue, is distinct
  // under every vision (a dark olive of the same lightness is not).
  const distinct = validateChartColours({ ...passing, tones: { ...passing.tones, warning: "#e0a800" } });
  assert.ok(!distinct.tonePairs.some((item) => item.element === "tone warning and tone danger"));
});
