import {
  LIST_GANTT_MAX_GROUP_CHOICES,
  type ListFieldDescriptorV1,
  type ListGanttV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListGanttDescriptor,
} from "@athyper/server-contract-metadata";
import { resolveDateRanges } from "./list-date-range.js";

export const LIST_GANTT_DATE_FIELD_UNAVAILABLE =
  "LIST_GANTT_DATE_FIELD_UNAVAILABLE";

export type ListGanttResolution =
  | { readonly gantt: ListGanttV1 }
  | { readonly unavailable: typeof LIST_GANTT_DATE_FIELD_UNAVAILABLE };

/** Resolves the published Gantt for one viewer. Date ranges follow
 * {@link resolveDateRanges}; Gantt is unavailable when none is usable. The
 * group field is offered only when it is listed, unmasked, an enum, groupable
 * and carries its authorized choice projection (at most 50 choices), the Board
 * lane-field rule; the progress field only when it is listed, unmasked and an
 * integer or decimal. An unusable group or progress field is omitted, so rows
 * render ungrouped or without fill. No count mode is required. */
export function resolveListGantt(input: {
  readonly gantt: EntityListGanttDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
}): ListGanttResolution {
  const dateFields = resolveDateRanges({
    ...input,
    dateFields: input.gantt.dateFields,
  });
  if (!dateFields.length)
    return { unavailable: LIST_GANTT_DATE_FIELD_UNAVAILABLE };
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const readable = (key: string) => {
    const field = listed.get(key);
    return field && !input.masked(key) ? field : undefined;
  };
  const groupField = input.gantt.group
    ? readable(input.gantt.group.field)
    : undefined;
  const options = groupField?.filterOptions ?? [];
  const group =
    groupField &&
    groupField.valueKind === "enum" &&
    groupField.groupable &&
    options.length &&
    options.length <= LIST_GANTT_MAX_GROUP_CHOICES
      ? Object.freeze({
          field: groupField.key,
          label: groupField.label,
          choices: Object.freeze(
            options.map((option) => {
              const value = String(option.value);
              const tone = groupField.statusTones?.[value];
              return Object.freeze({
                value,
                label: option.label,
                ...(tone ? { tone } : {}),
              });
            }),
          ),
        })
      : undefined;
  const progressField = input.gantt.progress
    ? readable(input.gantt.progress.field)
    : undefined;
  const progress =
    progressField &&
    (progressField.valueKind === "integer" ||
      progressField.valueKind === "decimal")
      ? Object.freeze({ field: progressField.key, label: progressField.label })
      : undefined;
  return {
    gantt: Object.freeze({
      defaultZoom: input.gantt.defaultZoom,
      dateFields,
      ...(group ? { group } : {}),
      ...(progress ? { progress } : {}),
    }),
  };
}
