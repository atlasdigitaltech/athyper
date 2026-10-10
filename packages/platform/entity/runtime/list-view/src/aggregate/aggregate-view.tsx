"use client";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { entityListOperation, entityListQuery, type HttpClient } from "@athyper/platform-api-client";
import {
  LIST_AGGREGATE_ORDER_LIMITS,
  LIST_AGGREGATE_REQUEST_MEASURES,
  LIST_GROUP_LIMIT,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type EntityListScopeCoordinateV1,
  type JsonValue,
  type ListAggregateChartLabel,
  type ListAggregateMeasureV1,
  type ListAggregateOrderStateV1,
  type ListAggregateStateV1,
  type ListAggregateV1,
  type ListFieldDescriptorV1,
  type ListFilterV1,
  type ListGroupTotalsV1,
  type ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { CHART_TYPES, chartTypes, type ChartPointState, type ChartType } from "@athyper/contract-platform-chart";
import { Button, Chart, Checkbox, ChoiceSelect, Label, SegmentedControl, useChartSeriesLimit } from "@athyper/platform-ui";
import { formatFieldValue } from "../field-format";
import type { ListWidthTier } from "../presentation-tier";
import { handleTreeKeyDown } from "../tree/tree-keyboard";
import { TreeIndent, TreeToggle } from "../tree/tree-parts";
import {
  choiceLabel,
  columnOptions,
  levelOptions,
  orderRefusal,
  sameTotals,
  summaryCell,
  summaryColumn,
  summaryColumns,
  summaryLevels,
  summaryMeasures,
  summaryQuery,
  summaryRows,
  summaryState,
  type SummaryColumnValue,
  type SummaryLevel,
  type SummaryRow,
} from "./aggregate-model";
import { summaryChartData } from "./aggregate-chart";

// The Aggregate Layout, shown as Summary (Entity list Aggregate blueprint
// sections 7, 11 and 12): grouped rows at up to three levels, the declared
// measures in each cell, the total first. Opening sends one request and each
// expansion one more; every number comes from the server, every state that
// is not a number is text, and a cell drills down to its records in Table.

type EntityIntl = ReturnType<typeof useEntityI18n>;

export interface EntityAggregateProps {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly aggregate: ListAggregateV1;
  readonly state: ListLocationStateV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly widthTier?: ListWidthTier;
  readonly refreshKey: string;
  readonly timeZone?: string;
  readonly onAggregateChange: (change: Pick<ListLocationStateV1, "aggregate">) => void;
  /** Opens Table with these filters added: exactly the records a cell counted. */
  readonly onDrillDown: (filters: readonly ListFilterV1[]) => void;
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly rows: readonly SummaryRow[];
      readonly parent?: ListGroupTotalsV1;
      readonly truncated: boolean;
      /** With a column dimension (A2): the columns every row's cells align with. */
      readonly columns?: readonly SummaryColumnValue[];
      readonly columnsTruncated?: boolean;
      /** Top / Bottom N (A6): the server's ranked count and notes. */
      readonly ranking?: { readonly groupCount: number; readonly groupsUnranked: number; readonly tieAtCut: boolean };
    };

/** One level's groups under a parent: one request (section 7.1). */
function useLevel(input: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly level: SummaryLevel | undefined;
  readonly filters: readonly ListFilterV1[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly timeZone?: string;
  readonly identity: string;
  readonly count: () => void;
  /** The column dimension (A2); an expansion keeps the opening's columns. */
  readonly column?: SummaryLevel;
  readonly columnValues?: readonly JsonValue[];
  /** Top / Bottom N (A6): level 1 only. */
  readonly order?: ListAggregateOrderStateV1;
}): Loaded {
  const [loaded, setLoaded] = useState<{ readonly key: string; readonly value: Loaded }>({ key: "", value: { status: "loading" } });
  const latest = useRef(input);
  latest.current = input;
  const key = input.level ? JSON.stringify([input.identity, input.level.entry, input.filters, input.measures.map((item) => item.key), input.column?.entry ?? null, input.columnValues ?? null, input.order ?? null]) : "";
  useEffect(() => {
    const { client, descriptor, state, scope, level, filters, measures, timeZone, column, columnValues, order } = latest.current;
    if (!key || !level) return;
    const controller = new AbortController();
    latest.current.count();
    client
      .request(entityListOperation, {
        params: { entityCode: descriptor.entity.code },
        query: entityListQuery(
          summaryQuery({ state, level, filters, measures, identityField: descriptor.entity.identityField, ...(timeZone ? { timeZone } : {}), ...(column ? { column } : {}), ...(column && columnValues ? { columnValues } : {}), ...(order ? { order } : {}) }),
          descriptor,
          scope,
        ),
        signal: controller.signal,
      })
      .then((page: EntityListResultV1) => {
        if (controller.signal.aborted) return;
        if (page.descriptorHash !== descriptor.revision.descriptorHash || page.scopeFingerprint !== descriptor.scope.fingerprint)
          throw new TypeError("Summary response authority no longer matches its descriptor");
        setLoaded({
          key,
          value: {
            status: "ready",
            rows: summaryRows(page.groups ?? [], level, timeZone, Boolean(page.groupOrder)),
            ...(page.groupOrder && page.groupCount !== undefined
              ? { ranking: { groupCount: page.groupCount, groupsUnranked: page.groupsUnranked ?? 0, tieAtCut: page.groupOrderTieAtCut === true } }
              : {}),
            ...(page.parentGroup ? { parent: page.parentGroup } : {}),
            truncated: page.groupsTruncated === true,
            ...(column && page.pivotColumns ? { columns: summaryColumns(page.pivotColumns, column, timeZone) } : {}),
            ...(page.pivotColumnsTruncated ? { columnsTruncated: true } : {}),
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, value: { status: "failed" } });
      });
    return () => controller.abort();
  }, [key]);
  return loaded.key === key ? loaded.value : { status: "loading" };
}

function bucketLabel(value: unknown, unit: SummaryLevel["unit"], intl: EntityIntl): string | undefined {
  if (!unit || typeof value !== "string") return undefined;
  const quarter = /^(\d{4})-Q([1-4])$/.exec(value);
  if (quarter) return intl.message("list.gantt.quarterTitle", { quarter: Number(quarter[2]), year: quarter[1]! });
  if (/^\d{4}-\d{2}$/.test(value)) return intl.date(`${value}-01T00:00:00Z`, { month: "long", year: "numeric", timeZone: "UTC" });
  return undefined;
}

function rowLabel(row: Pick<SummaryRow, "kind" | "value" | "label">, level: SummaryLevel, intl: EntityIntl): string {
  if (row.kind === "none") return intl.message("list.board.noValue");
  return bucketLabel(row.value, level.unit, intl) ?? choiceLabel(level.field, row.value, row.label);
}

function levelName(level: SummaryLevel, intl: EntityIntl): string {
  return level.unit
    ? intl.message(level.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: level.dimension.label })
    : level.dimension.label;
}

export function measureLabel(measure: ListAggregateMeasureV1, intl: EntityIntl): string {
  if (measure.aggregate === "count") return intl.message("list.aggregate.measure.count");
  if (measure.aggregate === "countDistinct") return intl.message("list.aggregate.measure.countDistinct", { field: measure.label ?? "" });
  return intl.message(`list.group.aggregate.${measure.aggregate}`, { field: measure.label ?? "" });
}

/** A measure's value as the grid shows it; the chart uses the same text. */
function valueText(value: number | string, measure: ListAggregateMeasureV1, intl: EntityIntl, currency?: string): string {
  if (measure.aggregate === "count" || measure.aggregate === "countDistinct") return intl.number(Number(value));
  const field = { key: measure.field ?? measure.key, label: measure.label ?? "", valueKind: measure.valueKind ?? "decimal" } as ListFieldDescriptorV1;
  return [formatFieldValue(value, field, intl), currency].filter(Boolean).join(" ");
}

/** Why a cell has no value, in the Summary's own words; the chart's withheld
 * points use the same messages. */
function stateText(kind: Exclude<ChartPointState, "empty">, measure: ListAggregateMeasureV1, intl: EntityIntl): string {
  switch (kind) {
    case "notSummable":
      return intl.message("list.aggregate.notSummable", { fields: (measure.timeFields ?? []).map((item) => item.label).join(", ") });
    case "suppressed":
      return intl.message("list.aggregate.suppressed");
    case "mixedCurrency":
      return intl.message("list.group.mixedCurrencies");
    case "unknownCurrency":
      return intl.message("list.group.unknownCurrency");
  }
}

function cellText(totals: ListGroupTotalsV1, measure: ListAggregateMeasureV1, intl: EntityIntl): string {
  const cell = summaryCell(totals, measure);
  if (cell.kind === "value") return valueText(cell.value, measure, intl, cell.currency);
  return cell.kind === "empty" ? "—" : stateText(cell.kind, measure, intl);
}

/** The chart types Summary prefers, in order, when the viewer has not chosen one. */
const CHART_PREFERENCE: readonly ChartType[] = ["column", "groupedColumn", "line", "bar", "stackedColumn", "pie", "donut"];
/** Below this many categories a column chart fits a narrow screen; above it, bars. */
const NARROW_COLUMNS = 6;

export function EntityAggregate(props: EntityAggregateProps) {
  const intl = useEntityI18n();
  const { aggregate, descriptor, state } = props;
  const summary: ListAggregateStateV1 = summaryState(state, aggregate);
  const levels = useMemo(() => summaryLevels(aggregate, descriptor, summary.rows), [aggregate, descriptor, summary.rows]);
  const measures = useMemo(() => summaryMeasures(aggregate, summary.measures), [aggregate, summary.measures]);
  const column = useMemo(() => summaryColumn(aggregate, descriptor, summary.column), [aggregate, descriptor, summary.column]);
  const [attempt, setAttempt] = useState(0);
  const [changed, setChanged] = useState(false);
  const requests = useRef(0);
  const count = () => {
    requests.current += 1;
  };
  // Everything a level's numbers depend on; a change starts again collapsed.
  const identity = JSON.stringify([props.refreshKey, attempt, state.filters, state.query ?? null, state.standardViewKey ?? null, summary.rows, summary.measures, summary.column ?? null, summary.order ?? null]);
  const [expanded, setExpanded] = useState<{ readonly identity: string; readonly keys: ReadonlySet<string> }>({ identity, keys: new Set() });
  const open = expanded.identity === identity ? expanded.keys : new Set<string>();
  const toggle = (key: string) =>
    setExpanded(() => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { identity, keys: next };
    });
  const shared = { client: props.client, descriptor, state, ...(props.scope ? { scope: props.scope } : {}), measures, ...(props.timeZone ? { timeZone: props.timeZone } : {}), identity, count, ...(column ? { column } : {}) };
  const top = useLevel({ ...shared, level: levels[0], filters: [], ...(summary.order ? { order: summary.order } : {}) });
  // Expansions keep the opening's columns, so every level aligns (section 7.1).
  const columns = top.status === "ready" ? top.columns : undefined;
  const narrow = props.widthTier === "narrow";
  const change = (next: Partial<ListAggregateStateV1>) => {
    setChanged(false);
    props.onAggregateChange({ aggregate: { ...summary, ...next } });
  };
  const refresh = () => {
    setChanged(false);
    setAttempt((value) => value + 1);
  };
  // Top / Bottom N (A6, section 7.5): level 1 ordered by a measure.
  const order = summary.order;
  const countMeasure = aggregate.measures.find((measure) => measure.aggregate === "count") ?? ({ key: "count", aggregate: "count" } as ListAggregateMeasureV1);
  const orderable = [...(measures.some((measure) => measure.aggregate === "count") ? [] : [countMeasure]), ...measures];
  const orderMeasure = order ? orderable.find((measure) => measure.key === order.measure) : undefined;
  const refusals = levels[0] ? orderable.flatMap((measure) => {
    const reason = orderRefusal(measure, levels[0]!, state.filters, top.status === "ready" ? top.parent : undefined);
    return reason ? [{ measure, reason }] : [];
  }) : [];
  const changeOrder = (next: ListAggregateOrderStateV1 | undefined) => {
    setChanged(false);
    const { order: _order, ...rest } = summary;
    props.onAggregateChange({ aggregate: next ? { ...rest, order: next } : rest });
  };
  const ranking = top.status === "ready" ? top.ranking : undefined;
  const heading = order && orderMeasure && levels[0] && top.status === "ready"
    ? (() => {
        const values = { dimension: levelName(levels[0]!, intl), measure: measureLabel(orderMeasure, intl), limit: order.limit, total: ranking?.groupCount ?? 0 };
        if (!ranking) return intl.message(order.direction === "desc" ? "list.aggregate.rankTop" : "list.aggregate.rankBottom", values);
        if (ranking.groupCount > order.limit) return intl.message(order.direction === "desc" ? "list.aggregate.rankTopOf" : "list.aggregate.rankBottomOf", values);
        return intl.message(order.direction === "desc" ? "list.aggregate.rankAllHighest" : "list.aggregate.rankAllLowest", values);
      })()
    : undefined;
  // The chart (A5.3, section 13.6): the opening response, charted; no request.
  const view = summary.view === "chart" ? "chart" : "table";
  const setView = (next: "table" | "chart") => {
    setChanged(false);
    const { view: _view, ...rest } = summary;
    props.onAggregateChange({ aggregate: next === "chart" ? { ...rest, view: "chart" } : rest });
  };
  const seriesLimit = useChartSeriesLimit();
  const chartMeasure = measures.find((measure) => measure.key === summary.chart?.measure) ?? measures[0];
  const chart = useMemo(() => {
    if (view !== "chart" || top.status !== "ready" || !top.rows.length || !levels[0] || !chartMeasure) return undefined;
    return summaryChartData({
      level: levels[0],
      levelLabel: levelName(levels[0], intl),
      rows: top.rows,
      rowLabel: (row) => rowLabel(row, levels[0]!, intl),
      ...(top.parent ? { parent: top.parent } : {}),
      truncated: top.truncated,
      measure: chartMeasure,
      measureLabel: measureLabel(chartMeasure, intl),
      ...(column && top.columns ? { columns: top.columns, columnLevel: column, columnLabel: (item: SummaryColumnValue) => rowLabel(item, column, intl) } : {}),
      ...(top.columnsTruncated ? { columnsTruncated: true } : {}),
    });
  }, [view, top, levels, chartMeasure, column, intl]);
  const availability = chart ? chartTypes(chart.data, { seriesLimit }) : [];
  const offered = (type: ChartType) => availability.find((item) => item.type === type)?.available === true;
  const chartType: ChartType = summary.chart?.type ?? CHART_PREFERENCE.find(offered) ?? "column";
  const partOfWhole = Boolean(chart?.data.series.every((series) => series.partOfWhole));
  const chartLabel: ListAggregateChartLabel = summary.chart?.label === "percentage" && !partOfWhole ? "value" : summary.chart?.label ?? "value";
  const changeChart = (next: Partial<NonNullable<ListAggregateStateV1["chart"]>>) =>
    change({ chart: { type: chartType, measure: chartMeasure?.key ?? "count", label: chartLabel, ...next } });

  const pickers = (
    <div className="a-entity-aggregate__toolbar">
      <SegmentedControl
        className="a-entity-aggregate__view"
        label={intl.message("list.aggregate.view")}
        value={view}
        options={[
          { value: "table", label: intl.message("list.aggregate.viewTable") },
          { value: "chart", label: intl.message("list.aggregate.viewChart") },
        ]}
        onValueChange={setView}
      />
      <fieldset className="a-entity-aggregate__rows">
        <legend>{intl.message("list.aggregate.rows")}</legend>
        {[0, 1, 2].slice(0, Math.min(3, summary.rows.length + 1)).map((index) => {
          const options = levelOptions(aggregate, summary.rows, index);
          if (index > 0 && !options.length && index >= summary.rows.length) return null;
          return (
            <span key={index} className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.level", { level: index + 1 })}
              value={summary.rows[index] ?? ""}
              placeholder={intl.message("list.aggregate.levelNone")}
              options={[
                ...(index > 0 ? [{ value: "", label: intl.message("list.aggregate.levelNone") }] : []),
                ...options.map((option) => ({
                  value: option.entry,
                  label: option.unit
                    ? intl.message(option.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: option.dimension.label })
                    : option.dimension.label,
                })),
              ]}
              onChange={(entry) =>
                change({ rows: entry ? [...summary.rows.slice(0, index), entry, ...summary.rows.slice(index + 1)].slice(0, 3) : summary.rows.slice(0, index) })
              }
            />
            </span>
          );
        })}
        <span className="a-entity-aggregate__level">
          <ChoiceSelect
            label={intl.message("list.aggregate.order")}
            value={order ? `${order.measure}:${order.direction}` : ""}
            options={[
              { value: "", label: levels[0] ? intl.message("list.aggregate.orderByDimension", { dimension: levelName(levels[0], intl) }) : intl.message("list.aggregate.levelNone") },
              ...orderable.flatMap((measure) => {
                const refused = refusals.some((item) => item.measure.key === measure.key);
                return [
                  { value: `${measure.key}:desc`, label: intl.message("list.aggregate.orderHighest", { measure: measureLabel(measure, intl) }), disabled: refused },
                  { value: `${measure.key}:asc`, label: intl.message("list.aggregate.orderLowest", { measure: measureLabel(measure, intl) }), disabled: refused },
                ];
              }),
            ]}
            onChange={(value) => {
              if (!value) return changeOrder(undefined);
              const at = value.lastIndexOf(":");
              changeOrder({ measure: value.slice(0, at), direction: value.slice(at + 1) as "asc" | "desc", limit: order?.limit ?? 10 });
            }}
          />
        </span>
        {order ? (
          <span className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.show")}
              value={String(order.limit)}
              options={LIST_AGGREGATE_ORDER_LIMITS.map((limit) => ({ value: String(limit), label: intl.number(limit) }))}
              onChange={(limit) => changeOrder({ ...order, limit: Number(limit) as ListAggregateOrderStateV1["limit"] })}
            />
          </span>
        ) : null}
        {refusals.length ? (
          <ul className="a-entity-aggregate__reasons">
            {refusals.map((item) => (
              <li key={item.measure.key}>
                {intl.message("list.aggregate.orderUnavailable", {
                  measure: measureLabel(item.measure, intl),
                  reason: intl.message(`list.aggregate.orderRefused.${item.reason}`, { fields: (item.measure.timeFields ?? []).map((time) => time.label).join(", ") }),
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>
      {aggregate.dimensions.some((dimension) => dimension.column) ? (
        <fieldset className="a-entity-aggregate__rows">
          <legend>{intl.message("list.aggregate.columns")}</legend>
          <span className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.columns")}
              value={summary.column ?? ""}
              placeholder={intl.message("list.aggregate.levelNone")}
              options={[
                { value: "", label: intl.message("list.aggregate.levelNone") },
                ...columnOptions(aggregate, summary.rows).map((option) => ({
                  value: option.entry,
                  label: option.unit
                    ? intl.message(option.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: option.dimension.label })
                    : option.dimension.label,
                })),
              ]}
              onChange={(entry) => change({ column: entry })}
            />
          </span>
        </fieldset>
      ) : null}
      <fieldset className="a-entity-aggregate__measures">
        <legend>{intl.message("list.aggregate.measures")}</legend>
        {aggregate.measures.map((measure) => {
          const checked = summary.measures.includes(measure.key);
          const full = !checked && summary.measures.length >= LIST_AGGREGATE_REQUEST_MEASURES;
          return (
            <Label key={measure.key} className="a-entity-aggregate__measure">
              <Checkbox
                checked={checked}
                disabled={full || (checked && summary.measures.length === 1)}
                onChange={() =>
                  change({
                    // Kept in declared order, so a shared link reads the same.
                    measures: aggregate.measures.map((item) => item.key).filter((key) => (key === measure.key ? !checked : summary.measures.includes(key))),
                  })
                }
              />
              <span>{measureLabel(measure, intl)}</span>
            </Label>
          );
        })}
        {summary.measures.length >= LIST_AGGREGATE_REQUEST_MEASURES ? (
          <span className="a-entity-aggregate__hint">{intl.message("list.aggregate.measureLimit", { count: LIST_AGGREGATE_REQUEST_MEASURES })}</span>
        ) : null}
      </fieldset>
      {view === "chart" && chart ? (
        <fieldset className="a-entity-aggregate__rows">
          <legend>{intl.message("list.aggregate.viewChart")}</legend>
          <span className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.chartType")}
              value={chartType}
              options={CHART_TYPES.map((type) => ({ value: type, label: intl.message(`chart.type.${type}`), disabled: !offered(type) }))}
              onChange={(type) => changeChart({ type })}
            />
          </span>
          <span className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.chartMeasure")}
              value={chartMeasure?.key ?? ""}
              options={measures.map((measure) => ({ value: measure.key, label: measureLabel(measure, intl) }))}
              onChange={(measure) => changeChart({ measure })}
            />
          </span>
          <span className="a-entity-aggregate__level">
            <ChoiceSelect
              label={intl.message("list.aggregate.chartLabel")}
              value={chartLabel}
              options={[
                { value: "value" as const, label: intl.message("list.aggregate.chartLabelValue") },
                { value: "percentage" as const, label: intl.message("list.aggregate.chartLabelPercentage"), disabled: !partOfWhole },
                { value: "none" as const, label: intl.message("list.aggregate.chartLabelNone") },
              ]}
              onChange={(label) => changeChart({ label })}
            />
          </span>
          {availability.some((item) => !item.available) ? (
            <ul className="a-entity-aggregate__reasons">
              {availability.flatMap((item) =>
                item.available
                  ? []
                  : [<li key={item.type}>{intl.message("list.aggregate.chartTypeUnavailable", { type: intl.message(`chart.type.${item.type}`), reason: intl.message(`chart.unavailable.${item.reason}`, { max: item.seriesLimit }) })}</li>],
              )}
            </ul>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );

  const notices = (
    <>
      {heading ? <p className="a-entity-aggregate__ranking" role="status">{heading}</p> : null}
      {ranking?.groupsUnranked ? <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.unranked", { count: ranking.groupsUnranked })}</p> : null}
      {ranking?.tieAtCut ? <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.tieAtCut")}</p> : null}
      {aggregate.fieldsRestricted ? <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.fieldsRestricted")}</p> : null}
      {column && top.status === "ready" && top.columnsTruncated ? (
        <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.columnsTruncated", { count: columns?.length ?? 0, dimension: column.dimension.label })}</p>
      ) : null}
      {changed ? (
        <div className="a-entity-aggregate__notice" role="status">
          <span>{intl.message("list.aggregate.changed")}</span>
          <Button variant="secondary" size="small" onClick={refresh}>
            {intl.message("list.aggregate.refresh")}
          </Button>
        </div>
      ) : null}
    </>
  );

  let body: ReactNode;
  if (!levels.length || top.status === "loading")
    body = <div className="a-entity-aggregate__state" aria-busy="true"><p>{intl.message("list.aggregate.loading")}</p></div>;
  else if (top.status === "failed")
    body = (
      <div className="a-entity-aggregate__state" role="alert">
        <p>{intl.message("list.aggregate.failed")}</p>
        <Button variant="secondary" size="small" onClick={refresh}>{intl.message("list.aggregate.retry")}</Button>
      </div>
    );
  else if (!top.rows.length)
    body = <div className="a-entity-aggregate__state" role="status"><p>{intl.message("list.aggregate.noRecords")}</p></div>;
  else if (view === "chart" && chart && chartMeasure) {
    const shown: ChartType = narrow && chartType === "column" && chart.data.categories.length > NARROW_COLUMNS ? "bar" : chartType;
    body = (
      <div className="a-entity-aggregate__chart">
        <Chart
          data={chart.data}
          type={shown}
          dataLabel={chartLabel}
          caption={heading ?? intl.message("list.aggregate.chartCaption", { measure: measureLabel(chartMeasure, intl), dimension: levelName(levels[0]!, intl) })}
          format={(value) => valueText(value, chartMeasure, intl)}
          stateLabel={(kind) => (kind === "empty" ? intl.message("list.board.noValue") : stateText(kind, chartMeasure, intl))}
          onSelect={(category, series) => {
            const filters = chart.filtersOf(category, series);
            if (filters) props.onDrillDown(filters);
          }}
          toneOf={chart.toneOf}
          paletteIndexOf={chart.paletteIndexOf}
          restLabel={intl.message("list.aggregate.others")}
          dataTable={false}
        />
        {levels.length > 1 ? <p className="a-entity-aggregate__hint">{intl.message("list.aggregate.chartFirstLevel")}</p> : null}
      </div>
    );
  } else {
    const context: RowContext = {
      levels,
      measures,
      intl,
      open,
      toggle,
      narrow,
      onDrillDown: props.onDrillDown,
      onChanged: () => setChanged(true),
      ranked: Boolean(ranking),
      shared: { ...shared, ...(column && columns ? { columnValues: columns.map((item) => item.value) } : {}) },
      ...(column && columns ? { columns, columnLevel: column } : {}),
    };
    const total = top.parent;
    const rows = (
      <>
        {total ? <TotalRow totals={total} context={context} /> : null}
        {top.rows.map((row, index) => (
          <SummaryNode key={row.key} row={row} depth={0} ancestors={[]} parentPath="" context={context} position={index + 1} size={top.rows.length} first={index === 0} />
        ))}
        {/* Under an order the heading states the cut (A6); this notice is the key order's. */}
        {top.truncated && !ranking ? <Notice depth={0} context={context} text={intl.message("list.aggregate.truncated", { count: LIST_GROUP_LIMIT, dimension: levels[0]!.dimension.label })} /> : null}
      </>
    );
    body = narrow ? (
      <div className="a-entity-aggregate__narrow" role="treegrid" aria-label={intl.message("list.mode.aggregate")} onKeyDown={handleTreeKeyDown}>
        {rows}
      </div>
    ) : (
      <div className="a-entity-aggregate__scroll">
        <table className="a-entity-aggregate__table" role="treegrid" aria-label={intl.message("list.mode.aggregate")} onKeyDown={handleTreeKeyDown}>
          <caption className="a-visually-hidden">
            {intl.message("list.aggregate.caption", { entity: descriptor.entity.pluralLabel, levels: levels.map((level) => levelName(level, intl)).join(" › ") })}
          </caption>
          <thead>
            {context.columns ? (
              <>
                <tr>
                  <th scope="col" rowSpan={2} className="a-entity-aggregate__corner">
                    {levels.map((level) => levelName(level, intl)).join(" › ")}
                  </th>
                  {context.columns.map((item) => (
                    <th key={item.key} scope="colgroup" colSpan={measures.length} className="a-entity-aggregate__column">
                      {rowLabel(item, context.columnLevel!, intl)}
                    </th>
                  ))}
                  <th scope="colgroup" colSpan={measures.length} className="a-entity-aggregate__column">{intl.message("list.aggregate.total")}</th>
                </tr>
                <tr>
                  {[...context.columns, undefined].flatMap((item, index) =>
                    measures.map((measure) => (
                      <th key={`${item?.key ?? "total"}:${measure.key}:${index}`} scope="col">{measureLabel(measure, intl)}</th>
                    )),
                  )}
                </tr>
              </>
            ) : (
              <tr>
                <th scope="col" className="a-entity-aggregate__corner">
                  {levels.map((level) => levelName(level, intl)).join(" › ")}
                </th>
                {measures.map((measure) => (
                  <th key={measure.key} scope="col">{measureLabel(measure, intl)}</th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="a-entity-aggregate" aria-label={intl.message("list.mode.aggregate")} data-aggregate-requests={requests.current}>
      {pickers}
      {notices}
      {body}
    </section>
  );
}

interface RowContext {
  readonly levels: readonly SummaryLevel[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly intl: EntityIntl;
  readonly open: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
  readonly narrow: boolean;
  readonly onDrillDown: (filters: readonly ListFilterV1[]) => void;
  readonly onChanged: () => void;
  /** Level 1 is ranked by a measure (A6): its No value row is "Not ranked". */
  readonly ranked: boolean;
  readonly shared: Omit<Parameters<typeof useLevel>[0], "level" | "filters">;
  /** With a column dimension (A2): the opening's columns and their level. */
  readonly columns?: readonly SummaryColumnValue[];
  readonly columnLevel?: SummaryLevel;
}

function MeasureCells({ totals, context, label, drill }: {
  readonly totals: Omit<ListGroupTotalsV1, "cells"> | null | undefined;
  readonly context: RowContext;
  readonly label: string;
  /** A cell's drill-down (A2), on its first measure. */
  readonly drill?: { readonly label: string; readonly onDrill: () => void };
}) {
  return (
    <>
      {context.measures.map((measure, index) => {
        const text = totals ? cellText(totals, measure, context.intl) : "—";
        const kind = totals ? summaryCell(totals, measure).kind : "empty";
        const content =
          drill && index === 0 ? (
            <button type="button" className="a-entity-aggregate__drill" onClick={drill.onDrill} aria-label={drill.label}>
              {text}
            </button>
          ) : (
            text
          );
        return context.narrow ? (
          <div key={measure.key} className="a-entity-aggregate__pair" data-state={kind === "value" ? undefined : kind}>
            <span>{measureLabel(measure, context.intl)}</span>
            <span>{content}</span>
          </div>
        ) : (
          <td key={measure.key} aria-label={`${label}, ${measureLabel(measure, context.intl)} ${text}`} data-state={kind === "value" ? undefined : kind}>
            {content}
          </td>
        );
      })}
    </>
  );
}

/** A row's cells: per column (A2) and then its total, or its total alone. */
function Cells({ totals, context, label, filters }: { readonly totals: ListGroupTotalsV1; readonly context: RowContext; readonly label: string; readonly filters: readonly ListFilterV1[] }) {
  if (!context.columns) return <MeasureCells totals={totals} context={context} label={label} />;
  const total = context.intl.message("list.aggregate.total");
  const blocks = context.columns.map((column, index) => {
    const cell = totals.cells?.[index];
    const name = `${label}, ${rowLabel(column, context.columnLevel!, context.intl)}`;
    const drill = cell?.count
      ? {
          label: context.intl.message("list.aggregate.showCellRecords", { count: cell.count, group: label, column: rowLabel(column, context.columnLevel!, context.intl) }),
          onDrill: () => context.onDrillDown([...filters, ...column.filters]),
        }
      : undefined;
    const cells = <MeasureCells totals={cell} context={context} label={name} {...(drill ? { drill } : {})} />;
    return context.narrow ? (
      <div key={column.key} className="a-entity-aggregate__column-block">
        <span className="a-entity-aggregate__column-name">{rowLabel(column, context.columnLevel!, context.intl)}</span>
        {cells}
      </div>
    ) : (
      <React.Fragment key={column.key}>{cells}</React.Fragment>
    );
  });
  const own = <MeasureCells totals={totals} context={context} label={`${label}, ${total}`} />;
  return (
    <>
      {blocks}
      {context.narrow ? (
        <div className="a-entity-aggregate__column-block">
          <span className="a-entity-aggregate__column-name">{total}</span>
          {own}
        </div>
      ) : (
        own
      )}
    </>
  );
}

function TotalRow({ totals, context }: { readonly totals: ListGroupTotalsV1; readonly context: RowContext }) {
  const label = context.intl.message("list.aggregate.total");
  const drill = (
    <button
      type="button"
      className="a-entity-aggregate__drill"
      onClick={() => context.onDrillDown([])}
      aria-label={context.intl.message("list.aggregate.showAllRecords", { count: totals.count ?? 0 })}
    >
      {label}
    </button>
  );
  // In a ranked view the total stands outside the ranking, and says so as No
  // value does (decision 36).
  const unranked = context.ranked ? <span className="a-entity-aggregate__unranked">{context.intl.message("list.aggregate.notRanked")}</span> : null;
  if (context.narrow)
    return (
      <div className="a-entity-aggregate__item" data-total="">
        <div className="a-entity-aggregate__heading">{drill}{unranked}</div>
        <Cells totals={totals} context={context} label={label} filters={[]} />
      </div>
    );
  return (
    <tr className="a-entity-aggregate__total">
      <th scope="row">{drill}{unranked}</th>
      <Cells totals={totals} context={context} label={label} filters={[]} />
    </tr>
  );
}

function SummaryNode({
  row,
  depth,
  ancestors,
  parentPath,
  context,
  position,
  size,
  first,
}: {
  readonly row: SummaryRow;
  readonly depth: number;
  readonly ancestors: readonly ListFilterV1[];
  /** The parent's position path; rows are keyed by position, so no record
   * identity reaches the page, even in an attribute. */
  readonly parentPath: string;
  readonly context: RowContext;
  readonly position: number;
  readonly size: number;
  readonly first?: boolean;
}) {
  const { levels, intl } = context;
  const level = levels[depth]!;
  const filters = [...ancestors, ...row.filters];
  const path = `${parentPath}/${position}`;
  const next = levels[depth + 1];
  const expandable = Boolean(next);
  const expanded = expandable && context.open.has(path);
  const label = rowLabel(row, level, intl);
  const children = useLevel({ ...context.shared, level: expanded ? next : undefined, filters });
  // The expansion recomputes this row; a different figure means the data
  // changed since the summary opened (section 7.4).
  const reported = useRef("");
  useEffect(() => {
    if (children.status !== "ready" || !children.parent || reported.current === path) return;
    reported.current = path;
    if (!sameTotals(children.parent, row.totals, context.measures)) context.onChanged();
  }, [children, path, row.totals, context]);
  const drill = (
    <button
      type="button"
      className="a-entity-aggregate__drill"
      data-tree-open=""
      tabIndex={-1}
      onClick={() => context.onDrillDown(filters)}
      aria-label={intl.message("list.aggregate.showRecords", { count: row.totals.count ?? 0, group: label })}
    >
      {label}
    </button>
  );
  const toggle = (
    <TreeToggle
      expandable={expandable}
      expanded={expanded}
      label={next ? intl.message(expanded ? "list.aggregate.collapse" : "list.aggregate.expand", { dimension: levelName(next, intl), group: label }) : label}
      onToggle={() => context.toggle(path)}
    />
  );
  const rowProps = {
    "data-tree-key": path,
    "aria-level": depth + 1,
    "aria-setsize": size,
    "aria-posinset": position,
    ...(expandable ? { "aria-expanded": expanded } : {}),
    tabIndex: first ? 0 : -1,
  };
  const heading = (
    <>
      <TreeIndent level={depth + 1} />
      {toggle}
      {drill}
      {depth === 0 && context.ranked && row.kind === "none" ? <span className="a-entity-aggregate__unranked">{intl.message("list.aggregate.notRanked")}</span> : null}
    </>
  );
  const own = context.narrow ? (
    <div className="a-entity-aggregate__item" role="row" {...rowProps}>
      <div className="a-entity-aggregate__heading">{heading}</div>
      <Cells totals={row.totals} context={context} label={label} filters={filters} />
    </div>
  ) : (
    <tr role="row" {...rowProps}>
      <th scope="row">
        <span className="a-entity-aggregate__heading">{heading}</span>
      </th>
      <Cells totals={row.totals} context={context} label={label} filters={filters} />
    </tr>
  );
  if (!expanded) return own;
  return (
    <>
      {own}
      {children.status === "loading" ? (
        <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.levelLoading")} />
      ) : children.status === "failed" ? (
        <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.levelFailed")} />
      ) : (
        <>
          {children.rows.map((child, index) => (
            <SummaryNode key={child.key} row={child} depth={depth + 1} ancestors={filters} parentPath={path} context={context} position={index + 1} size={children.rows.length} />
          ))}
          {children.truncated ? (
            <Notice depth={depth + 1} context={context} text={intl.message("list.aggregate.truncated", { count: LIST_GROUP_LIMIT, dimension: next!.dimension.label })} />
          ) : null}
        </>
      )}
    </>
  );
}

function Notice({ depth, context, text }: { readonly depth: number; readonly context: RowContext; readonly text: string }) {
  const content = (
    <span className="a-entity-aggregate__heading">
      <TreeIndent level={depth + 1} />
      <span className="a-entity-aggregate__hint">{text}</span>
    </span>
  );
  if (context.narrow) return <div className="a-entity-aggregate__message">{content}</div>;
  return (
    <tr className="a-entity-aggregate__message">
      <td colSpan={context.measures.length * ((context.columns?.length ?? 0) + (context.columns ? 1 : 0) || 1) + 1}>{content}</td>
    </tr>
  );
}
