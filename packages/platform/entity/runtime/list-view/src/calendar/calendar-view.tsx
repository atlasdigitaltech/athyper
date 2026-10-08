"use client";
import React, { useState, type KeyboardEvent, type ReactNode } from "react";
import type { HttpClient } from "@athyper/platform-api-client";
import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  EntityListScopeCoordinateV1,
  ListCalendarDateFieldV1,
  ListCalendarStateV1,
  ListFieldDescriptorV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { addDays, addMonths, startOfMonth, weekRows, zonedToday } from "@athyper/platform-temporal";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button, Dialog, DialogContent, SegmentedControl } from "@athyper/platform-ui";
import { resolveCardLayout } from "../card-content";
import type { ListWidthTier } from "../presentation-tier";
import { EntityRecordCard } from "../record-card";
import { useCalendarPages } from "./calendar-data";
import {
  agendaByDay,
  calendarQueryState,
  calendarSelection,
  calendarWindow,
  entriesByDay,
  mergeRows,
  openEndedFilters,
  placeEntries,
  trayFilters,
  visibleChips,
  windowFilters,
  type CalendarEntry,
} from "./calendar-model";

type EntityIntl = ReturnType<typeof useEntityI18n>;

/** Formats a calendar day without a time zone (UTC midnight, UTC zone). */
function formatDay(intl: EntityIntl, day: string, options: Intl.DateTimeFormatOptions): string {
  return intl.date(`${day}T00:00:00Z`, { ...options, timeZone: "UTC" });
}

/** The Calendar list view mode: Month and Agenda over a date window, an
 * open-ended stream and an Unscheduled tray, all through the list query. */
export function EntityCalendar({
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
  onCalendarChange,
}: {
  readonly client: HttpClient;
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  /** The list's page query in Calendar mode: the window query's first page. */
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
  readonly onCalendarChange: (next: { readonly calendar?: ListCalendarStateV1; readonly calendarAnchor?: string }) => void;
}) {
  const intl = useEntityI18n();
  const calendar = descriptor.surface.calendar!;
  const today = zonedToday(timeZone);
  const selection = calendarSelection(state, descriptor, { timeZone, weekStart, today });
  const narrow = widthTier === "narrow";
  const view = narrow ? "agenda" : selection.view;
  const { field, anchor } = selection;
  const window = calendarWindow(anchor, view, weekStart);
  const windowQuery = calendarQueryState(state, descriptor, field, windowFilters(field, window, timeZone));
  const openEnded = openEndedFilters(field, window, timeZone);
  const tray = trayFilters(field);
  const more = useCalendarPages({ client, descriptor, query: windowQuery, scope, refreshKey, firstCursor: pageCurrent && page?.pagination.hasNext ? (page.pagination.nextCursor ?? null) : null });
  const open = useCalendarPages({ client, descriptor, query: openEnded ? calendarQueryState(state, descriptor, field, openEnded) : undefined, scope, refreshKey });
  const unscheduled = useCalendarPages({ client, descriptor, query: tray ? calendarQueryState(state, descriptor, field, tray) : undefined, scope, refreshKey });
  const rows = pageCurrent && page ? mergeRows(page.rows, more.rows, open.rows) : [];
  // Cheap pure derivations over at most one page per stream; recomputed per render.
  const entries = placeEntries(rows, field, window, timeZone);
  const byDay = entriesByDay(entries, window);
  const layout = resolveCardLayout(descriptor, fields);
  const overflow = (pageCurrent && page?.pagination.hasNext && !more.rows.length) || more.hasNext || open.hasNext;
  const total = page?.pagination.countMode === "exact" ? page.pagination.total : undefined;
  const [openDay, setOpenDay] = useState<string>();
  const label = (row: EntityListRowV1) => chipLabel(row, descriptor);
  const navigate = (next: string) => onCalendarChange({ calendarAnchor: next });
  const setState = (patch: Partial<ListCalendarStateV1>) =>
    onCalendarChange({ calendar: { dateField: field.start, view: selection.view, ...patch } });
  const period = formatDay(intl, startOfMonth(anchor), { month: "long", year: "numeric" });
  const card = (row: EntityListRowV1) => (
    <EntityRecordCard key={row.id} descriptor={descriptor} layout={layout} row={row} query={state.query}
      href={recordHref(row)} actions={renderActions(row)} onOpenRecord={onOpenRecord} headingLevel={3} intl={intl} />
  );

  return (
    <div className="a-entity-calendar">
      <div className="a-entity-calendar__toolbar">
        <div className="a-entity-calendar__nav">
          <Button variant="secondary" size="small" onClick={() => navigate(today)}>{intl.message("list.calendar.today")}</Button>
          <Button variant="ghost" size="small" aria-label={intl.message("list.calendar.previous")} onClick={() => navigate(addMonths(anchor, -1))}>‹</Button>
          <Button variant="ghost" size="small" aria-label={intl.message("list.calendar.next")} onClick={() => navigate(addMonths(anchor, 1))}>›</Button>
          <h2 className="a-entity-calendar__period" aria-live="polite">{period}</h2>
        </div>
        <div className="a-entity-calendar__choices">
          {calendar.dateFields.length > 1 ? (
            <SegmentedControl label={intl.message("list.calendar.datesBy")} value={field.start}
              options={calendar.dateFields.map((item) => ({ value: item.start, label: item.label }))}
              onValueChange={(dateField) => setState({ dateField })} />
          ) : null}
          {narrow ? null : (
            <SegmentedControl label={intl.message("list.calendar.view")} value={view}
              options={[{ value: "month", label: intl.message("list.calendar.month") }, { value: "agenda", label: intl.message("list.calendar.agenda") }]}
              onValueChange={(next) => setState({ view: next as ListCalendarStateV1["view"] })} />
          )}
        </div>
      </div>
      {overflow ? (
        <div className="a-entity-calendar__notice" role="status">
          <span>{total !== undefined
            ? intl.message("list.calendar.overflowOf", { shown: rows.length, total })
            : intl.message("list.calendar.overflow", { shown: rows.length })}</span>
          {view === "month" ? <Button variant="secondary" size="small" onClick={() => setState({ view: "agenda" })}>{intl.message("list.calendar.openAgenda")}</Button> : null}
        </div>
      ) : null}
      {pageCurrent && page && !entries.length ? (
        <p className="a-entity-calendar__empty">{intl.message("list.calendar.empty", { period })}</p>
      ) : null}
      {view === "month" ? (
        <MonthGrid window={window} anchor={anchor} today={today} byDay={byDay} field={field}
          intl={intl} timeZone={timeZone} label={label} recordHref={recordHref} onMore={setOpenDay} />
      ) : (
        <Agenda byDay={agendaByDay(entries, window)} intl={intl} card={card}
          loadMore={more.hasNext || open.hasNext ? () => { more.loadMore(); open.loadMore(); } : undefined} loading={more.loading || open.loading} />
      )}
      {tray ? (
        <details className="a-entity-calendar__tray">
          <summary>{intl.message("list.calendar.unscheduled")}{unscheduled.rows.length ? ` · ${intl.number(unscheduled.rows.length)}${unscheduled.hasNext ? "+" : ""}` : ""}</summary>
          {unscheduled.rows.length ? (
            <div className="a-entity-calendar__cards">{unscheduled.rows.map((row) => (
              <div key={row.id} className="a-entity-calendar__tray-item">
                {field.end && row.values[field.end] ? <small>{intl.message("list.calendar.endsOn", { date: endLabel(intl, row.values[field.end], field) })}</small> : null}
                {card(row)}
              </div>
            ))}</div>
          ) : <p className="a-entity-calendar__empty">{intl.message("list.calendar.trayEmpty")}</p>}
          {unscheduled.hasNext ? <Button variant="secondary" size="small" loading={unscheduled.loading} onClick={unscheduled.loadMore}>{intl.message("list.calendar.loadMore")}</Button> : null}
        </details>
      ) : null}
      {openDay ? (
        <Dialog open onOpenChange={(value) => !value && setOpenDay(undefined)}>
          <DialogContent title={formatDay(intl, openDay, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} closeLabel={intl.message("list.calendar.close")}>
            <div className="a-entity-calendar__cards">{(byDay.get(openDay) ?? []).map((entry) => card(entry.row))}</div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function chipLabel(row: EntityListRowV1, descriptor: EntityListDescriptorV1): string {
  const title = descriptor.fields.find((item) => item.semanticRole === "title" && item.key !== descriptor.entity.identityField);
  const value = (title ? row.displayValues?.[title.key] ?? row.values[title.key] : undefined) ?? row.displayValues?.[descriptor.entity.identityField] ?? row.values[descriptor.entity.identityField];
  return value === undefined || value === null ? "" : String(value);
}

function endLabel(intl: EntityIntl, value: unknown, field: ListCalendarDateFieldV1): string {
  const text = String(value);
  return field.kind === "date" ? formatDay(intl, text.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : intl.date(text, { dateStyle: "medium", timeStyle: "short" });
}

function MonthGrid({ window, anchor, today, byDay, field, intl, timeZone, label, recordHref, onMore }: {
  readonly window: { readonly start: string; readonly end: string };
  readonly anchor: string;
  readonly today: string;
  readonly byDay: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly field: ListCalendarDateFieldV1;
  readonly intl: EntityIntl;
  readonly timeZone: string;
  readonly label: (row: EntityListRowV1) => string;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onMore: (day: string) => void;
}) {
  const rows = weekRows(window);
  const month = startOfMonth(anchor);
  const [focus, setFocus] = useState(anchor);
  const focused = focus >= window.start && focus < window.end ? focus : anchor;
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
    const step: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 7, ArrowUp: -7 };
    let next: string | undefined;
    if (event.key in step) next = addDays(focused, step[event.key]!);
    else if (event.key === "Home") next = rows.find((row) => row.includes(focused))![0];
    else if (event.key === "End") next = rows.find((row) => row.includes(focused))![6];
    else if (event.key === "Enter" && (byDay.get(focused)?.length ?? 0) > 0 && (event.target as HTMLElement).getAttribute("role") === "gridcell") { event.preventDefault(); onMore(focused); return; }
    if (!next || next < window.start || next >= window.end) return;
    event.preventDefault();
    setFocus(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  };
  return (
    <div className="a-entity-calendar__month" role="grid" tabIndex={-1} aria-label={formatDay(intl, month, { month: "long", year: "numeric" })} onKeyDown={move}>
      <div className="a-entity-calendar__weekdays" role="row">
        {rows[0]!.map((day) => (
          <span key={day} role="columnheader" title={formatDay(intl, day, { weekday: "long" })}>{formatDay(intl, day, { weekday: "short" })}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row[0]} className="a-entity-calendar__week" role="row">
          {row.map((day) => {
            const { shown, more } = visibleChips(byDay.get(day) ?? []);
            return (
              <div key={day} role="gridcell" data-day={day} tabIndex={day === focused ? 0 : -1}
                aria-label={formatDay(intl, day, { weekday: "long", day: "numeric", month: "long" })}
                className="a-entity-calendar__day" data-outside={day.slice(0, 7) !== month.slice(0, 7) || undefined} data-today={day === today || undefined}>
                <span className="a-entity-calendar__date" aria-hidden="true">{formatDay(intl, day, { day: "numeric" })}</span>
                {shown.map((entry) => {
                  const href = recordHref(entry.row);
                  const time = entry.startsAt && !entry.allDay && field.kind === "datetime" ? intl.date(entry.startsAt, { hour: "numeric", minute: "2-digit", timeZone }) : undefined;
                  const tone = field.tone ? field.tone.tones[String(entry.row.values[field.tone.field] ?? "")] : undefined;
                  const text = label(entry.row);
                  const content = <>{time ? <time>{time}</time> : null}<span>{text}</span>{entry.openEnded && day === entry.lastDay ? <span aria-hidden="true"> →</span> : null}</>;
                  const name = [text, time, entry.openEnded ? intl.message("list.calendar.openEnded") : undefined].filter(Boolean).join(", ");
                  return href ? (
                    <a key={entry.row.id} className="a-entity-calendar__chip" href={href} aria-label={name} tabIndex={-1}
                      data-tone={tone ?? "neutral"} data-continues-before={entry.firstDay < day || undefined} data-continues-after={entry.lastDay > day || undefined}>{content}</a>
                  ) : (
                    <span key={entry.row.id} className="a-entity-calendar__chip" aria-label={name} data-tone={tone ?? "neutral"}
                      data-continues-before={entry.firstDay < day || undefined} data-continues-after={entry.lastDay > day || undefined}>{content}</span>
                  );
                })}
                {more ? (
                  <button type="button" className="a-entity-calendar__more" tabIndex={-1} onClick={() => onMore(day)}>
                    {intl.message("list.calendar.more", { count: more })}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Agenda({ byDay, intl, card, loadMore, loading }: {
  readonly byDay: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly intl: EntityIntl;
  readonly card: (row: EntityListRowV1) => ReactNode;
  readonly loadMore?: () => void;
  readonly loading: boolean;
}) {
  const days = [...byDay.keys()].sort();
  return (
    <div className="a-entity-calendar__agenda">
      {days.map((day) => (
        <section key={day} aria-label={formatDay(intl, day, { weekday: "long", day: "numeric", month: "long" })}>
          <h3>{formatDay(intl, day, { weekday: "long", day: "numeric", month: "long" })}</h3>
          <div className="a-entity-calendar__cards">{byDay.get(day)!.map((entry) => card(entry.row))}</div>
        </section>
      ))}
      {loadMore ? <Button variant="secondary" size="small" loading={loading} onClick={loadMore}>{intl.message("list.calendar.loadMore")}</Button> : null}
    </div>
  );
}
