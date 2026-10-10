import { CHART_MAX_SERIES, parseChartData, type ChartDataV1, type ChartPointV1, type ChartSeriesV1, type ChartTone } from "@athyper/contract-platform-chart";
import { resolveEntityStatusTone } from "@athyper/contract-platform-entity-runtime";
import { addDecimals, compareDecimals, type JsonValue, type ListAggregateMeasureV1, type ListFieldDescriptorV1, type ListFilterV1, type ListGroupTotalsV1 } from "@athyper/contract-platform-entity-list";
import { publishedOrder, summaryCell, type SummaryColumnValue, type SummaryLevel, type SummaryRow } from "./aggregate-model";

// Summary's chart adapter (Entity list Aggregate blueprint 13.6; Chart
// blueprint 13.2 and 13.5): the opening response the grid already holds,
// turned into chart data. It sends no request and computes no total; the only
// arithmetic is "Others", the server's total minus the given points, exactly.

export interface SummaryChart {
  readonly data: ChartDataV1;
  /** A point's drill-down filters: its row's, and its column's for a column series. */
  readonly filtersOf: (category: string, series: string) => readonly ListFilterV1[] | undefined;
  /** Colour by meaning (Chart decision 17): a declared status tone, own key only. */
  readonly toneOf: (key: string) => ChartTone | undefined;
  /** A choice or boolean value's position in its published order (13.4a.3). */
  readonly paletteIndexOf: (key: string) => number | undefined;
}

export interface SummaryChartInput {
  readonly level: SummaryLevel;
  readonly levelLabel: string;
  readonly rows: readonly SummaryRow[];
  readonly rowLabel: (row: SummaryRow) => string;
  /** The server's parent total; with columns, its cells are the column totals. */
  readonly parent?: ListGroupTotalsV1;
  /** More groups exist than the response gives. */
  readonly truncated: boolean;
  readonly measure: ListAggregateMeasureV1;
  readonly measureLabel: string;
  readonly columns?: readonly SummaryColumnValue[];
  readonly columnLevel?: SummaryLevel;
  readonly columnLabel?: (column: SummaryColumnValue) => string;
  readonly columnsTruncated?: boolean;
}

type Point = ChartPointV1 & { readonly currency?: string };

function point(totals: Omit<ListGroupTotalsV1, "cells"> | null | undefined, measure: ListAggregateMeasureV1): Point {
  if (!totals) return { kind: "empty" };
  const cell = summaryCell(totals as ListGroupTotalsV1, measure);
  if (cell.kind !== "value") return { kind: cell.kind };
  return { kind: "value", value: addDecimals([cell.value]), ...(cell.currency ? { currency: cell.currency } : {}) };
}

const readable = (text: string) => (text.length > 200 ? `${text.slice(0, 199)}…` : text);

/** A status tone the field declares for this value as its own key. */
function declaredTone(field: ListFieldDescriptorV1 | undefined, value: JsonValue): ChartTone | undefined {
  if (!field?.statusTones || typeof value !== "string" || !Object.hasOwn(field.statusTones, value)) return undefined;
  return resolveEntityStatusTone(value, field.statusTones);
}

function orderIndex(field: ListFieldDescriptorV1 | undefined, unit: SummaryLevel["unit"], value: JsonValue): number | undefined {
  if (!field || unit) return undefined;
  const index = publishedOrder(field)?.findIndex((item) => JSON.stringify(item) === JSON.stringify(value)) ?? -1;
  return index < 0 ? undefined : index;
}

export function summaryChartData(input: SummaryChartInput): SummaryChart {
  const { measure, rows } = input;
  const columns = input.columns?.slice(0, CHART_MAX_SERIES);
  const plain = ({ currency: _currency, ...rest }: Point): ChartPointV1 => rest as ChartPointV1;
  // Points per series: one series for the measure, or one per column.
  const raw: { key: string; label: string; points: Point[]; total: Point | undefined }[] = columns
    ? columns.map((column, index) => ({
        key: `column:${column.key}`,
        label: readable(input.columnLabel!(column)),
        points: rows.map((row) => point(row.totals.cells?.[index], measure)),
        total: input.parent ? point(input.parent.cells?.[index], measure) : undefined,
      }))
    : [{ key: `measure:${measure.key}`, label: readable(input.measureLabel), points: rows.map((row) => point(row.totals, measure)), total: input.parent ? point(input.parent, measure) : undefined }];
  // One unit per chart: values in more than one currency are not charted together.
  const currencies = new Set(raw.flatMap((series) => [...series.points, ...(series.total ? [series.total] : [])]).flatMap((item) => (item.kind === "value" && item.currency ? [item.currency] : [])));
  const mixed = currencies.size > 1;
  const settle = (item: Point): ChartPointV1 => (mixed && item.kind === "value" ? { kind: "mixedCurrency" } : plain(item));
  // Parts of one whole: the record count, or an additive sum in one currency
  // (a semi-additive balance is not), with the server's total to divide by.
  const additive = measure.aggregate === "count" || (measure.aggregate === "sum" && !measure.timeFields?.length);
  const series: ChartSeriesV1[] = raw.map((item) => {
    const points = item.points.map(settle);
    const total = item.total ? settle(item.total) : undefined;
    const partOfWhole = additive && !mixed && total !== undefined;
    // "Others" (Chart 13.5): exact only for a part-of-whole series whose given
    // points are all values (or empty) and whose total is a value.
    let rest: ChartPointV1 | undefined;
    if (partOfWhole && input.truncated && total.kind === "value" && points.every((entry) => entry.kind === "value" || entry.kind === "empty")) {
      const remainder = addDecimals([total.value, ...points.flatMap((entry) => (entry.kind === "value" ? [negate(entry.value)] : []))]);
      if (compareDecimals(remainder, 0) >= 0) rest = { kind: "value", value: remainder };
    }
    return {
      key: item.key,
      label: item.label,
      valueKind: measure.aggregate === "count" ? "count" : measure.aggregate === "countDistinct" ? "integer" : measure.valueKind === "money" ? "money" : "decimal",
      ...(currencies.size === 1 ? { unit: [...currencies][0]! } : {}),
      partOfWhole,
      ...(partOfWhole ? { total } : {}),
      ...(rest ? { rest } : {}),
    };
  });
  const truncated = { ...(input.truncated ? { categories: true as const } : {}), ...(input.columnsTruncated || (input.columns && input.columns.length > CHART_MAX_SERIES) ? { series: true as const } : {}) };
  const data = parseChartData({
    schemaVersion: 1,
    // Keys are positions, as the grid's rows are: no record identity reaches the page.
    categories: rows.map((row, index) => ({ key: `row:${index}`, label: readable(input.rowLabel(row)) })),
    categoryAxis: { label: readable(input.levelLabel), ordered: Boolean(input.level.unit) },
    series,
    points: series.map((_, index) => raw[index]!.points.map(settle)),
    ...(Object.keys(truncated).length ? { truncated } : {}),
  });
  const rowByKey = new Map(rows.map((row, index) => [`row:${index}`, row]));
  const columnByKey = new Map((columns ?? []).map((column) => [`column:${column.key}`, column]));
  return {
    data,
    filtersOf: (category, key) => {
      const row = rowByKey.get(category);
      if (!row) return undefined;
      const column = columnByKey.get(key);
      return column ? [...row.filters, ...column.filters] : row.filters;
    },
    toneOf: (key) => {
      const row = rowByKey.get(key);
      if (row) return row.kind === "value" && !input.level.unit ? declaredTone(input.level.field, row.value) : undefined;
      const column = columnByKey.get(key);
      return column?.kind === "value" && !input.columnLevel?.unit ? declaredTone(input.columnLevel?.field, column.value) : undefined;
    },
    paletteIndexOf: (key) => {
      const row = rowByKey.get(key);
      if (row) return row.kind === "value" ? orderIndex(input.level.field, input.level.unit, row.value) : undefined;
      const column = columnByKey.get(key);
      return column?.kind === "value" ? orderIndex(input.columnLevel?.field, input.columnLevel?.unit, column.value) : undefined;
    },
  };
}

function negate(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}
