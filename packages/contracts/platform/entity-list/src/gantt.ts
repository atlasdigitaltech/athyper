import {
  LIST_LAYOUT_TONES,
  parseDateRangeFields,
  type ListCalendarTone,
  type ListDateRangeFieldV1,
} from "./date-range";
import { allowKeys, fail, member, record, text } from "./layout-parse";

/** Gantt zooms this release can render: the span the chart shows. */
export const LIST_GANTT_ZOOMS = Object.freeze([
  "month",
  "quarter",
  "year",
] as const);
export type ListGanttZoom = (typeof LIST_GANTT_ZOOMS)[number];

/** At most this many published choices for a Gantt group field (the Board
 * lane-field bound). */
export const LIST_GANTT_MAX_GROUP_CHOICES = 50;

export interface ListGanttGroupV1 {
  readonly field: string;
  readonly label: string;
  /** Published choices, in published order. */
  readonly choices: readonly {
    readonly value: string;
    readonly label: string;
    readonly tone?: ListCalendarTone;
  }[];
}

export interface ListGanttProgressV1 {
  readonly field: string;
  readonly label: string;
}

/** The Gantt this viewer can use: date ranges, and an optional group and
 * progress field. A group or progress field the viewer cannot read is
 * omitted by the server. */
export interface ListGanttV1 {
  readonly defaultZoom: ListGanttZoom;
  readonly dateFields: readonly ListDateRangeFieldV1[];
  readonly group?: ListGanttGroupV1;
  readonly progress?: ListGanttProgressV1;
}

/** Saved Gantt state. The navigable position (anchor) is location state only. */
export interface ListGanttStateV1 {
  readonly dateField: string;
  readonly zoom: ListGanttZoom;
}

/** Parses the browser Gantt projection. */
export function parseListGantt(
  raw: unknown,
  fields: ReadonlyMap<string, { readonly valueKind: string }>,
): ListGanttV1 {
  const value = record(raw, "surface.gantt");
  allowKeys(
    value,
    ["defaultZoom", "dateFields", "group", "progress"],
    "surface.gantt",
    "Gantt",
  );
  const dateFields = parseDateRangeFields(
    value.dateFields,
    fields,
    "surface.gantt.dateFields",
  );
  let group: ListGanttGroupV1 | undefined;
  if (value.group !== undefined) {
    const item = record(value.group, "surface.gantt.group");
    allowKeys(
      item,
      ["field", "label", "choices"],
      "surface.gantt.group",
      "Gantt",
    );
    const field = text(item.field, "surface.gantt.group.field");
    if (fields.get(field)?.valueKind !== "enum")
      fail("surface.gantt.group.field", "must be a listed enum field");
    if (
      !Array.isArray(item.choices) ||
      !item.choices.length ||
      item.choices.length > LIST_GANTT_MAX_GROUP_CHOICES
    )
      fail(
        "surface.gantt.group.choices",
        `must list 1 to ${LIST_GANTT_MAX_GROUP_CHOICES} choices`,
      );
    const seen = new Set<string>();
    const choices = (item.choices as unknown[]).map((candidate, index) => {
      const at = `surface.gantt.group.choices[${index}]`;
      const choice = record(candidate, at);
      allowKeys(choice, ["value", "label", "tone"], at, "Gantt");
      const choiceValue = text(choice.value, `${at}.value`);
      if (seen.has(choiceValue)) fail(`${at}.value`, "must be unique");
      seen.add(choiceValue);
      return Object.freeze({
        value: choiceValue,
        label: text(choice.label, `${at}.label`),
        ...(choice.tone === undefined
          ? {}
          : {
              tone: member(
                choice.tone,
                LIST_LAYOUT_TONES,
                `${at}.tone`,
                "must be a published tone",
              ),
            }),
      });
    });
    group = Object.freeze({
      field,
      label: text(item.label, "surface.gantt.group.label"),
      choices: Object.freeze(choices),
    });
  }
  let progress: ListGanttProgressV1 | undefined;
  if (value.progress !== undefined) {
    const item = record(value.progress, "surface.gantt.progress");
    allowKeys(item, ["field", "label"], "surface.gantt.progress", "Gantt");
    const field = text(item.field, "surface.gantt.progress.field");
    const kind = fields.get(field)?.valueKind;
    if (kind !== "integer" && kind !== "decimal")
      fail(
        "surface.gantt.progress.field",
        "must be a listed integer or decimal field",
      );
    progress = Object.freeze({
      field,
      label: text(item.label, "surface.gantt.progress.label"),
    });
  }
  return Object.freeze({
    defaultZoom: member(
      value.defaultZoom,
      LIST_GANTT_ZOOMS,
      "surface.gantt.defaultZoom",
      "must be a renderable zoom",
    ),
    dateFields,
    ...(group ? { group } : {}),
    ...(progress ? { progress } : {}),
  });
}

/** Normalizes saved or shared Gantt state against this viewer's Gantt. An
 * unusable date field falls back to the first one; a zoom the descriptor
 * cannot render becomes the default zoom. Display state only, so normalizing
 * it never widens results. */
export function parseListGanttState(
  raw: unknown,
  gantt: ListGanttV1,
): ListGanttStateV1 {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const dateField =
    gantt.dateFields.find((item) => item.start === value.dateField)?.start ??
    gantt.dateFields[0]!.start;
  const zoom =
    typeof value.zoom === "string" &&
    (LIST_GANTT_ZOOMS as readonly string[]).includes(value.zoom)
      ? (value.zoom as ListGanttZoom)
      : gantt.defaultZoom;
  return Object.freeze({ dateField, zoom });
}
