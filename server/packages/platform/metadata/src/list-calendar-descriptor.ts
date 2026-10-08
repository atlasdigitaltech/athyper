import { LIST_CALENDAR_MAX_DATE_FIELDS, LIST_CALENDAR_VIEWS, type ListCalendarTone } from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListCalendarDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";

const TONES: readonly ListCalendarTone[] = ["neutral", "success", "warning", "danger"];

function fail(path: string, reason: string): never {
  throw new Error(`${path} ${reason}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "is not a published calendar property");
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) fail(path, "must be readable text");
  return value;
}

/** Parses the published Calendar projection (structure only). A default view
 * outside the renderable set is rejected here: it is never received and then
 * downgraded. Field references are checked by {@link validatePublishedListCalendar}. */
export function parsePublishedListCalendar(raw: unknown): EntityListCalendarDescriptor {
  const root = "listPresentation.calendar";
  const value = record(raw, root);
  only(value, ["defaultView", "dateFields"], root);
  if (typeof value.defaultView !== "string" || !(LIST_CALENDAR_VIEWS as readonly string[]).includes(value.defaultView))
    fail(`${root}.defaultView`, "must be a renderable view");
  if (!Array.isArray(value.dateFields) || !value.dateFields.length || value.dateFields.length > LIST_CALENDAR_MAX_DATE_FIELDS)
    fail(`${root}.dateFields`, `must declare 1 to ${LIST_CALENDAR_MAX_DATE_FIELDS} date fields`);
  const starts = new Set<string>();
  const dateFields = (value.dateFields as unknown[]).map((item, index) => {
    const path = `${root}.dateFields[${index}]`;
    const entry = record(item, path);
    only(entry, ["start", "end", "tone"], path);
    const start = text(entry.start, `${path}.start`);
    if (starts.has(start)) fail(`${path}.start`, "must be declared once");
    starts.add(start);
    const end = entry.end === undefined ? undefined : text(entry.end, `${path}.end`);
    let tone: EntityListCalendarDescriptor["dateFields"][number]["tone"];
    if (entry.tone !== undefined) {
      const toneValue = record(entry.tone, `${path}.tone`);
      only(toneValue, ["field", "choices"], `${path}.tone`);
      if (!Array.isArray(toneValue.choices) || !toneValue.choices.length) fail(`${path}.tone.choices`, "must publish choices");
      tone = Object.freeze({
        field: text(toneValue.field, `${path}.tone.field`),
        choices: Object.freeze((toneValue.choices as unknown[]).map((choice, choiceIndex) => {
          const at = `${path}.tone.choices[${choiceIndex}]`;
          const option = record(choice, at);
          only(option, ["value", "label", "tone"], at);
          if (typeof option.tone !== "string" || !(TONES as readonly string[]).includes(option.tone)) fail(`${at}.tone`, "must be a published tone");
          return Object.freeze({ value: text(option.value, `${at}.value`), label: text(option.label, `${at}.label`), tone: option.tone as ListCalendarTone });
        })),
      });
    }
    return Object.freeze({ start, ...(end === undefined ? {} : { end }), ...(tone ? { tone } : {}) });
  });
  return Object.freeze({ defaultView: value.defaultView as EntityListCalendarDescriptor["defaultView"], dateFields: Object.freeze(dateFields) });
}

/** Checks Calendar references against the entity: start and end fields are
 * date or datetime of the same kind, a tone field is an enum, and Calendar is
 * declared exactly when a calendar projection is published. */
export function validatePublishedListCalendar(
  presentation: { readonly calendar?: EntityListCalendarDescriptor; readonly supportedModes?: readonly EntityListViewMode[] },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if ((presentation.supportedModes?.includes("calendar") === true) !== Boolean(presentation.calendar))
    throw new Error("listPresentation.calendar is required exactly when Calendar is a supported mode");
  for (const item of presentation.calendar?.dateFields ?? []) {
    const start = byKey.get(item.start);
    if (!start || (start.type !== "date" && start.type !== "datetime"))
      throw new Error(`listPresentation.calendar start field must be a date or datetime field: ${item.start}`);
    if (item.end !== undefined && byKey.get(item.end)?.type !== start.type)
      throw new Error(`listPresentation.calendar end field must have the start field's kind: ${item.end}`);
    if (item.tone && byKey.get(item.tone.field)?.type !== "enum")
      throw new Error(`listPresentation.calendar tone field must be an enum: ${item.tone.field}`);
  }
}
