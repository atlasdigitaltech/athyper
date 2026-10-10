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

// A light set that meets every criterion (a darker categorical sequence, so
// every fill reaches 3:1 on white).
const passing: ChartColourSet = {
  surface: "#ffffff",
  sequence: ["#35577d", "#a65a2d", "#2f7d65", "#8f6d10", "#94476a", "#3a6e36", "#5b4fa0", "#a63f3f"],
  single: "#234b84",
  neutral: "#6b6b75",
  grid: "#e4e4e0",
  axis: "#6a6a75",
  tones: { neutral: "#5c5c67", success: "#126b34", warning: "#8a5200", danger: "#b02525" },
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
  // Labels: on these dark fills white ink reaches 4.5:1, so labels sit inside.
  assert.ok(report.fills.filter((fill) => fill.element.startsWith("sequence")).every((fill) => fill.labelInside && fill.labelInk === "#ffffff"));
});

test("each criterion reports its own finding", () => {
  const codes = (set: ChartColourSet) => validateChartColours(set).findings.map((finding) => `${finding.code} ${finding.element}${finding.vision ? ` ${finding.vision}` : ""}`);
  // A pale tone under 3:1 fails: tones identify by meaning, without labels.
  assert.deepEqual(codes({ ...passing, tones: { ...passing.tones, success: "#1baf7a" } }), ["CHART_FILL_CONTRAST tone success"]);
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
  assert.deepEqual(codes({ ...passing, tones: { ...passing.tones, warning: "#fab219" } }), ["CHART_FILL_CONTRAST tone warning"]);
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
  // Amber at 2.2:1 as a sequence colour: allowed, reported as relieved.
  const pale = validateChartColours({ ...passing, sequence: passing.sequence.map((colour, index) => (index === 3 ? "#eda100" : colour)), neutral: "#b0b0b0" });
  assert.equal(pale.pass, true);
  assert.deepEqual(pale.relieved, ["sequence 4", "neutral"]);
  const amber = pale.fills.find((fill) => fill.element === "sequence 4")!;
  assert.equal(amber.role, "series");
  assert.ok(amber.relieved && amber.contrast < 3);
  // Its marks need direct labels; dark ink reaches 4.5:1 on it, so they sit inside.
  assert.equal(amber.labelInk, "#16161a");
  // The grid is measured against the criterion, not against the relieved
  // 2.2:1 fill, so a visible grid still passes.
  assert.ok(pale.gridContrast > 1.2 && !pale.findings.some((finding) => finding.code === "CHART_GRID_DOMINATES"));
  // The same amber as the warning tone fails: tones always meet 3:1.
  const tone = validateChartColours({ ...passing, tones: { ...passing.tones, warning: "#eda100" } });
  assert.deepEqual(tone.findings.map((finding) => finding.code), ["CHART_FILL_CONTRAST"]);
  assert.equal(tone.fills.find((fill) => fill.element === "tone warning")!.relieved, false);
});
