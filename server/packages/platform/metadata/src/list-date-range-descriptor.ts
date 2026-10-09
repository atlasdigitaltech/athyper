import {
  LIST_DATE_RANGE_MAX_FIELDS,
  LIST_LAYOUT_TONES,
  type ListCalendarTone,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListDateRangeDescriptor,
} from "@athyper/server-contract-metadata";

// Published date ranges shared by the date layouts (Calendar, Gantt), and
// the parse helpers every list layout descriptor uses (Board, Tree too).

export function fail(path: string, reason: string): never {
  throw new Error(`${path} ${reason}`);
}
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "must be an object");
  return value as Record<string, unknown>;
}
export function only(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
  what: string,
): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      fail(`${path}.${key}`, `is not a published ${what} property`);
}
export function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    fail(path, "must be readable text");
  return value;
}
export function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}
export function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

/** Parses a layout's published date ranges (structure only). */
export function parsePublishedDateRanges(
  raw: unknown,
  root: string,
  what: string,
): readonly EntityListDateRangeDescriptor[] {
  if (
    !Array.isArray(raw) ||
    !raw.length ||
    raw.length > LIST_DATE_RANGE_MAX_FIELDS
  )
    fail(
      `${root}.dateFields`,
      `must declare 1 to ${LIST_DATE_RANGE_MAX_FIELDS} date fields`,
    );
  const starts = new Set<string>();
  return Object.freeze(
    (raw as unknown[]).map((item, index) => {
      const path = `${root}.dateFields[${index}]`;
      const entry = record(item, path);
      only(entry, ["start", "end", "tone"], path, what);
      const start = text(entry.start, `${path}.start`);
      if (starts.has(start)) fail(`${path}.start`, "must be declared once");
      starts.add(start);
      const end =
        entry.end === undefined ? undefined : text(entry.end, `${path}.end`);
      let tone: EntityListDateRangeDescriptor["tone"];
      if (entry.tone !== undefined) {
        const toneValue = record(entry.tone, `${path}.tone`);
        only(toneValue, ["field", "choices"], `${path}.tone`, what);
        if (!Array.isArray(toneValue.choices) || !toneValue.choices.length)
          fail(`${path}.tone.choices`, "must publish choices");
        tone = Object.freeze({
          field: text(toneValue.field, `${path}.tone.field`),
          choices: Object.freeze(
            (toneValue.choices as unknown[]).map((choice, choiceIndex) => {
              const at = `${path}.tone.choices[${choiceIndex}]`;
              const option = record(choice, at);
              only(option, ["value", "label", "tone"], at, what);
              if (
                typeof option.tone !== "string" ||
                !(LIST_LAYOUT_TONES as readonly string[]).includes(option.tone)
              )
                fail(`${at}.tone`, "must be a published tone");
              return Object.freeze({
                value: text(option.value, `${at}.value`),
                label: text(option.label, `${at}.label`),
                tone: option.tone as ListCalendarTone,
              });
            }),
          ),
        });
      }
      return Object.freeze({
        start,
        ...(end === undefined ? {} : { end }),
        ...(tone ? { tone } : {}),
      });
    }),
  );
}

/** Checks date-range references against the entity: start and end are date
 * or datetime of the same kind, and a tone field is an enum. */
export function validatePublishedDateRanges(
  dateFields: readonly EntityListDateRangeDescriptor[],
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
  root: string,
): void {
  for (const item of dateFields) {
    const start = byKey.get(item.start);
    if (!start || (start.type !== "date" && start.type !== "datetime"))
      throw new Error(
        `${root} start field must be a date or datetime field: ${item.start}`,
      );
    if (item.end !== undefined && byKey.get(item.end)?.type !== start.type)
      throw new Error(
        `${root} end field must have the start field's kind: ${item.end}`,
      );
    if (item.tone && byKey.get(item.tone.field)?.type !== "enum")
      throw new Error(`${root} tone field must be an enum: ${item.tone.field}`);
  }
}
