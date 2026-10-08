import { LIST_CALENDAR_VIEWS } from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListCalendarDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";
import {
  fail,
  only,
  parsePublishedDateRanges,
  record,
  validatePublishedDateRanges,
} from "./list-date-range-descriptor.js";

/** Parses the published Calendar projection (structure only). A default view
 * outside the renderable set is rejected here: it is never received and then
 * downgraded. Field references are checked by {@link validatePublishedListCalendar}. */
export function parsePublishedListCalendar(
  raw: unknown,
): EntityListCalendarDescriptor {
  const root = "listPresentation.calendar";
  const value = record(raw, root);
  only(value, ["defaultView", "dateFields"], root, "calendar");
  if (
    typeof value.defaultView !== "string" ||
    !(LIST_CALENDAR_VIEWS as readonly string[]).includes(value.defaultView)
  )
    fail(`${root}.defaultView`, "must be a renderable view");
  const dateFields = parsePublishedDateRanges(
    value.dateFields,
    root,
    "calendar",
  );
  return Object.freeze({
    defaultView:
      value.defaultView as EntityListCalendarDescriptor["defaultView"],
    dateFields,
  });
}

/** Checks Calendar references against the entity: start and end fields are
 * date or datetime of the same kind, a tone field is an enum, and Calendar is
 * declared exactly when a calendar projection is published. */
export function validatePublishedListCalendar(
  presentation: {
    readonly calendar?: EntityListCalendarDescriptor;
    readonly supportedModes?: readonly EntityListViewMode[];
  },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if (
    (presentation.supportedModes?.includes("calendar") === true) !==
    Boolean(presentation.calendar)
  )
    throw new Error(
      "listPresentation.calendar is required exactly when Calendar is a supported mode",
    );
  validatePublishedDateRanges(
    presentation.calendar?.dateFields ?? [],
    byKey,
    "listPresentation.calendar",
  );
}
