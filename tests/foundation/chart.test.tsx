import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { parseChartData, type ChartDataV1, type ChartPointState, type ChartSeriesV1 } from "../../packages/contracts/platform/chart/src/index";
import { Chart, type ChartProps } from "../../packages/platform/foundation/ui/src/chart/chart";
import { chartColourConflicts, chartTicks, closeTones, documentChartTheme, keyedSlot } from "../../packages/platform/foundation/ui/src/chart/chart-model";

// The design-system Chart (Shared chart blueprint 13.3, 13.4a, 13.5) on
// synthetic data: labels, withheld points, truncation, keyboard, the data
// table, direction and the theme's series limit.

const v = (value: string) => ({ kind: "value", value });
const stages = parseChartData({
  schemaVersion: 1,
  categories: [{ key: "open", label: "Open" }, { key: "won", label: "Won" }, { key: "lost", label: "Lost" }, { key: "held", label: "On hold" }],
  categoryAxis: { label: "Stage", ordered: false },
  series: [{ key: "count", label: "Records", valueKind: "count", partOfWhole: true, total: v("12"), rest: v("2") }],
  points: [[v("5"), v("3"), v("2"), { kind: "suppressed" }]],
  truncated: { categories: true },
});
const format = (point: string) => `#${point}`;
const stateLabel = (kind: ChartPointState, series: ChartSeriesV1) => `${series.label} ${kind}`;

async function render(props: Partial<ChartProps> & { readonly data: ChartDataV1 }, options: { readonly dir?: string; readonly theme?: string } = {}, run: (h: { container: HTMLElement; window: JSDOM["window"] }) => Promise<void> | void) {
  const dom = new JSDOM(`<html data-theme="${options.theme ?? "light"}" data-theme-family="atlas-modern"><body><div id="root" ${options.dir ? `dir="${options.dir}"` : ""}></div></body></html>`, { url: "https://example.test/" });
  const names = ["window", "document", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT", "React"] as const;
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, MutationObserver: { configurable: true, value: dom.window.MutationObserver }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }, React: { configurable: true, value: React } });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Chart type="column" caption="Records by stage" format={format} stateLabel={stateLabel} {...props} />));
    await run({ container, window: dom.window });
  } finally {
    await act(async () => root.unmount());
    names.forEach((name, index) => (saved[index] ? Object.defineProperty(globalThis, name, saved[index]!) : delete (globalThis as Record<string, unknown>)[name]));
    dom.window.close();
  }
}
const texts = (container: HTMLElement, selector: string) => [...container.querySelectorAll(selector)].map((node) => node.textContent);

test("a column chart labels its values, lists withheld points and notes truncation", async () => {
  await render({ data: stages }, {}, ({ container }) => {
    assert.deepEqual(texts(container, "text.a-chart__label"), ["#5", "#3", "#2"]);
    const points = [...container.querySelectorAll("[data-chart-point]")];
    assert.deepEqual(points.map((point) => point.getAttribute("aria-label")), ["Open, Records: #5, 42%", "Won, Records: #3, 25%", "Lost, Records: #2, 17%"]);
    // The withheld point is not drawn, and is listed in the consumer's words.
    assert.deepEqual(texts(container, ".a-chart__withheld li"), ["On hold: Records suppressed"]);
    assert.deepEqual(texts(container, ".a-chart__notice"), ["Only the first categories are shown."]);
    const svg = container.querySelector("svg")!;
    assert.equal(svg.getAttribute("aria-label"), "Records by stage");
    assert.equal(container.ownerDocument.getElementById(svg.getAttribute("aria-describedby")!)?.textContent, "Column chart: 4 categories, 1 series.");
    // One series takes the single-series colour.
    assert.ok([...container.querySelectorAll(".a-chart__mark")].every((mark) => mark.classList.contains("a-chart__fill--single")));
  });
});

test("percentage labels are the point over the producer's total; none hides labels", async () => {
  await render({ data: stages, dataLabel: "percentage" }, {}, ({ container }) => assert.deepEqual(texts(container, "text.a-chart__label"), ["42%", "25%", "17%"]));
  await render({ data: stages, dataLabel: "none" }, {}, ({ container }) => assert.deepEqual(texts(container, "text.a-chart__label"), []));
});

test("toned marks in tones that are not distinct keep their labels (decision 25)", async () => {
  const toneOf = (key: string) => (({ won: "warning", lost: "danger" }) as const)[key as "won" | "lost"];
  await render({ data: stages, dataLabel: "none", toneOf }, {}, ({ container }) => {
    assert.ok(container.querySelector(".a-chart__fill--tone-warning") && container.querySelector(".a-chart__fill--tone-danger"));
    // Light warning and danger are 4.7 apart under deuteranopia: labelled.
    assert.deepEqual(texts(container, "text.a-chart__label"), ["#3", "#2"]);
  });
});

test("one tab stop; the arrow keys move between points and Enter selects", async () => {
  const selected: string[] = [];
  await render({ data: stages, onSelect: (category, series) => selected.push(`${category}/${series}`) }, {}, async ({ container, window }) => {
    const points = () => [...container.querySelectorAll<SVGGElement>("[data-chart-point]")];
    assert.deepEqual(points().map((point) => point.getAttribute("tabindex")), ["0", "-1", "-1"]);
    points()[0]!.focus();
    const svg = container.querySelector("svg")!;
    await act(async () => { svg.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    assert.ok(window.document.activeElement === points()[1], "focus on points()[1]");
    assert.deepEqual(points().map((point) => point.getAttribute("tabindex")), ["-1", "0", "-1"]);
    await act(async () => { svg.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    await act(async () => { svg.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    assert.deepEqual(selected, ["lost/count"]);
  });
});

test("the data table is a disclosure over the same data, with Others and the total", async () => {
  await render({ data: stages, restLabel: "Others" }, {}, async ({ container, window }) => {
    const button = container.querySelector<HTMLButtonElement>(".a-chart__table button")!;
    assert.equal(button.textContent, "Show data table");
    await act(async () => { button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.equal(button.getAttribute("aria-expanded"), "true");
    const rows = [...container.querySelectorAll(".a-chart__data tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    assert.deepEqual(rows, [["Stage", "Records"], ["Open", "#5"], ["Won", "#3"], ["Lost", "#2"], ["On hold", "Records suppressed"], ["Others", "#2"], ["Total", "#12"]]);
  });
  await render({ data: stages, dataTable: false }, {}, ({ container }) => assert.ok(!container.querySelector(".a-chart__table"), "no data table"));
});

test("an unavailable type shows its reason, never an empty chart", async () => {
  await render({ data: stages, type: "line" }, {}, ({ container }) => {
    assert.ok(!container.querySelector("svg"), "no svg");
    assert.equal(container.querySelector("[role=status]")?.textContent, "A line needs a sequence, such as dates or periods.");
  });
});

test("right to left mirrors a categorical axis but not a time axis (decision 15)", async () => {
  // Marks are in visual order in the document; read each category's position by its name.
  const x = (container: HTMLElement) => ["Open", "Won", "Lost"].map((name) => Number([...container.querySelectorAll("[data-chart-point]")].find((point) => point.getAttribute("aria-label")!.startsWith(`${name},`))!.querySelector("rect")!.getAttribute("x")));
  await render({ data: stages }, { dir: "rtl" }, ({ container }) => {
    const [open, won, lost] = x(container);
    assert.ok(open! > won! && won! > lost!, "first category on the right");
    assert.equal(container.querySelector("figure")?.getAttribute("dir"), "rtl");
  });
  const months = parseChartData({ ...stages, categoryAxis: { label: "Month", ordered: true } });
  await render({ data: months }, { dir: "rtl" }, ({ container }) => {
    const [first, second] = x(container);
    assert.ok(first! < second!, "earliest on the left");
  });
});

test("high contrast carries five series colours (decision 27)", async () => {
  const six = parseChartData({
    schemaVersion: 1,
    categories: [{ key: "q1", label: "Q1" }],
    categoryAxis: { label: "Quarter", ordered: true },
    series: Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, label: `Supplier ${i + 1}`, valueKind: "count", partOfWhole: false })),
    points: Array.from({ length: 6 }, () => [v("1")]),
  });
  await render({ data: six, type: "groupedColumn" }, {}, ({ container }) => assert.equal(container.querySelectorAll(".a-chart__mark").length, 6));
  await render({ data: six, type: "groupedColumn" }, { theme: "high-contrast" }, ({ container }) =>
    assert.equal(container.querySelector("[role=status]")?.textContent, "Choose between 2 and 5 columns to compare."));
});

test("a pie colours categories by key, draws Others in its own grey and lists values in its legend", async () => {
  const shares = parseChartData({ ...stages, points: [[v("5"), v("3"), v("2"), v("0")]] });
  await render({ data: shares, type: "pie", restLabel: "Others", paletteIndexOf: (key) => ({ open: 3, won: 0, lost: 1 })[key] }, {}, ({ container }) => {
    assert.deepEqual([...container.querySelectorAll(".a-chart__slice")].map((slice) => [...slice.classList].find((name) => name.startsWith("a-chart__fill--"))), ["a-chart__fill--4", "a-chart__fill--1", "a-chart__fill--2", "a-chart__fill--neutral"]);
    assert.deepEqual(texts(container, ".a-chart__legend li"), ["Open#5", "Won#3", "Lost#2", "Others#2"]);
  });
});

test("the colour checks: drawn keyed pairs (decision 20), close tones (decision 25), ticks", () => {
  const theme = documentChartTheme(null);
  assert.deepEqual(theme, { family: "atlas-modern", mode: "light" });
  // Two keys whose reference positions wrap onto one colour are caught.
  const drawn = [{ key: "a", slot: keyedSlot("a", 0, 8, undefined, () => 0) }, { key: "i", slot: keyedSlot("i", 1, 8, undefined, () => 8) }, { key: "b", slot: keyedSlot("b", 2, 8) }];
  assert.deepEqual(chartColourConflicts(drawn, theme), [["a", "i"]]);
  assert.deepEqual([...closeTones(["warning", "danger", "success"], theme)].sort(), ["danger", "warning"]);
  assert.deepEqual([...closeTones(["warning", "danger"], { family: "atlas-modern", mode: "high-contrast" })], []);
  assert.deepEqual(chartTicks(0, 12).ticks, [0, 5, 10, 15]);
  assert.deepEqual(chartTicks(-3, 7).ticks, [-4, -2, 0, 2, 4, 6, 8]);
  assert.equal(chartTicks(0, 0.3).decimals, 1);
});
