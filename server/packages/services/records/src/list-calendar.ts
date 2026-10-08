import type {
  ListCalendarV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListCalendarDescriptor,
} from "@athyper/server-contract-metadata";
import { resolveDateRanges } from "./list-date-range.js";

export const LIST_CALENDAR_DATE_FIELD_UNAVAILABLE =
  "LIST_CALENDAR_DATE_FIELD_UNAVAILABLE";

export type ListCalendarResolution =
  | { readonly calendar: ListCalendarV1 }
  | { readonly unavailable: typeof LIST_CALENDAR_DATE_FIELD_UNAVAILABLE };

/** Resolves the published Calendar for one viewer: the date ranges usable
 * under {@link resolveDateRanges}. No count mode is required. */
export function resolveListCalendar(input: {
  readonly calendar: EntityListCalendarDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
}): ListCalendarResolution {
  const dateFields = resolveDateRanges({
    ...input,
    dateFields: input.calendar.dateFields,
  });
  return dateFields.length
    ? {
        calendar: Object.freeze({
          defaultView: input.calendar.defaultView,
          dateFields,
        }),
      }
    : { unavailable: LIST_CALENDAR_DATE_FIELD_UNAVAILABLE };
}
