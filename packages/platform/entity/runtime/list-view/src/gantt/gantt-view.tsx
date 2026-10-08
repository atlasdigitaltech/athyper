"use client";
import React, { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  ListDateRangeFieldV1,
  ListFieldDescriptorV1,
  ListGanttStateV1,
  ListGanttV1,
  ListGanttZoom,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { daysBetween, periodWindow, quarterOf, startOfMonth, startOfQuarter, zonedToday, type CalendarWindow } from "@athyper/platform-temporal";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button, SegmentedControl } from "@athyper/platform-ui";
import { resolveCardLayout } from "../card-content";
import type { ListWidthTier } from "../presentation-tier";
import { progressPercent } from "../progress-value";
import { EntityRecordCard } from "../record-card";
import { useDateRangePages } from "../date-range/date-range-data";
import {
  agendaByDay,
  dateRangeQueryState,
  mergeRows,
  openEndedFilters,
  trayFilters,
  windowFilters,
  type DatedEntry,
} from "../date-range/date-range-model";
import {
  DatedAgenda,
  DatedEntryNote,
  NothingScheduled,
  UnscheduledTray,
  datedRowLabel,
  datedTone,
  formatDay,
  type EntityIntl,
} from "../date-range/date-range-parts";
import {
  GANTT_ROW_CEILING,
  axisPosition,
  ganttBar,
  ganttColumns,
  ganttEntries,
  ganttGroups,
  ganttPeriod,
  ganttSelection,
  ganttStep,
  ganttUpperTier,
  type GanttBar,
  type GanttGroup,
} from "./gantt-model";

/** The Gantt list view mode: records as rows, each a bar across a time scale,
 * over the window and open-ended queries and an Unscheduled tray, all through
 * the list query. Read-only. */
export function EntityGantt({
  client,
  descriptor,
  state,
  page,
  pageCurrent,
  scope,
  widthTier,
  fields,
  refreshKey,
  timeZone,
  weekStart,
  recordHref,
  onOpenRecord,
  renderActions,
  onGanttChange,
}: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  /** The list's page query in Gantt mode: the window query's first page. */
  readonly page?: EntityListResultV1;
  readonly pageCurrent: boolean;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly widthTier: ListWidthTier | undefined;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly refreshKey: string;
  readonly timeZone: string;
  readonly weekStart: number;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly renderActions: (row: EntityListRowV1) => ReactNode;
  readonly onGanttChange: (next: { readonly gantt?: ListGanttStateV1; readonly ganttAnchor?: string }) => void;
}) {
  const intl = useEntityI18n();
  const gantt = descriptor.surface.gantt!;
  const today = zonedToday(timeZone);
  const { anchor, field, zoom } = ganttSelection(state, descriptor, { timeZone, weekStart, today });
  const narrow = widthTier === "narrow";
  const window = periodWindow(anchor, ganttPeriod(zoom), weekStart);
  const windowQuery = dateRangeQueryState(state, descriptor, field, windowFilters(field, window, timeZone));
  const openEnded = openEndedFilters(field, window, timeZone);
  const tray = trayFilters(field);
  const more = useDateRangePages({ client, descriptor, query: windowQuery, scope, refreshKey, firstCursor: pageCurrent && page?.pagination.hasNext ? (page.pagination.nextCursor ?? null) : null });
  const open = useDateRangePages({ client, descriptor, query: openEnded ? dateRangeQueryState(state, descriptor, field, openEnded) : undefined, scope, refreshKey });
  const unscheduled = useDateRangePages({ client, descriptor, query: tray ? dateRangeQueryState(state, descriptor, field, tray) : undefined, scope, refreshKey });
  const rows = pageCurrent && page ? mergeRows(page.rows, more.rows, open.rows) : [];
  const { entries, capped } = ganttEntries(rows, field, window, timeZone);
  const hasNext = Boolean((pageCurrent && page?.pagination.hasNext && !more.rows.length) || more.hasNext || open.hasNext);
  const exact = page?.pagination.countMode === "exact";
  const total = exact ? page?.pagination.total : undefined;
  // Counts only under exact counts and only when every row of the window is loaded.
  const complete = Boolean(pageCurrent && page) && !hasNext && !capped;
  const layout = resolveCardLayout(descriptor, fields);
  const navigate = (next: string) => onGanttChange({ ganttAnchor: next });
  const setState = (patch: Partial<ListGanttStateV1>) => onGanttChange({ gantt: { dateField: field.start, zoom: state.gantt?.zoom ?? gantt.defaultZoom, ...patch } });
  const period = periodTitle(intl, window, anchor, zoom);
  const loadMore = () => {
    more.loadMore();
    open.loadMore();
  };
  const card = (row: EntityListRowV1, note?: ReactNode) => (
    <EntityRecordCard key={row.id} descriptor={descriptor} layout={layout} row={row} query={state.query} note={note}
      href={recordHref(row)} actions={renderActions(row)} onOpenRecord={onOpenRecord} headingLevel={3} intl={intl} />
  );

  return (
    <div className="a-entity-gantt a-entity-dated">
      <div className="a-entity-dated__toolbar">
        <h2 className="a-entity-dated__period" aria-live="polite">{period}</h2>
        <div className="a-entity-dated__nav">
          <Button variant="secondary" size="small" onClick={() => navigate(today)}>{intl.message("list.calendar.today")}</Button>
          <Button variant="secondary" size="small" className="a-entity-dated__step" aria-label={intl.message("list.gantt.previous")} onClick={() => navigate(ganttStep(anchor, zoom, -1))}><span aria-hidden="true">‹</span></Button>
          <Button variant="secondary" size="small" className="a-entity-dated__step" aria-label={intl.message("list.gantt.next")} onClick={() => navigate(ganttStep(anchor, zoom, 1))}><span aria-hidden="true">›</span></Button>
        </div>
        <div className="a-entity-dated__choices">
          {gantt.dateFields.length > 1 ? (
            <SegmentedControl label={intl.message("list.calendar.datesBy")} value={field.start}
              options={gantt.dateFields.map((item) => ({ value: item.start, label: item.label }))}
              onValueChange={(dateField) => setState({ dateField })} />
          ) : null}
          {narrow ? null : (
            <SegmentedControl label={intl.message("list.gantt.zoom")} value={zoom}
              options={(["month", "quarter", "year"] as const).map((value) => ({ value, label: intl.message(`list.gantt.${value}`) }))}
              onValueChange={(next) => setState({ zoom: next as ListGanttZoom })} />
          )}
        </div>
      </div>
      {capped ? (
        <div className="a-entity-dated__notice" role="status">
          <span>{intl.message("list.gantt.ceiling", { count: GANTT_ROW_CEILING })}</span>
        </div>
      ) : hasNext ? (
        <div className="a-entity-dated__notice" role="status">
          <span>{total !== undefined
            ? intl.message("list.calendar.overflowOf", { shown: rows.length, total })
            : intl.message("list.calendar.overflow", { shown: rows.length })}</span>
          <Button variant="secondary" size="small" loading={more.loading || open.loading} onClick={loadMore}>{intl.message("list.gantt.loadMoreRows")}</Button>
        </div>
      ) : null}
      {pageCurrent && page && !entries.length ? (
        <NothingScheduled period={period} query={state.query} field={field} trayHasRows={unscheduled.rows.length > 0} intl={intl} />
      ) : narrow ? (
        <DatedAgenda byDay={agendaByDay(entries, window)} today={today} complete={complete && exact} intl={intl}
          card={(entry) => card(entry.row, <DatedEntryNote entry={entry} field={field} intl={intl} timeZone={timeZone} />)}
          loadMore={hasNext && !capped ? loadMore : undefined} loading={more.loading || open.loading} />
      ) : (
        <GanttChart gantt={gantt} field={field} entries={entries} window={window} zoom={zoom} today={today} period={period}
          counts={complete && exact} intl={intl} timeZone={timeZone} descriptor={descriptor}
          recordHref={recordHref} onOpenRecord={onOpenRecord} renderActions={renderActions}
          onStep={(direction) => navigate(ganttStep(anchor, zoom, direction))} />
      )}
      {tray ? <UnscheduledTray field={field} pages={unscheduled} card={card} intl={intl} /> : null}
    </div>
  );
}

/** "October 2026", "Q4 2026" or "2026". A Quarter window widened to whole
 * weeks is still titled by its quarter. */
function periodTitle(intl: EntityIntl, window: CalendarWindow, anchor: string, zoom: ListGanttZoom): string {
  if (zoom === "month") return formatDay(intl, startOfMonth(anchor), { month: "long", year: "numeric" });
  const year = formatDay(intl, startOfQuarter(anchor), { year: "numeric" });
  return zoom === "quarter" ? intl.message("list.gantt.quarterTitle", { quarter: quarterOf(anchor), year }) : formatDay(intl, window.start, { year: "numeric" });
}

/** Labels for the two time-scale tiers, by zoom (blueprint section 8). */
function tierLabel(intl: EntityIntl, day: string, zoom: ListGanttZoom, tier: "upper" | "lower"): string {
  if (tier === "upper") {
    if (zoom === "month") return formatDay(intl, day, { month: "long", year: "numeric" });
    if (zoom === "quarter") return formatDay(intl, day, { month: "long" });
    return intl.message("list.gantt.quarterTitle", { quarter: quarterOf(day), year: formatDay(intl, day, { year: "numeric" }) });
  }
  if (zoom === "year") return formatDay(intl, day, { month: "short" });
  return formatDay(intl, day, { day: "numeric" });
}

function GanttChart({ gantt, field, entries, window, zoom, today, period, counts, intl, timeZone, descriptor, recordHref, onOpenRecord, renderActions, onStep }: {
  readonly gantt: ListGanttV1;
  readonly field: ListDateRangeFieldV1;
  readonly entries: readonly DatedEntry[];
  readonly window: CalendarWindow;
  readonly zoom: ListGanttZoom;
  readonly today: string;
  readonly period: string;
  readonly counts: boolean;
  readonly intl: EntityIntl;
  readonly timeZone: string;
  readonly descriptor: EntityListDescriptorV1;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly renderActions: (row: EntityListRowV1) => ReactNode;
  readonly onStep: (direction: 1 | -1) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string>();
  const chart = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const groups = ganttGroups(entries, gantt.group);
  const visible = groups.flatMap((group) => (collapsed.has(group.key) ? [] : group.entries));
  const focused = visible.find((entry) => entry.row.id === focusId)?.row.id ?? visible[0]?.row.id;
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    chart.current?.querySelector<HTMLElement>(`[data-gantt-row="${CSS.escape(focused ?? "")}"]`)?.focus();
  }, [focused]);
  const columns = ganttColumns(window, zoom);
  const upper = ganttUpperTier(window, zoom);
  const todayAt = today >= window.start && today < window.end ? (daysBetween(window.start, today) + 0.5) / daysBetween(window.start, window.end) : undefined;
  const at = (fraction: number) => `${fraction * 100}%`;
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.ganttRow) return;
    const index = visible.findIndex((entry) => entry.row.id === target.dataset.ganttRow);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(index + 1, visible.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else if (event.key === "PageDown" || event.key === "PageUp") { event.preventDefault(); onStep(event.key === "PageDown" ? 1 : -1); return; }
    else if (event.key === "Enter") {
      event.preventDefault();
      target.closest("[role=row]")?.querySelector<HTMLAnchorElement>(".a-entity-gantt__name")?.click();
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    refocus.current = true;
    setFocusId(visible[next]!.row.id);
  };
  return (
    <div ref={chart} className="a-entity-gantt__chart" role="grid" tabIndex={-1} aria-label={intl.message("list.gantt.chart", { period })} onKeyDown={move}>
      <div className="a-entity-gantt__head" role="row">
        <div className="a-entity-gantt__label-head" role="columnheader">{field.label}</div>
        <div className="a-entity-gantt__scale" role="columnheader" aria-label={period}>
          <div className="a-entity-gantt__tier" aria-hidden="true">
            {upper.map((segment) => {
              const position = axisPosition(segment, window);
              return <span key={segment.start} style={{ insetInlineStart: at(position.start), inlineSize: at(position.size) }}>{tierLabel(intl, segment.start, zoom, "upper")}</span>;
            })}
          </div>
          <div className="a-entity-gantt__tier a-entity-gantt__tier--lower" aria-hidden="true">
            {columns.map((column) => {
              const position = axisPosition(column, window);
              return <span key={column.start} style={{ insetInlineStart: at(position.start), inlineSize: at(position.size) }}>{tierLabel(intl, column.start, zoom, "lower")}</span>;
            })}
          </div>
          {todayAt !== undefined ? <span className="a-entity-gantt__today-tag" aria-hidden="true" style={{ insetInlineStart: at(todayAt) }}>{intl.message("list.calendar.today")}</span> : null}
        </div>
      </div>
      <div className="a-entity-gantt__body" style={{ "--gantt-columns": columns.length } as CSSProperties}>
        <div className="a-entity-gantt__lines" aria-hidden="true">
          {columns.map((column) => <i key={column.start} style={{ insetInlineStart: at(axisPosition(column, window).start) }} />)}
          {todayAt !== undefined ? <b style={{ insetInlineStart: at(todayAt) }} /> : null}
        </div>
        {groups.map((group) => (
          <React.Fragment key={group.key || "all"}>
            {group.kind === "all" ? null : (
              <GroupRow group={group} collapsed={collapsed.has(group.key)} counts={counts} intl={intl}
                onToggle={() => setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })} />
            )}
            {collapsed.has(group.key) ? null : group.entries.map((entry) => (
              <GanttRow key={entry.row.id} bar={ganttBar(entry, field, window)} field={field} progressField={gantt.progress?.field}
                focusable={entry.row.id === focused} intl={intl} timeZone={timeZone} descriptor={descriptor}
                href={recordHref(entry.row)} onOpenRecord={onOpenRecord} actions={renderActions(entry.row)} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function GroupRow({ group, collapsed, counts, intl, onToggle }: {
  readonly group: GanttGroup;
  readonly collapsed: boolean;
  readonly counts: boolean;
  readonly intl: EntityIntl;
  readonly onToggle: () => void;
}) {
  const label = group.kind === "none" ? intl.message("list.board.noValue") : group.kind === "unmapped" ? intl.message("list.gantt.unmapped") : group.label!;
  return (
    <div className="a-entity-gantt__group" role="row" data-tone={group.tone ?? "neutral"}>
      <div role="gridcell" aria-colspan={2}>
        <button type="button" aria-expanded={!collapsed} onClick={onToggle}
          aria-label={counts ? intl.message("list.gantt.toggleGroup", { group: label, count: group.entries.length }) : label}>
          <span className="a-entity-gantt__chevron" aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          <span>{label}</span>
          {counts ? <span className="a-entity-dated__count" aria-hidden="true">{intl.number(group.entries.length)}</span> : null}
        </button>
      </div>
    </div>
  );
}

function GanttRow({ bar, field, progressField, focusable, intl, timeZone, descriptor, href, onOpenRecord, actions }: {
  readonly bar: GanttBar;
  readonly field: ListDateRangeFieldV1;
  readonly progressField?: string;
  readonly focusable: boolean;
  readonly intl: EntityIntl;
  readonly timeZone: string;
  readonly descriptor: EntityListDescriptorV1;
  readonly href: string | undefined;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly actions: ReactNode;
}) {
  const { entry } = bar;
  const row = entry.row;
  const label = datedRowLabel(row, descriptor);
  const tone = datedTone(row, field);
  const status = field.tone ? String(row.displayValues?.[field.tone.field] ?? row.values[field.tone.field] ?? "") : "";
  const percent = progressField ? progressPercent(row.values[progressField]) : undefined;
  const when = (day: string) => formatDay(intl, day, { day: "numeric", month: "long", year: "numeric" });
  const instant = (value: string | undefined, day: string) =>
    value && field.kind === "datetime" ? intl.date(value, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone }) : when(day);
  const dates = bar.milestone
    ? intl.message("list.gantt.milestone", { date: instant(entry.startsAt, entry.firstDay) })
    : entry.openEnded
      ? intl.message("list.gantt.openEnded", { start: instant(entry.startsAt, entry.firstDay) })
      : intl.message("list.gantt.range", {
          start: instant(entry.startsAt, entry.firstDay),
          end: field.kind === "datetime" && field.end ? instant(String(row.values[field.end] ?? ""), entry.lastDay) : when(entry.lastDay),
        });
  const name = [label, status || undefined, dates, percent !== undefined ? intl.message("list.gantt.progress", { percent: intl.number(percent / 100, { style: "percent" }) }) : undefined].filter(Boolean).join(", ");
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onOpenRecord && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onOpenRecord(row);
    }
  };
  return (
    <div className="a-entity-gantt__row" role="row" data-tone={tone}>
      <div className="a-entity-gantt__label" role="rowheader">
        {field.tone ? <i className="a-entity-gantt__dot" aria-hidden="true" /> : null}
        {href ? <a className="a-entity-gantt__name" href={href} onClick={open} tabIndex={-1}>{label}</a> : <span className="a-entity-gantt__name">{label}</span>}
        {status ? <span className="a-entity-gantt__status">{status}</span> : null}
        {actions ? <span className="a-entity-gantt__actions">{actions}</span> : null}
      </div>
      <div className="a-entity-gantt__track" role="gridcell" aria-label={name} tabIndex={focusable ? 0 : -1} data-gantt-row={row.id}>
        {bar.milestone ? (
          <span className="a-entity-gantt__milestone" aria-hidden="true" style={{ insetInlineStart: `${bar.start * 100}%` }} />
        ) : (
          <span className="a-entity-gantt__bar" aria-hidden="true"
            data-open-ended={entry.openEnded || undefined} data-continues-before={bar.continuesBefore || undefined} data-continues-after={bar.continuesAfter || undefined}
            style={{ insetInlineStart: `${bar.start * 100}%`, inlineSize: `max(${bar.size * 100}%, var(--gantt-min-bar))` }}>
            {percent !== undefined ? <span className="a-entity-gantt__fill" style={{ inlineSize: `${percent}%` }} /> : null}
          </span>
        )}
      </div>
    </div>
  );
}
