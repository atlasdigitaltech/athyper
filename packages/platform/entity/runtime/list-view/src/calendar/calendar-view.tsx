"use client";
import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import {
  addDays,
  addMonths,
  periodWindow,
  shiftMonths,
  startOfMonth,
  weekRows,
  zonedToday,
} from "@athyper/platform-temporal";
import { ArrowRightIcon } from "@athyper/platform-icons";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import {
  Button,
  Dialog,
  DialogContent,
  SegmentedControl,
} from "@athyper/platform-ui";
import { resolveCardLayout } from "../card-content";
import type { ListWidthTier } from "../presentation-tier";
import { EntityRecordCard } from "../record-card";
import { useListPages } from "../list-pages";
import { StreamFailure } from "../stream-failure";
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
  agendaByDay,
  dateRangeQueryState,
  mergeRows,
  openEndedFilters,
  shownTotal,
  windowStartPointFilters,
  placeEntries,
  trayFilters,
  windowFilters,
  type DatedEntry,
} from "../date-range/date-range-model";
import {
  calendarPeriod,
  calendarSelection,
  calendarShownView,
  entriesByDay,
  CALENDAR_LANES_PER_WEEK,
  weekLayout,
  type WeekBar,
} from "./calendar-model";

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
  readonly onCalendarChange: (next: {
    readonly calendar?: ListCalendarStateV1;
    readonly calendarAnchor?: string;
  }) => void;
}) {
  const intl = useEntityI18n();
  const calendar = descriptor.surface.calendar!;
  const today = zonedToday(timeZone);
  const selection = calendarSelection(state, descriptor, {
    timeZone,
    weekStart,
    today,
  });
  const narrow = widthTier === "narrow";
  const view = calendarShownView(selection.view, narrow);
  const { field, anchor } = selection;
  const window = periodWindow(anchor, calendarPeriod(view), weekStart);
  const windowQuery = dateRangeQueryState(
    state,
    descriptor,
    field,
    windowFilters(field, window, timeZone),
  );
  const openEnded = openEndedFilters(field, window, timeZone);
  const startPoints = windowStartPointFilters(field, window, timeZone);
  const tray = trayFilters(field);
  const more = useListPages({
    client,
    descriptor,
    query: windowQuery,
    scope,
    refreshKey,
    firstCursor:
      pageCurrent && page?.pagination.hasNext
        ? (page.pagination.nextCursor ?? null)
        : null,
  });
  const open = useListPages({
    client,
    descriptor,
    query: openEnded
      ? dateRangeQueryState(state, descriptor, field, openEnded)
      : undefined,
    scope,
    refreshKey,
  });
  const points = useListPages({
    client,
    descriptor,
    query: startPoints
      ? dateRangeQueryState(state, descriptor, field, startPoints)
      : undefined,
    scope,
    refreshKey,
  });
  const unscheduled = useListPages({
    client,
    descriptor,
    query: tray
      ? dateRangeQueryState(state, descriptor, field, tray)
      : undefined,
    scope,
    refreshKey,
  });
  const rows =
    pageCurrent && page ? mergeRows(page.rows, more.rows, open.rows, points.rows) : [];
  // Cheap pure derivations over at most one page per stream; recomputed per render.
  const entries = placeEntries(rows, field, window, timeZone);
  const byDay = entriesByDay(entries, window);
  const layout = resolveCardLayout(descriptor, fields);
  const overflow =
    (pageCurrent && page?.pagination.hasNext && !more.rows.length) ||
    more.hasNext ||
    open.hasNext ||
    points.hasNext;
  // Per-day counts are shown only when every record of the window is loaded,
  // so a count is never a partial number (foundation section 5).
  const complete = Boolean(pageCurrent && page) && !overflow;
  const total = shownTotal(page, [
    openEnded ? open : undefined,
    startPoints ? points : undefined,
  ]);
  const [openDay, setOpenDay] = useState<string>();
  const label = (row: EntityListRowV1) => datedRowLabel(row, descriptor);
  const navigate = (next: string) => onCalendarChange({ calendarAnchor: next });
  const setState = (patch: Partial<ListCalendarStateV1>) =>
    onCalendarChange({
      calendar: { dateField: field.start, view: selection.view, ...patch },
    });
  const period = formatDay(intl, startOfMonth(anchor), {
    month: "long",
    year: "numeric",
  });
  const card = (row: EntityListRowV1, note?: ReactNode) => (
    <EntityRecordCard
      key={row.id}
      descriptor={descriptor}
      layout={layout}
      row={row}
      query={state.query}
      note={note}
      href={recordHref(row)}
      actions={renderActions(row)}
      onOpenRecord={onOpenRecord}
      headingLevel={3}
      intl={intl}
    />
  );
  const entryCard = (entry: DatedEntry) =>
    card(
      entry.row,
      <DatedEntryNote
        entry={entry}
        field={field}
        intl={intl}
        timeZone={timeZone}
      />,
    );

  return (
    <div className="a-entity-calendar a-entity-dated">
      <div className="a-entity-dated__toolbar">
        <h2 className="a-entity-dated__period" aria-live="polite">
          {period}
        </h2>
        <div className="a-entity-dated__nav">
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate(today)}
          >
            {intl.message("list.calendar.today")}
          </Button>
          <Button
            variant="secondary"
            size="small"
            className="a-entity-dated__step"
            aria-label={intl.message("list.calendar.previous")}
            onClick={() => navigate(addMonths(anchor, -1))}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <Button
            variant="secondary"
            size="small"
            className="a-entity-dated__step"
            aria-label={intl.message("list.calendar.next")}
            onClick={() => navigate(addMonths(anchor, 1))}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>
        <div className="a-entity-dated__choices">
          {calendar.dateFields.length > 1 ? (
            <SegmentedControl
              label={intl.message("list.calendar.datesBy")}
              value={field.start}
              options={calendar.dateFields.map((item) => ({
                value: item.start,
                label: item.label,
              }))}
              onValueChange={(dateField) => setState({ dateField })}
            />
          ) : null}
          {narrow ? null : (
            <SegmentedControl
              label={intl.message("list.calendar.view")}
              value={view}
              options={[
                { value: "month", label: intl.message("list.calendar.month") },
                {
                  value: "agenda",
                  label: intl.message("list.calendar.agenda"),
                },
              ]}
              onValueChange={(next) =>
                setState({ view: next as ListCalendarStateV1["view"] })
              }
            />
          )}
        </div>
      </div>
      {overflow ? (
        <div className="a-entity-dated__notice" role="status">
          <span>
            {total !== undefined
              ? intl.message("list.calendar.overflowOf", {
                  shown: rows.length,
                  total,
                })
              : intl.message("list.calendar.overflow", { shown: rows.length })}
          </span>
          {view === "month" ? (
            <Button
              variant="secondary"
              size="small"
              onClick={() => setState({ view: "agenda" })}
            >
              {intl.message("list.calendar.openAgenda")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {more.failed || open.failed || points.failed ? (
        <StreamFailure
          message={intl.message("list.calendar.streamFailed")}
          error={(more.failed ? more : open.failed ? open : points).error}
          onRetry={() => {
            if (more.failed) more.retry();
            if (open.failed) open.retry();
            if (points.failed) points.retry();
          }}
          intl={intl}
        />
      ) : null}
      {pageCurrent && page && !entries.length ? (
        <NothingScheduled
          period={period}
          query={state.query}
          field={field}
          trayHasRows={unscheduled.rows.length > 0}
          intl={intl}
        />
      ) : view === "month" ? (
        <MonthGrid
          window={window}
          anchor={anchor}
          today={today}
          entries={entries}
          byDay={byDay}
          field={field}
          complete={complete}
          intl={intl}
          timeZone={timeZone}
          label={label}
          recordHref={recordHref}
          onMore={setOpenDay}
          onNavigate={navigate}
        />
      ) : (
        <DatedAgenda
          byDay={agendaByDay(entries, window)}
          today={today}
          complete={complete}
          intl={intl}
          card={entryCard}
          loadMore={
            more.hasNext || open.hasNext || points.hasNext
              ? () => {
                  more.loadMore();
                  open.loadMore();
                  points.loadMore();
                }
              : undefined
          }
          loading={more.loading || open.loading || points.loading}
        />
      )}
      {tray ? (
        <UnscheduledTray
          field={field}
          pages={unscheduled}
          card={card}
          intl={intl}
        />
      ) : null}
      {openDay ? (
        <Dialog open onOpenChange={(value) => !value && setOpenDay(undefined)}>
          <DialogContent
            title={formatDay(intl, openDay, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            closeLabel={intl.message("list.calendar.close")}
          >
            <div className="a-entity-dated__cards">
              {(byDay.get(openDay) ?? []).map(entryCard)}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function MonthGrid({
  window,
  anchor,
  today,
  entries,
  byDay,
  field,
  complete,
  intl,
  timeZone,
  label,
  recordHref,
  onMore,
  onNavigate,
}: {
  readonly window: { readonly start: string; readonly end: string };
  readonly anchor: string;
  readonly today: string;
  readonly entries: readonly DatedEntry[];
  readonly byDay: ReadonlyMap<string, readonly DatedEntry[]>;
  readonly field: ListCalendarDateFieldV1;
  readonly complete: boolean;
  readonly intl: EntityIntl;
  readonly timeZone: string;
  readonly label: (row: EntityListRowV1) => string;
  readonly recordHref: (row: EntityListRowV1) => string | undefined;
  readonly onMore: (day: string) => void;
  readonly onNavigate: (anchor: string) => void;
}) {
  const rows = weekRows(window);
  const month = startOfMonth(anchor);
  const [focus, setFocus] = useState(anchor);
  const grid = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const focused = focus >= window.start && focus < window.end ? focus : anchor;
  // After keyboard navigation into another month, focus follows the day.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-day="${focused}"]`)
      ?.focus();
  }, [focused]);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).getAttribute("role") !== "gridcell")
      return;
    const rtl =
      event.currentTarget.ownerDocument.defaultView?.getComputedStyle(
        event.currentTarget,
      ).direction === "rtl";
    const step: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    let next: string | undefined;
    if (event.key in step) next = addDays(focused, step[event.key]!);
    else if (event.key === "PageDown" || event.key === "PageUp")
      next = shiftMonths(focused, event.key === "PageDown" ? 1 : -1);
    else if (event.key === "Home")
      next = rows.find((row) => row.includes(focused))![0];
    else if (event.key === "End")
      next = rows.find((row) => row.includes(focused))![6];
    else if (
      (event.key === "Enter" || event.key === " ") &&
      (byDay.get(focused)?.length ?? 0) > 0
    ) {
      event.preventDefault();
      onMore(focused);
      return;
    }
    if (!next) return;
    event.preventDefault();
    setFocus(next);
    refocus.current = true;
    // A day in another month moves the calendar there; the anchor month owns the grid.
    if (
      next.slice(0, 7) !== month.slice(0, 7) &&
      (next < window.start ||
        next >= window.end ||
        event.key.startsWith("Page"))
    )
      onNavigate(next);
  };
  return (
    <div
      ref={grid}
      className="a-entity-calendar__month"
      role="grid"
      tabIndex={-1}
      aria-label={formatDay(intl, month, { month: "long", year: "numeric" })}
      onKeyDown={move}
    >
      <div className="a-entity-calendar__weekdays" role="row">
        {rows[0]!.map((day) => (
          <span
            key={day}
            role="columnheader"
            title={formatDay(intl, day, { weekday: "long" })}
          >
            {formatDay(intl, day, { weekday: "short" })}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const { bars, hidden } = weekLayout(entries, row);
        return (
          <div
            key={row[0]}
            className="a-entity-calendar__week"
            role="row"
            style={{ ["--cal-lanes" as string]: CALENDAR_LANES_PER_WEEK }}
          >
            {row.map((day, column) => {
              const count = byDay.get(day)?.length ?? 0;
              const name = [
                formatDay(intl, day, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
                complete
                  ? intl.message("list.calendar.dayRecords", { count })
                  : undefined,
                day === today ? intl.message("list.calendar.today") : undefined,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <div
                  key={day}
                  role="gridcell"
                  data-day={day}
                  tabIndex={day === focused ? 0 : -1}
                  aria-label={name}
                  className="a-entity-calendar__day"
                  data-outside={
                    day.slice(0, 7) !== month.slice(0, 7) || undefined
                  }
                  data-today={day === today || undefined}
                >
                  <span className="a-entity-calendar__date" aria-hidden="true">
                    {formatDay(intl, day, { day: "numeric" })}
                  </span>
                  {bars
                    .filter((bar) => bar.column === column)
                    .map((bar) => (
                      <Bar
                        key={bar.entry.row.id}
                        bar={bar}
                        field={field}
                        intl={intl}
                        timeZone={timeZone}
                        text={label(bar.entry.row)}
                        href={recordHref(bar.entry.row)}
                      />
                    ))}
                  {hidden[column] ? (
                    <button
                      type="button"
                      className="a-entity-calendar__more"
                      tabIndex={-1}
                      onClick={() => onMore(day)}
                    >
                      {intl.message("list.calendar.more", {
                        count: hidden[column],
                      })}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** One entry drawn across the days it covers in a week. It sits in the cell of
 * its first day in that week, positioned against the week row. */
function Bar({
  bar,
  field,
  intl,
  timeZone,
  text,
  href,
}: {
  readonly bar: WeekBar;
  readonly field: ListCalendarDateFieldV1;
  readonly intl: EntityIntl;
  readonly timeZone: string;
  readonly text: string;
  readonly href: string | undefined;
}) {
  const { entry } = bar;
  const time =
    entry.startsAt && !entry.allDay && field.kind === "datetime"
      ? intl.date(entry.startsAt, {
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        })
      : undefined;
  const ends = entry.openEnded && !bar.continuesAfter;
  const content = (
    <>
      <i className="a-entity-calendar__dot" aria-hidden="true" />
      {time ? <time>{time}</time> : null}
      <span className="a-entity-calendar__label">{text}</span>
      {ends ? (
        <span className="a-entity-dated__arrow" aria-hidden="true">
          <ArrowRightIcon size="1em" />
        </span>
      ) : null}
    </>
  );
  const props = {
    className: "a-entity-calendar__chip",
    "aria-label": [
      text,
      time,
      entry.openEnded ? intl.message("list.calendar.openEnded") : undefined,
    ]
      .filter(Boolean)
      .join(", "),
    "data-tone": datedTone(entry.row, field),
    "data-continues-before": bar.continuesBefore || undefined,
    "data-continues-after": bar.continuesAfter || undefined,
    "data-open-ended": entry.openEnded || undefined,
    style: {
      "--cal-column": bar.column,
      "--cal-span": bar.span,
      "--cal-lane": bar.lane,
    } as CSSProperties,
  };
  return href ? (
    <a {...props} href={href} tabIndex={-1}>
      {content}
    </a>
  ) : (
    <span {...props}>{content}</span>
  );
}
