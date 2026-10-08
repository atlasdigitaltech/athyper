import type {
  ListCalendarDateFieldV1,
  ListCalendarTone,
  ListCalendarV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListCalendarDescriptor,
} from "@athyper/server-contract-metadata";

export const LIST_CALENDAR_DATE_FIELD_UNAVAILABLE = "LIST_CALENDAR_DATE_FIELD_UNAVAILABLE";

export type ListCalendarResolution =
  | { readonly calendar: ListCalendarV1 }
  | { readonly unavailable: typeof LIST_CALENDAR_DATE_FIELD_UNAVAILABLE };

/** Resolves the published Calendar for one viewer. A date field is usable
 * only when every query Calendar sends for it is admissible for this viewer:
 * the start field is listed, unmasked, sortable and filterable with `gte` and
 * `lt` (and `is_null` when nullable, for the Unscheduled tray); an end field,
 * when declared, is listed, unmasked and filterable with `gte` (date) or `gt`
 * (datetime), plus `is_null` and `is_not_null` when nullable. An unreadable
 * tone field degrades to the neutral tone. No count mode is required. */
export function resolveListCalendar(input: {
  readonly calendar: EntityListCalendarDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
}): ListCalendarResolution {
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const declared = new Map(input.entityFields.map((field) => [field.key, field]));
  const nullable = (key: string) => declared.get(key)?.required === false;
  const usable = (key: string, operators: readonly string[]) => {
    const field = listed.get(key);
    return field !== undefined && !input.masked(key) && operators.every((operator) => field.filterOperators.includes(operator as never));
  };
  const dateFields = input.calendar.dateFields.flatMap((item): ListCalendarDateFieldV1[] => {
    const start = listed.get(item.start);
    if (!start || (start.valueKind !== "date" && start.valueKind !== "datetime") || !start.sortable) return [];
    const kind = start.valueKind;
    if (!usable(item.start, ["gte", "lt", ...(nullable(item.start) ? ["is_null"] : [])])) return [];
    if (item.end !== undefined) {
      const end = listed.get(item.end);
      const endOperators = [kind === "date" ? "gte" : "gt", ...(nullable(item.end) ? ["is_null", "is_not_null"] : [])];
      if (!end || end.valueKind !== kind || !usable(item.end, endOperators)) return [];
    }
    const toneVisible = item.tone !== undefined && listed.has(item.tone.field) && !input.masked(item.tone.field);
    return [
      Object.freeze({
        start: item.start,
        ...(item.end === undefined ? {} : { end: item.end }),
        label: start.label,
        kind,
        unscheduled: nullable(item.start),
        ...(toneVisible
          ? {
              tone: Object.freeze({
                field: item.tone!.field,
                tones: Object.freeze(Object.fromEntries(item.tone!.choices.map((choice) => [choice.value, choice.tone]))) as Readonly<Record<string, ListCalendarTone>>,
              }),
            }
          : {}),
      }),
    ];
  });
  return dateFields.length
    ? { calendar: Object.freeze({ defaultView: input.calendar.defaultView, dateFields: Object.freeze(dateFields) }) }
    : { unavailable: LIST_CALENDAR_DATE_FIELD_UNAVAILABLE };
}
