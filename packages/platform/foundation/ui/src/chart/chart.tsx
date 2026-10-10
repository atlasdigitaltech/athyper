"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { chartNumber, chartTypes, type ChartDataV1, type ChartPointState, type ChartPointV1, type ChartSeriesV1, type ChartTone, type ChartType } from "@athyper/contract-platform-chart";
import { useUiMessages } from "../ui-messages";
import { chartColourConflicts, chartSeriesLimit, chartSignature, chartTicks, closeTones, documentChartTheme, keyedSlot, labelInk, slotClass, type ChartSlot, type ChartTheme } from "./chart-model";

// The design-system Chart (Shared chart blueprint 13.3, 13.4a, 13.5): hand-written
// SVG in theme tokens, drawing exactly what its producer gives. It computes no
// total; a share is a point over its series' given total. Anything shown is the
// producer's exact text through the consumer's formatter.

export interface ChartProps {
  readonly data: ChartDataV1;
  readonly type: ChartType;
  readonly dataLabel?: "value" | "percentage" | "none";
  /** The chart's accessible name. */
  readonly caption: string;
  /** The consumer's locale formatting of an exact decimal. */
  readonly format: (point: string, series: ChartSeriesV1) => string;
  /** The consumer's words for a withheld point. */
  readonly stateLabel: (kind: ChartPointState, series: ChartSeriesV1) => string;
  /** A drill-down, when the consumer offers one. */
  readonly onSelect?: (category: string, series: string) => void;
  /** Colour by meaning (decision 17): a key's declared status tone. */
  readonly toneOf?: (key: string) => ChartTone | undefined;
  /** A key's position in the consumer's fixed reference order (13.4a.3), such as
   * a published choice order; otherwise colours follow the given keys' order. */
  readonly paletteIndexOf?: (key: string) => number | undefined;
  /** The consumer's "Others" text, for a series' `rest` (13.5). */
  readonly restLabel?: string;
  /** Offer the "Show data table" disclosure; a consumer whose own grid is the
   * table (Summary) turns it off. */
  readonly dataTable?: boolean;
}

interface Mark {
  readonly id: string;
  readonly category?: string;
  readonly series: ChartSeriesV1;
  readonly categoryLabel: string;
  readonly point: ChartPointV1 & { readonly kind: "value" };
  readonly slot: ChartSlot;
  readonly shape: ReactElement;
  readonly label?: { readonly x: number; readonly y: number; readonly anchor: "start" | "middle" | "end"; readonly ink?: "surface" | "foreground" };
  /** Visual order for the arrow keys. */
  readonly order: readonly [number, number];
}

const WIDTH = 640;
const BAND_LABEL_MIN = 28;
const value = (point: ChartPointV1 | undefined): point is ChartPointV1 & { kind: "value" } => point?.kind === "value";
const short = (text: string, room: number) => (text.length * 6.5 <= room ? text : `${text.slice(0, Math.max(1, Math.floor(room / 6.5) - 1))}…`);

function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => documentChartTheme(typeof document === "undefined" ? undefined : document.documentElement));
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme((current) => { const next = documentChartTheme(root); return next.family === current.family && next.mode === current.mode ? current : next; });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-theme-family"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function useDirection(ref: { readonly current: Element | null }): "ltr" | "rtl" {
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  useLayoutEffect(() => {
    const declared = ref.current?.parentElement?.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.getAttribute("dir");
    setDirection(declared === "rtl" ? "rtl" : "ltr");
  });
  return direction;
}

export function Chart({ data, type, dataLabel = "value", caption, format, stateLabel, onSelect, toneOf, paletteIndexOf, restLabel, dataTable = true }: ChartProps): ReactElement {
  const messages = useUiMessages();
  const theme = useChartTheme();
  const figure = useRef<HTMLElement>(null);
  const direction = useDirection(figure);
  const rtl = direction === "rtl";
  const summaryId = useId();
  const limit = chartSeriesLimit(theme);
  const availability = chartTypes(data, { seriesLimit: limit }).find((item) => item.type === type)!;
  const [active, setActive] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const several = data.series.length > 1;

  const share = (point: ChartPointV1, series: ChartSeriesV1) => {
    const total = chartNumber(series.total), part = chartNumber(point);
    return series.partOfWhole && total && part !== undefined ? messages.chartShare(part / total) : undefined;
  };
  const shown = (point: ChartPointV1 & { kind: "value" }, series: ChartSeriesV1) =>
    dataLabel === "percentage" ? share(point, series) ?? format(point.value, series) : format(point.value, series);

  const drawing = useMemo(() => (availability.available ? draw(data, type, { rtl, limit, theme, toneOf, paletteIndexOf, restLabel, format }) : undefined), [availability.available, data, type, rtl, limit, theme, toneOf, paletteIndexOf, restLabel, format]);
  const marks = drawing?.marks ?? [];
  const labelled = useMemo(() => closeTones(marks.flatMap((mark) => (mark.slot.kind === "tone" ? [mark.slot.tone] : [])), theme), [marks, theme]);

  // Decision 20: the drawn keyed colours must be apart; a development check.
  useEffect(() => {
    if (!drawing || (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "production") return;
    const conflicts = chartColourConflicts(drawing.keyed, theme);
    if (conflicts.length) console.error(`Chart "${caption}": colours not distinct for ${conflicts.map((pair) => pair.join(" and ")).join("; ")}`);
  }, [drawing, theme, caption]);

  const navigable = useMemo(() => [...marks].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]), [marks]);
  const current = Math.min(active, Math.max(0, navigable.length - 1));
  const move = (event: KeyboardEvent<SVGSVGElement>) => {
    const next = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: navigable.length - 1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      const index = Math.max(0, Math.min(navigable.length - 1, next));
      setActive(index);
      event.currentTarget.querySelector<SVGGElement>(`[data-chart-point="${index}"]`)?.focus();
    } else if ((event.key === "Enter" || event.key === " ") && onSelect) {
      const mark = navigable[current];
      if (mark?.category !== undefined) { event.preventDefault(); onSelect(mark.category, mark.series.key); }
    }
  };

  const withheld = data.series.flatMap((series, s) =>
    data.points[s]!.flatMap((point, c) => (point.kind === "value" ? [] : [messages.chartWithheld(data.categories[c]!.label, stateLabel(point.kind, series), several ? series.label : undefined)])),
  );
  const pieLike = type === "pie" || type === "donut";
  const legend = !drawing ? [] : pieLike ? marks.map((mark) => ({ key: mark.id, slot: mark.slot, label: mark.categoryLabel, detail: dataLabel === "none" && !(mark.slot.kind === "tone" && labelled.has(mark.slot.tone)) ? undefined : shown(mark.point, mark.series) })) : several ? data.series.map((series, s) => ({ key: series.key, slot: drawing.seriesSlots[s]!, label: series.label, detail: undefined })) : [];

  return (
    <figure ref={figure} className="a-chart" dir={direction}>
      {!availability.available ? (
        <p role="status" className="a-chart__unavailable">{messages.chartUnavailable(availability.reason, availability.seriesLimit)}</p>
      ) : (
        <>
          <svg key={chartSignature(data)} className="a-chart__svg" viewBox={`0 0 ${WIDTH} ${drawing!.height}`} role="group" aria-roledescription={messages.chartTypeName(type)} aria-label={caption} aria-describedby={summaryId} onKeyDown={move}>
            {drawing!.chrome}
            {navigable.map((mark, index) => {
              const name = messages.chartPoint(mark.categoryLabel, mark.series.label, format(mark.point.value, mark.series), share(mark.point, mark.series));
              const forced = mark.slot.kind === "tone" && labelled.has(mark.slot.tone);
              const text = mark.label && (dataLabel !== "none" || forced) ? shown(mark.point, mark.series) : undefined;
              return (
                <g key={mark.id} data-chart-point={index} className="a-chart__point" role="img" aria-label={name} tabIndex={index === current ? 0 : -1} onFocus={() => setActive(index)} onClick={() => { setActive(index); if (mark.category !== undefined) onSelect?.(mark.category, mark.series.key); }}>
                  <title>{name}</title>
                  {mark.shape}
                  {text && !pieLike ? <text x={mark.label!.x} y={mark.label!.y} textAnchor={mark.label!.anchor} className={mark.label!.ink ? `a-chart__label a-chart__label--${mark.label!.ink}` : "a-chart__label"}>{text}</text> : null}
                </g>
              );
            })}
          </svg>
          <p id={summaryId} className="a-visually-hidden">{messages.chartSummary(messages.chartTypeName(type), data.categories.length, data.series.length)}</p>
          {legend.length ? (
            <ul className="a-chart__legend">
              {legend.map((item) => (
                <li key={item.key} title={item.label}><span aria-hidden="true" className={`a-chart__swatch ${slotClass(item.slot)}`} /><span className="a-chart__legend-label">{item.label}</span>{item.detail ? <span className="a-chart__legend-value">{item.detail}</span> : null}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {data.truncated?.categories ? <p className="a-chart__notice">{messages.chartTruncatedCategories}</p> : null}
      {data.truncated?.series ? <p className="a-chart__notice">{messages.chartTruncatedSeries}</p> : null}
      {withheld.length ? (
        <div className="a-chart__withheld">
          <p className="a-chart__withheld-heading">{messages.chartWithheldHeading}</p>
          <ul>{withheld.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </div>
      ) : null}
      {dataTable ? (
        <div className="a-chart__table">
          <button type="button" className="a-button a-button--ghost a-button--small" aria-expanded={tableOpen} onClick={() => setTableOpen(!tableOpen)}>{tableOpen ? messages.chartHideDataTable : messages.chartShowDataTable}</button>
          {tableOpen ? <ChartTable data={data} format={format} stateLabel={stateLabel} restLabel={restLabel} totalLabel={messages.chartTotal} /> : null}
        </div>
      ) : null}
    </figure>
  );
}

function ChartTable({ data, format, stateLabel, restLabel, totalLabel }: { readonly data: ChartDataV1; readonly format: ChartProps["format"]; readonly stateLabel: ChartProps["stateLabel"]; readonly restLabel?: string; readonly totalLabel: string }) {
  const cell = (point: ChartPointV1 | undefined, series: ChartSeriesV1) => (!point ? "" : point.kind === "value" ? format(point.value, series) : stateLabel(point.kind, series));
  const rest = restLabel && data.series.some((series) => series.rest);
  const total = data.series.some((series) => series.total);
  return (
    <div className="a-chart__table-scroll">
      <table className="a-chart__data">
        <thead><tr><th scope="col">{data.categoryAxis.label}</th>{data.series.map((series) => <th key={series.key} scope="col">{series.label}</th>)}</tr></thead>
        <tbody>
          {data.categories.map((category, c) => <tr key={category.key}><th scope="row">{category.label}</th>{data.series.map((series, s) => <td key={series.key}>{cell(data.points[s]![c], series)}</td>)}</tr>)}
          {rest ? <tr><th scope="row">{restLabel}</th>{data.series.map((series) => <td key={series.key}>{cell(series.rest, series)}</td>)}</tr> : null}
        </tbody>
        {total ? <tfoot><tr><th scope="row">{totalLabel}</th>{data.series.map((series) => <td key={series.key}>{cell(series.total, series)}</td>)}</tr></tfoot> : null}
      </table>
    </div>
  );
}

interface DrawOptions {
  readonly rtl: boolean;
  readonly limit: number;
  readonly theme: ChartTheme;
  readonly toneOf?: (key: string) => ChartTone | undefined;
  readonly paletteIndexOf?: (key: string) => number | undefined;
  readonly restLabel?: string;
  readonly format: ChartProps["format"];
}

interface Drawing {
  readonly height: number;
  readonly chrome: ReactElement;
  readonly marks: readonly Mark[];
  readonly seriesSlots: readonly ChartSlot[];
  /** The keyed colours drawn, for decision 20's check. */
  readonly keyed: readonly { readonly key: string; readonly slot: ChartSlot }[];
}

function draw(data: ChartDataV1, type: ChartType, options: DrawOptions): Drawing {
  const { rtl, limit, theme, toneOf, paletteIndexOf } = options;
  const seriesSlots = data.series.map((series, s): ChartSlot => (data.series.length > 1 ? keyedSlot(series.key, s, limit, toneOf, paletteIndexOf) : { kind: "single" }));
  if (type === "pie" || type === "donut") return drawPie(data, type, options);
  if (type === "bar") return drawBar(data, options, seriesSlots);

  // Column, grouped, stacked and line: categories along x, values up.
  const height = 300, top = 20, bottom = 36, start = 56, end = 12;
  const plotLeft = rtl ? end : start, plotRight = WIDTH - (rtl ? start : end), plotBottom = height - bottom, plotHeight = plotBottom - top;
  const n = data.categories.length, band = (plotRight - plotLeft) / n;
  // A categorical axis mirrors with the document; a time axis stays earliest on the left (decision 15).
  const reversed = rtl && !data.categoryAxis.ordered;
  const at = (c: number) => plotLeft + (reversed ? n - 1 - c : c) * band;
  const stacked = type === "stackedColumn";
  const sums = data.categories.map((_, c) => data.series.reduce((sum, _series, s) => sum + (chartNumber(data.points[s]![c]) ?? 0), 0));
  const numbers = data.points.flat().map(chartNumber).filter((item): item is number => item !== undefined);
  const scale = chartTicks(Math.min(0, ...numbers), stacked ? Math.max(0, ...sums) : Math.max(0, ...numbers));
  const y = (v: number) => plotBottom - ((v - scale.min) / (scale.max - scale.min)) * plotHeight;
  const axisX = rtl ? plotRight + 6 : plotLeft - 6;
  const chrome = (
    <g aria-hidden="true">
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "a-chart__axis" : "a-chart__grid"} />
          <text x={axisX} y={y(tick) + 4} textAnchor={rtl ? "start" : "end"} className="a-chart__tick">{options.format(tick.toFixed(scale.decimals), data.series[0]!)}</text>
        </g>
      ))}
      {data.categories.map((category, c) => (
        <text key={category.key} x={at(c) + band / 2} y={plotBottom + 16} textAnchor="middle" className="a-chart__tick">{short(category.label, band - 4)}<title>{category.label}</title></text>
      ))}
    </g>
  );
  const marks: Mark[] = [];
  const keyed: { key: string; slot: ChartSlot }[] = [];
  const categorySlot = (c: number): ChartSlot => {
    const tone = toneOf?.(data.categories[c]!.key);
    return tone ? { kind: "tone", tone } : { kind: "single" };
  };
  if (type === "line") {
    const series = data.series[0]!, row = data.points[0]!;
    const centre = (c: number) => at(c) + band / 2;
    // A withheld point breaks the line; it is never drawn as zero.
    const runs: string[] = [];
    let run = "";
    row.forEach((point, c) => { if (value(point)) run += `${run ? "L" : "M"}${centre(c).toFixed(1)} ${y(Number(point.value)).toFixed(1)}`; else if (run) { runs.push(run); run = ""; } });
    if (run) runs.push(run);
    const line = <g key="line" aria-hidden="true">{runs.map((path, index) => <path key={index} d={path} className="a-chart__line" />)}</g>;
    row.forEach((point, c) => {
      if (!value(point)) return;
      const cx = centre(c), cy = y(Number(point.value));
      marks.push({ id: `${series.key}:${data.categories[c]!.key}`, category: data.categories[c]!.key, series, categoryLabel: data.categories[c]!.label, point, slot: { kind: "single" }, shape: <circle cx={cx} cy={cy} r={4} className="a-chart__mark a-chart__fill--single" />, ...(band >= BAND_LABEL_MIN ? { label: { x: cx, y: cy - 8, anchor: "middle" as const } } : {}), order: [cx, 0] });
    });
    return { height, chrome: <>{chrome}{line}</>, marks, seriesSlots, keyed };
  }
  const groups = type === "groupedColumn" ? data.series.length : 1;
  const inner = (band * 0.76) / groups;
  data.categories.forEach((category, c) => {
    let base = 0;
    data.series.forEach((series, s) => {
      const point = data.points[s]![c];
      if (!value(point)) return;
      const v = Number(point.value);
      const slot = data.series.length > 1 ? seriesSlots[s]! : categorySlot(c);
      const slotIndex = type === "groupedColumn" ? (reversed ? groups - 1 - s : s) : 0;
      const x = at(c) + band * 0.12 + slotIndex * inner;
      const from = stacked ? base : 0, to = stacked ? base + v : v;
      if (stacked) base += v;
      const yTop = y(Math.max(from, to)), yBottom = y(Math.min(from, to));
      const h = Math.max(yBottom - yTop, v === 0 ? 0 : 1);
      const label = stacked
        ? (h >= 16 && inner >= BAND_LABEL_MIN && labelInk(slot, theme) ? { x: x + inner / 2, y: yTop + h / 2 + 4, anchor: "middle" as const, ink: labelInk(slot, theme)! } : undefined)
        : inner >= BAND_LABEL_MIN ? { x: x + inner / 2, y: v >= 0 ? yTop - 6 : yBottom + 14, anchor: "middle" as const } : undefined;
      marks.push({ id: `${series.key}:${category.key}`, category: category.key, series, categoryLabel: category.label, point, slot, shape: <rect x={x} y={yTop} width={Math.max(1, inner - 2)} height={h} rx={2} className={`a-chart__mark ${slotClass(slot)}`} />, ...(label ? { label } : {}), order: [x, -yTop] });
    });
  });
  if (data.series.length > 1) data.series.forEach((series, s) => keyed.push({ key: series.key, slot: seriesSlots[s]! }));
  return { height, chrome, marks, seriesSlots, keyed };
}

function drawBar(data: ChartDataV1, options: DrawOptions, seriesSlots: readonly ChartSlot[]): Drawing {
  const { rtl, toneOf } = options;
  const row = 28, top = 8, bottom = 28, start = 132, end = 56;
  const height = top + data.categories.length * row + bottom;
  const plotLeft = rtl ? end : start, plotRight = WIDTH - (rtl ? start : end), plotWidth = plotRight - plotLeft, plotBottom = height - bottom;
  const series = data.series[0]!, points = data.points[0]!;
  const numbers = points.map(chartNumber).filter((item): item is number => item !== undefined);
  const scale = chartTicks(Math.min(0, ...numbers), Math.max(0, ...numbers));
  // The value axis grows from the document's start side (the chart's chrome mirrors).
  const x = (v: number) => { const fraction = (v - scale.min) / (scale.max - scale.min); return rtl ? plotRight - fraction * plotWidth : plotLeft + fraction * plotWidth; };
  const labelX = rtl ? plotRight + 8 : plotLeft - 8;
  const chrome = (
    <g aria-hidden="true">
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={top} y2={plotBottom} className={tick === 0 ? "a-chart__axis" : "a-chart__grid"} />
          <text x={x(tick)} y={plotBottom + 16} textAnchor="middle" className="a-chart__tick">{options.format(tick.toFixed(scale.decimals), data.series[0]!)}</text>
        </g>
      ))}
      {data.categories.map((category, c) => (
        <text key={category.key} x={labelX} y={top + c * row + row / 2 + 4} textAnchor={rtl ? "start" : "end"} className="a-chart__tick">{short(category.label, start - 12)}<title>{category.label}</title></text>
      ))}
    </g>
  );
  const marks: Mark[] = [];
  points.forEach((point, c) => {
    if (!value(point)) return;
    const category = data.categories[c]!, v = Number(point.value);
    const tone = toneOf?.(category.key);
    const slot: ChartSlot = tone ? { kind: "tone", tone } : seriesSlots[0]!;
    const a = x(0), b = x(v), left = Math.min(a, b), w = Math.max(Math.abs(b - a), v === 0 ? 0 : 1), y = top + c * row + 5;
    const after = (v >= 0) !== rtl;
    marks.push({ id: `${series.key}:${category.key}`, category: category.key, series, categoryLabel: category.label, point, slot, shape: <rect x={left} y={y} width={w} height={row - 10} rx={2} className={`a-chart__mark ${slotClass(slot)}`} />, label: { x: after ? left + w + 6 : left - 6, y: y + (row - 10) / 2 + 4, anchor: after ? "start" : "end" }, order: [c, 0] });
  });
  return { height, chrome, marks, seriesSlots, keyed: [] };
}

function drawPie(data: ChartDataV1, type: "pie" | "donut", options: DrawOptions): Drawing {
  const { limit, toneOf, paletteIndexOf, restLabel } = options;
  const series = data.series[0]!;
  const height = 240, cx = WIDTH / 2, cy = height / 2, radius = 108, hole = type === "donut" ? radius * 0.58 : 0;
  const slices = data.categories.flatMap((category, c) => {
    const point = data.points[0]![c];
    return value(point) && Number(point.value) > 0 ? [{ key: category.key, label: category.label, point, slot: keyedSlot(category.key, c, limit, toneOf, paletteIndexOf) }] : [];
  });
  if (value(series.rest) && Number(series.rest.value) > 0) slices.push({ key: "", label: restLabel ?? "", point: series.rest, slot: { kind: "neutral" } });
  const whole = slices.reduce((sum, slice) => sum + Number(slice.point.value), 0);
  let angle = -Math.PI / 2;
  const marks: Mark[] = slices.map((slice, index) => {
    const sweep = (Number(slice.point.value) / whole) * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const point = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const d = sweep >= Math.PI * 2 - 1e-9
      ? `M${point(radius, a0)}A${radius} ${radius} 0 1 1 ${point(radius, a0 + Math.PI)}A${radius} ${radius} 0 1 1 ${point(radius, a0)}${hole ? `M${point(hole, a0)}A${hole} ${hole} 0 1 0 ${point(hole, a0 + Math.PI)}A${hole} ${hole} 0 1 0 ${point(hole, a0)}` : ""}Z`
      : hole
        ? `M${point(radius, a0)}A${radius} ${radius} 0 ${large} 1 ${point(radius, a1)}L${point(hole, a1)}A${hole} ${hole} 0 ${large} 0 ${point(hole, a0)}Z`
        : `M${cx} ${cy}L${point(radius, a0)}A${radius} ${radius} 0 ${large} 1 ${point(radius, a1)}Z`;
    return { id: slice.key ? `${series.key}:${slice.key}` : `${series.key}:rest`, ...(slice.key ? { category: slice.key } : {}), series, categoryLabel: slice.label, point: slice.point, slot: slice.slot, shape: <path d={d} fillRule="evenodd" className={`a-chart__mark a-chart__slice ${slotClass(slice.slot)}`} />, order: [index, 0] } satisfies Mark;
  });
  return { height, chrome: <g aria-hidden="true" />, marks, seriesSlots: [], keyed: slices.map((slice) => ({ key: slice.key || "rest", slot: slice.slot })) };
}
