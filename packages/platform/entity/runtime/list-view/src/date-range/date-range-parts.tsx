"use client";
import React, { type ReactNode } from "react";
import type {
  EntityListRowV1,
  ListDateRangeFieldV1,
} from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Button } from "@athyper/platform-ui";
import type { DateRangePages } from "./date-range-data";
import type { DatedEntry } from "./date-range-model";

// Presentation parts shared by the date layouts (Calendar, Gantt).

export type EntityIntl = ReturnType<typeof useEntityI18n>;

/** Formats a calendar day without a time zone (UTC midnight, UTC zone). */
export function formatDay(
  intl: EntityIntl,
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return intl.date(`${day}T00:00:00Z`, { ...options, timeZone: "UTC" });
}

/** The readable label of a record on a date layout: the title role, otherwise
 * the readable identity. Never the internal record ID. */
export function datedRowLabel(
  row: EntityListRowV1,
  descriptor: {
    readonly fields: readonly {
      readonly key: string;
      readonly semanticRole?: string;
    }[];
    readonly entity: { readonly identityField: string };
  },
): string {
  const title = descriptor.fields.find(
    (item) =>
      item.semanticRole === "title" &&
      item.key !== descriptor.entity.identityField,
  );
  const value =
    (title
      ? (row.displayValues?.[title.key] ?? row.values[title.key])
      : undefined) ??
    row.displayValues?.[descriptor.entity.identityField] ??
    row.values[descriptor.entity.identityField];
  return value === undefined || value === null ? "" : String(value);
}

/** The declared tone of a record for a date range, or neutral. */
export function datedTone(
  row: EntityListRowV1,
  field: ListDateRangeFieldV1,
): string {
  return (
    (field.tone
      ? field.tone.tones[String(row.values[field.tone.field] ?? "")]
      : undefined) ?? "neutral"
  );
}

function endLabel(
  intl: EntityIntl,
  value: unknown,
  field: ListDateRangeFieldV1,
): string {
  const text = String(value);
  return field.kind === "date"
    ? formatDay(intl, text.slice(0, 10), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : intl.date(text, { dateStyle: "medium", timeStyle: "short" });
}

/** When an entry happens, as a card's note: a day, a range, an open-ended
 * start, or an instant with the person's time zone. */
export function DatedEntryNote({
  entry,
  field,
  intl,
  timeZone,
}: {
  readonly entry: DatedEntry;
  readonly field: ListDateRangeFieldV1;
  readonly intl: EntityIntl;
  readonly timeZone: string;
}) {
  const short = (day: string) =>
    formatDay(intl, day, { day: "numeric", month: "short" });
  if (entry.openEnded) {
    const from = entry.startsAt
      ? intl.date(entry.startsAt, {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        })
      : short(entry.firstDay);
    return (
      <>
        <strong>{intl.message("list.calendar.from", { date: from })}</strong>
        <span>
          {intl.message("list.calendar.openEnded")}{" "}
          <span className="a-entity-dated__arrow" aria-hidden="true">
            →
          </span>
        </span>
      </>
    );
  }
  if (entry.multiDay)
    return (
      <strong>
        {short(entry.firstDay)} – {short(entry.lastDay)}
      </strong>
    );
  if (field.kind === "datetime" && entry.startsAt)
    return (
      <>
        <strong>
          {intl.date(entry.startsAt, {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            timeZone,
          })}
        </strong>
        <span>{timeZone.replace(/_/g, " ")}</span>
      </>
    );
  return (
    <>
      <strong>{short(entry.firstDay)}</strong>
      <span>{intl.message("list.calendar.allDay")}</span>
    </>
  );
}

/** Records grouped under day headings, each once on its first day in the
 * window. A day's count shows only when every record of the window is loaded. */
export function DatedAgenda({
  byDay,
  today,
  complete,
  intl,
  card,
  loadMore,
  loading,
}: {
  readonly byDay: ReadonlyMap<string, readonly DatedEntry[]>;
  readonly today: string;
  readonly complete: boolean;
  readonly intl: EntityIntl;
  readonly card: (entry: DatedEntry) => ReactNode;
  readonly loadMore?: () => void;
  readonly loading: boolean;
}) {
  const days = [...byDay.keys()].sort();
  return (
    <div className="a-entity-dated__agenda">
      {days.map((day) => {
        const name = formatDay(intl, day, {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        return (
          <section key={day} aria-label={name}>
            <h3>
              <span>{name}</span>
              {day === today ? (
                <span className="a-entity-dated__today">
                  {intl.message("list.calendar.today")}
                </span>
              ) : null}
              {complete ? (
                <small>
                  {intl.message("list.calendar.dayRecords", {
                    count: byDay.get(day)!.length,
                  })}
                </small>
              ) : null}
            </h3>
            <div className="a-entity-dated__cards">
              {byDay.get(day)!.map(card)}
            </div>
          </section>
        );
      })}
      {loadMore ? (
        <Button
          variant="secondary"
          size="small"
          loading={loading}
          onClick={loadMore}
        >
          {intl.message("list.calendar.loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

/** The empty period: a heading, the reason, and a pointer to the tray. */
export function NothingScheduled({
  period,
  query,
  field,
  trayHasRows,
  intl,
}: {
  readonly period: string;
  readonly query?: string;
  readonly field: ListDateRangeFieldV1;
  readonly trayHasRows: boolean;
  readonly intl: EntityIntl;
}) {
  return (
    <div className="a-entity-dated__nothing">
      <strong>{intl.message("list.calendar.empty", { period })}</strong>
      <span>
        {query?.trim()
          ? intl.message("list.calendar.emptySearch", { query: query.trim() })
          : intl.message("list.calendar.emptyField", { field: field.label })}
      </span>
      {trayHasRows ? (
        <span>
          {intl.message("list.calendar.emptyTray", { field: field.label })}
        </span>
      ) : null}
    </div>
  );
}

/** Records without a start date, never placed with a guessed date. Its count
 * shows only under exact counts. */
export function UnscheduledTray({
  field,
  pages,
  card,
  intl,
}: {
  readonly field: ListDateRangeFieldV1;
  readonly pages: DateRangePages;
  readonly card: (row: EntityListRowV1, note: ReactNode) => ReactNode;
  readonly intl: EntityIntl;
}) {
  return (
    <details className="a-entity-dated__tray">
      <summary>
        <span>{intl.message("list.calendar.unscheduled")}</span>
        {pages.total !== undefined ? (
          <span className="a-entity-dated__count">
            {intl.number(pages.total)}
          </span>
        ) : null}
      </summary>
      <p className="a-entity-dated__caption">
        {intl.message("list.calendar.trayCaption", { field: field.label })}
      </p>
      {pages.rows.length ? (
        <div className="a-entity-dated__cards">
          {pages.rows.map((row) =>
            card(
              row,
              field.end && row.values[field.end] ? (
                <strong>
                  {intl.message("list.calendar.endsOn", {
                    date: endLabel(intl, row.values[field.end], field),
                  })}
                </strong>
              ) : (
                <strong>{intl.message("list.calendar.noDates")}</strong>
              ),
            ),
          )}
        </div>
      ) : (
        <p className="a-entity-dated__caption">
          {intl.message("list.calendar.trayEmpty")}
        </p>
      )}
      {pages.hasNext ? (
        <Button
          variant="secondary"
          size="small"
          loading={pages.loading}
          onClick={pages.loadMore}
        >
          {intl.message("list.calendar.loadMore")}
        </Button>
      ) : null}
    </details>
  );
}
