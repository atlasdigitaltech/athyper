import assert from "node:assert/strict";
import test from "node:test";
import { CHART_MAX_CATEGORIES, chartTypes, parseChartData, type ChartDataV1, type ChartType } from "../../packages/contracts/platform/chart/src/index";

// The chart-data contract (Shared chart blueprint 13.2) and type availability
// (13.3), rule by rule. Synthetic data; nothing here is an Entity.

const v = (value: string) => ({ kind: "value", value });
const base = {
  schemaVersion: 1,
  categories: [{ key: "open", label: "Open" }, { key: "won", label: "Won" }, { key: "lost", label: "Lost" }],
  categoryAxis: { label: "Stage", ordered: false },
  series: [{ key: "count", label: "Records", valueKind: "count", partOfWhole: true, total: v("10") }],
  points: [[v("5"), v("3"), v("2")]],
};
const parse = (patch: Record<string, unknown> = {}) => parseChartData({ ...base, ...patch });
const reason = (data: ChartDataV1, type: ChartType, seriesLimit?: number) => {
  const item = chartTypes(data, seriesLimit ? { seriesLimit } : {}).find((entry) => entry.type === type)!;
  return item.available ? "available" : item.reason;
};

test("a valid payload parses and is frozen", () => {
  const data = parse();
  assert.equal(data.series[0]!.total?.kind, "value");
  assert.ok(Object.isFrozen(data) && Object.isFrozen(data.points[0]));
});

test("the parser enforces bounds, alignment, decimal text, one unit and the part-of-whole rules", () => {
  const rejects = (patch: Record<string, unknown>, pattern: RegExp) => assert.throws(() => parse(patch), pattern);
  rejects({ schemaVersion: 2 }, /schemaVersion must be 1/);
  rejects({ categories: [], points: [[]] }, /chart.categories must hold 1 to 52/);
  rejects({ categories: Array.from({ length: CHART_MAX_CATEGORIES + 1 }, (_, i) => ({ key: `k${i}`, label: `L${i}` })) }, /chart.categories must hold 1 to 52/);
  rejects({ categories: [{ key: "a", label: "A" }, { key: "a", label: "B" }, { key: "c", label: "C" }] }, /distinct keys/);
  rejects({ points: [[v("5"), v("3")]] }, /chart.points\[0\] must hold 3 to 3/);
  rejects({ points: [] }, /chart.points must hold 1 to 1/);
  rejects({ points: [[v("5"), v("3"), v("1e3")]] }, /value must be exact decimal text/);
  rejects({ points: [[v("5"), v("3"), { kind: "zero" }]] }, /is not a chart point kind/);
  rejects({ series: [{ ...base.series[0], total: undefined }] }, /total is required for a part-of-whole series/);
  rejects({ series: [{ key: "avg", label: "Average", valueKind: "decimal", partOfWhole: false, rest: v("1") }] }, /rest is only for a part-of-whole series/);
  rejects({ series: [{ ...base.series[0], unit: "MYR" }, { key: "b", label: "B", valueKind: "money", unit: "EUR", partOfWhole: false }], points: [[v("1"), v("1"), v("1")], [v("1"), v("1"), v("1")]] }, /must share one unit/);
  rejects({ series: Array.from({ length: 9 }, (_, i) => ({ key: `s${i}`, label: `S${i}`, valueKind: "count", partOfWhole: false })), points: Array.from({ length: 9 }, () => [v("1"), v("1"), v("1")]) }, /chart.series must hold 1 to 8/);
  rejects({ truncated: { categories: false } }, /must be true when given/);
  rejects({ colour: "red" }, /chart.colour is not a chart property/);
  rejects({ categories: [{ key: "a", label: " " }, ...base.categories.slice(1)] }, /label must be readable text/);
  // Withheld points carry no value.
  assert.throws(() => parse({ points: [[{ kind: "suppressed", value: "1" }, v("3"), v("2")]] }), /is only for a value point/);
});

test("type availability follows the 13.3 table", () => {
  const data = parse();
  assert.deepEqual(chartTypes(data).map((item) => [item.type, item.available ? "available" : item.reason]), [
    ["column", "available"], ["bar", "available"], ["line", "CHART_UNORDERED"], ["groupedColumn", "CHART_SERIES_COUNT"], ["stackedColumn", "CHART_SERIES_COUNT"], ["pie", "available"], ["donut", "available"],
  ]);
  const empty = parse({ points: [[{ kind: "empty" }, { kind: "empty" }, { kind: "empty" }]] });
  assert.equal(reason(empty, "column"), "CHART_NO_VALUES");
  assert.equal(reason(parse({ categoryAxis: { label: "Month", ordered: true } }), "line"), "available");
  const average = parse({ series: [{ key: "avg", label: "Average", valueKind: "decimal", partOfWhole: false }] });
  assert.equal(reason(average, "pie"), "CHART_NOT_PART_OF_WHOLE");
  assert.equal(reason(parse({ series: [{ ...base.series[0], partOfWhole: false, total: undefined, valueKind: "decimal" }], points: [[v("5"), v("-3"), v("2")]] }), "column"), "available");
  assert.equal(reason(parse({ points: [[v("5"), v("-3"), v("2")]] }), "pie"), "CHART_NEGATIVE");
  assert.equal(reason(parse({ points: [[v("5"), { kind: "suppressed" }, v("2")]] }), "pie"), "CHART_WITHHELD");
  assert.equal(reason(parse({ points: [[v("5"), { kind: "suppressed" }, v("2")]] }), "column"), "available");
  assert.equal(reason(parse({ truncated: { categories: true } }), "pie"), "CHART_TRUNCATED");
  assert.equal(reason(parse({ truncated: { categories: true }, series: [{ ...base.series[0], total: v("12"), rest: v("2") }] }), "pie"), "available");
  const seven = parse({
    categories: Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, label: `L${i}` })),
    points: [Array.from({ length: 7 }, () => v("1"))],
    series: [{ ...base.series[0], total: v("7") }],
  });
  assert.equal(reason(seven, "pie"), "CHART_TOO_MANY_SLICES");
  // Six slices including "Others" is the limit.
  const five = parse({ categories: seven.categories.slice(0, 5), points: [Array.from({ length: 5 }, () => v("1"))], series: [{ ...base.series[0], total: v("6"), rest: v("1") }], truncated: { categories: true } });
  assert.equal(reason(five, "pie"), "available");
});

test("several series: grouped and stacked columns, within the theme's series limit", () => {
  const series = (n: number, extra: Record<string, unknown> = {}) => ({
    series: Array.from({ length: n }, (_, i) => ({ key: `s${i}`, label: `S${i}`, valueKind: "count", partOfWhole: true, total: v("3"), ...extra })),
    points: Array.from({ length: n }, () => [v("1"), v("1"), v("1")]),
  });
  const six = parse(series(6));
  assert.equal(reason(six, "groupedColumn"), "available");
  assert.equal(reason(six, "stackedColumn"), "available");
  assert.equal(reason(six, "column"), "CHART_SERIES_COUNT");
  assert.equal(reason(six, "pie"), "CHART_SERIES_COUNT");
  // High contrast carries five colours (decision 27).
  const limited = chartTypes(six, { seriesLimit: 5 }).find((item) => item.type === "groupedColumn")!;
  assert.deepEqual(limited.available ? null : [limited.reason, limited.seriesLimit], ["CHART_SERIES_COUNT", 5]);
  const averages = parse(series(2, { partOfWhole: false, total: undefined, valueKind: "decimal" }));
  assert.equal(reason(averages, "groupedColumn"), "available");
  assert.equal(reason(averages, "stackedColumn"), "CHART_NOT_PART_OF_WHOLE");
});
