// The platform chart-data contract (Shared chart blueprint, docs/blueprints/chart,
// sections 13.2 and 13.3): pure data, no fetching and no Entity types. Every
// surface that draws a chart gives the design-system Chart this shape; its
// producer states the totals, the order and what the values mean.

/** At most this many categories in one chart. */
export const CHART_MAX_CATEGORIES = 52;
/** At most this many series in one chart; high contrast draws fewer (decision 27). */
export const CHART_MAX_SERIES = 8;
/** A pie or donut has at most this many slices, "Others" included. */
export const CHART_MAX_SLICES = 6;

export interface ChartDataV1 {
  readonly schemaVersion: 1;
  /** The categories in the order the producer gives them; the chart never sorts. */
  readonly categories: readonly { readonly key: string; readonly label: string }[];
  readonly categoryAxis: {
    readonly label: string;
    /** The categories form a sequence (dates, periods), so a line is meaningful.
     * Set by the producer from its own ordering, never inferred by the chart. */
    readonly ordered: boolean;
  };
  /** One series per measure-and-column the producer charts; all share one unit. */
  readonly series: readonly ChartSeriesV1[];
  /** [series][category], aligned with `series` and `categories`. */
  readonly points: readonly (readonly ChartPointV1[])[];
  /** More categories, or more series, exist than are given. */
  readonly truncated?: { readonly categories?: true; readonly series?: true };
}

export type ChartValueKind = "count" | "integer" | "decimal" | "money";

export interface ChartSeriesV1 {
  readonly key: string;
  readonly label: string;
  readonly valueKind: ChartValueKind;
  /** A currency or unit code shown with every value; one per chart. */
  readonly unit?: string;
  /** The series' values are parts of one whole: a count, or an additive sum in
   * one unit, all non-negative. Only then are shares, stacking, pies and an
   * "Others" slice meaningful. Set by the producer. */
  readonly partOfWhole: boolean;
  /** The server's total for the series, over every category including any not
   * given; the denominator of a share. Required for a part-of-whole series. */
  readonly total?: ChartPointV1;
  /** "Others": the categories not given, as one point. Only for a part-of-whole
   * series, and only when the producer can state it exactly (13.5). */
  readonly rest?: ChartPointV1;
}

/** Why a point carries no value. Each is shown as text in the consumer's words. */
export type ChartPointState = "notSummable" | "suppressed" | "mixedCurrency" | "unknownCurrency" | "empty";

export type ChartPointV1 =
  | { readonly kind: "value"; readonly value: string } // an exact decimal, as text
  | { readonly kind: ChartPointState };

export const CHART_VALUE_KINDS: readonly ChartValueKind[] = Object.freeze(["count", "integer", "decimal", "money"]);
export const CHART_POINT_STATES: readonly ChartPointState[] = Object.freeze(["notSummable", "suppressed", "mixedCurrency", "unknownCurrency", "empty"]);

/** A status tone, for colour by meaning (decision 17). The data carries no
 * tone; a consumer passes `toneOf(key)` to the component, decided from
 * published metadata. */
export type ChartTone = "neutral" | "success" | "warning" | "danger";

export type ChartType = "column" | "bar" | "line" | "groupedColumn" | "stackedColumn" | "pie" | "donut";
export const CHART_TYPES: readonly ChartType[] = Object.freeze(["column", "bar", "line", "groupedColumn", "stackedColumn", "pie", "donut"]);

/** Why a chart type is unavailable for some data (13.3). Messages are
 * `chart.unavailable.<code>` in the platform catalogs. */
export type ChartUnavailableCode =
  | "CHART_NO_VALUES"
  | "CHART_UNORDERED"
  | "CHART_SERIES_COUNT"
  | "CHART_NOT_PART_OF_WHOLE"
  | "CHART_NEGATIVE"
  | "CHART_WITHHELD"
  | "CHART_TOO_MANY_SLICES"
  | "CHART_TRUNCATED";

export type ChartTypeAvailability =
  | { readonly type: ChartType; readonly available: true }
  /** `seriesLimit` is the most series the type takes here, for the message. */
  | { readonly type: ChartType; readonly available: false; readonly reason: ChartUnavailableCode; readonly seriesLimit: number };

const DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** A point's value as a number, for geometry only; shown text stays exact. */
export function chartNumber(point: ChartPointV1 | undefined): number | undefined {
  return point?.kind === "value" ? Number(point.value) : undefined;
}

function fail(path: string, reason: string): never {
  throw new TypeError(`${path} ${reason}`);
}
function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "is not a chart property");
  return value as Record<string, unknown>;
}
function list(value: unknown, path: string, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length < min || value.length > max) fail(path, `must hold ${min} to ${max} entries`);
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) fail(path, "must be readable text");
  return value;
}
function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function parsePoint(raw: unknown, path: string): ChartPointV1 {
  const value = record(raw, path, ["kind", "value"]);
  if (value.kind === "value") {
    if (typeof value.value !== "string" || !DECIMAL.test(value.value)) fail(`${path}.value`, "must be exact decimal text");
    return Object.freeze({ kind: "value", value: value.value });
  }
  if (!(CHART_POINT_STATES as readonly unknown[]).includes(value.kind)) fail(`${path}.kind`, "is not a chart point kind");
  if ("value" in value) fail(`${path}.value`, "is only for a value point");
  return Object.freeze({ kind: value.kind as ChartPointState });
}

function parseSeries(raw: unknown, path: string): ChartSeriesV1 {
  const value = record(raw, path, ["key", "label", "valueKind", "unit", "partOfWhole", "total", "rest"]);
  if (!(CHART_VALUE_KINDS as readonly unknown[]).includes(value.valueKind)) fail(`${path}.valueKind`, "is not a chart value kind");
  const partOfWhole = flag(value.partOfWhole, `${path}.partOfWhole`);
  if (partOfWhole && value.total === undefined) fail(`${path}.total`, "is required for a part-of-whole series");
  if (!partOfWhole && value.rest !== undefined) fail(`${path}.rest`, "is only for a part-of-whole series");
  return Object.freeze({
    key: text(value.key, `${path}.key`),
    label: text(value.label, `${path}.label`),
    valueKind: value.valueKind as ChartValueKind,
    ...(value.unit !== undefined ? { unit: text(value.unit, `${path}.unit`) } : {}),
    partOfWhole,
    ...(value.total !== undefined ? { total: parsePoint(value.total, `${path}.total`) } : {}),
    ...(value.rest !== undefined ? { rest: parsePoint(value.rest, `${path}.rest`) } : {}),
  });
}

/** Validates a chart payload (13.2): bounds, alignment, decimal text, one unit
 * and the part-of-whole rules. Throws a TypeError naming the path. */
export function parseChartData(raw: unknown): ChartDataV1 {
  const value = record(raw, "chart", ["schemaVersion", "categories", "categoryAxis", "series", "points", "truncated"]);
  if (value.schemaVersion !== 1) fail("chart.schemaVersion", "must be 1");
  const categories = list(value.categories, "chart.categories", 1, CHART_MAX_CATEGORIES).map((item, index) => {
    const category = record(item, `chart.categories[${index}]`, ["key", "label"]);
    return Object.freeze({ key: text(category.key, `chart.categories[${index}].key`), label: text(category.label, `chart.categories[${index}].label`) });
  });
  if (new Set(categories.map((item) => item.key)).size !== categories.length) fail("chart.categories", "must have distinct keys");
  const axis = record(value.categoryAxis, "chart.categoryAxis", ["label", "ordered"]);
  const series = list(value.series, "chart.series", 1, CHART_MAX_SERIES).map((item, index) => parseSeries(item, `chart.series[${index}]`));
  if (new Set(series.map((item) => item.key)).size !== series.length) fail("chart.series", "must have distinct keys");
  if (new Set(series.map((item) => item.unit ?? "")).size > 1) fail("chart.series", "must share one unit");
  const points = list(value.points, "chart.points", series.length, series.length).map((row, index) =>
    Object.freeze(list(row, `chart.points[${index}]`, categories.length, categories.length).map((point, at) => parsePoint(point, `chart.points[${index}][${at}]`))),
  );
  let truncated: ChartDataV1["truncated"];
  if (value.truncated !== undefined) {
    const marks = record(value.truncated, "chart.truncated", ["categories", "series"]);
    for (const key of ["categories", "series"] as const) if (marks[key] !== undefined && marks[key] !== true) fail(`chart.truncated.${key}`, "must be true when given");
    truncated = Object.freeze({ ...(marks.categories ? { categories: true as const } : {}), ...(marks.series ? { series: true as const } : {}) });
  }
  return Object.freeze({
    schemaVersion: 1,
    categories: Object.freeze(categories),
    categoryAxis: Object.freeze({ label: text(axis.label, "chart.categoryAxis.label"), ordered: flag(axis.ordered, "chart.categoryAxis.ordered") }),
    series: Object.freeze(series),
    points: Object.freeze(points),
    ...(truncated ? { truncated } : {}),
  });
}

const withheld = (point: ChartPointV1) => point.kind !== "value" && point.kind !== "empty";

/** Which chart types the data allows, each with its reason when not (13.3).
 * `seriesLimit` is the most series the theme can colour apart: 8, or 5 under
 * high contrast (decision 27). */
export function chartTypes(data: ChartDataV1, options: { readonly seriesLimit?: number } = {}): readonly ChartTypeAvailability[] {
  const limit = Math.min(options.seriesLimit ?? CHART_MAX_SERIES, CHART_MAX_SERIES);
  const values = data.points.flat().filter((point) => point.kind === "value");
  const unavailable = (type: ChartType, reason: ChartUnavailableCode, seriesLimit: number): ChartTypeAvailability => Object.freeze({ type, available: false, reason, seriesLimit });
  const available = (type: ChartType): ChartTypeAvailability => Object.freeze({ type, available: true });
  const negative = values.some((point) => Number(point.value) < 0);
  const one = data.series.length === 1;
  const several = data.series.length >= 2 && data.series.length <= limit;
  return Object.freeze(
    CHART_TYPES.map((type) => {
      switch (type) {
        case "column":
        case "bar":
          if (!one) return unavailable(type, "CHART_SERIES_COUNT", 1);
          return values.length ? available(type) : unavailable(type, "CHART_NO_VALUES", 1);
        case "line":
          if (!data.categoryAxis.ordered) return unavailable(type, "CHART_UNORDERED", 1);
          if (!one) return unavailable(type, "CHART_SERIES_COUNT", 1);
          return values.length ? available(type) : unavailable(type, "CHART_NO_VALUES", 1);
        case "groupedColumn":
          if (!several) return unavailable(type, "CHART_SERIES_COUNT", limit);
          return values.length ? available(type) : unavailable(type, "CHART_NO_VALUES", limit);
        case "stackedColumn":
          if (!several) return unavailable(type, "CHART_SERIES_COUNT", limit);
          if (!data.series.every((series) => series.partOfWhole)) return unavailable(type, "CHART_NOT_PART_OF_WHOLE", limit);
          if (negative) return unavailable(type, "CHART_NEGATIVE", limit);
          return values.length ? available(type) : unavailable(type, "CHART_NO_VALUES", limit);
        case "pie":
        case "donut": {
          if (!one) return unavailable(type, "CHART_SERIES_COUNT", 1);
          const series = data.series[0]!;
          if (!series.partOfWhole) return unavailable(type, "CHART_NOT_PART_OF_WHOLE", 1);
          if (!values.length) return unavailable(type, "CHART_NO_VALUES", 1);
          if (negative || (chartNumber(series.rest) ?? 0) < 0) return unavailable(type, "CHART_NEGATIVE", 1);
          if (data.points[0]!.some(withheld) || series.total?.kind !== "value" || (series.rest && series.rest.kind !== "value")) return unavailable(type, "CHART_WITHHELD", 1);
          if (data.truncated?.categories && series.rest?.kind !== "value") return unavailable(type, "CHART_TRUNCATED", 1);
          const slices = values.filter((point) => Number(point.value) > 0).length + ((chartNumber(series.rest) ?? 0) > 0 ? 1 : 0);
          if (slices > CHART_MAX_SLICES) return unavailable(type, "CHART_TOO_MANY_SLICES", 1);
          return available(type);
        }
      }
    }),
  );
}
