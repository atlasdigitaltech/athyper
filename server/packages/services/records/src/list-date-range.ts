import type {
  ListCalendarTone,
  ListDateRangeFieldV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListDateRangeDescriptor,
} from "@athyper/server-contract-metadata";

/** Resolves a layout's published date ranges for one viewer (Calendar,
 * Gantt). A date range is usable only when every query the layout sends for
 * it is admissible for this viewer: the start field is listed, unmasked,
 * sortable and filterable with `gte` and `lt` (and `is_null` when nullable,
 * for the Unscheduled tray); an end field, when declared, is listed, unmasked
 * and filterable with `gte` (date) or `gt` (datetime), plus `is_null` and
 * `is_not_null` when nullable. An unreadable tone field degrades to the
 * neutral tone. */
export function resolveDateRanges(input: {
  readonly dateFields: readonly EntityListDateRangeDescriptor[];
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
}): readonly ListDateRangeFieldV1[] {
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const declared = new Map(
    input.entityFields.map((field) => [field.key, field]),
  );
  const nullable = (key: string) => declared.get(key)?.required === false;
  const usable = (key: string, operators: readonly string[]) => {
    const field = listed.get(key);
    return (
      field !== undefined &&
      !input.masked(key) &&
      operators.every((operator) =>
        field.filterOperators.includes(operator as never),
      )
    );
  };
  return Object.freeze(
    input.dateFields.flatMap((item): ListDateRangeFieldV1[] => {
      const start = listed.get(item.start);
      if (
        !start ||
        (start.valueKind !== "date" && start.valueKind !== "datetime") ||
        !start.sortable
      )
        return [];
      const kind = start.valueKind;
      if (
        !usable(item.start, [
          "gte",
          "lt",
          ...(nullable(item.start) ? ["is_null"] : []),
        ])
      )
        return [];
      if (item.end !== undefined) {
        const end = listed.get(item.end);
        const endOperators = [
          kind === "date" ? "gte" : "gt",
          ...(nullable(item.end) ? ["is_null", "is_not_null"] : []),
        ];
        if (!end || end.valueKind !== kind || !usable(item.end, endOperators))
          return [];
      }
      const toneVisible =
        item.tone !== undefined &&
        listed.has(item.tone.field) &&
        !input.masked(item.tone.field);
      return [
        Object.freeze({
          start: item.start,
          ...(item.end === undefined
            ? {}
            : { end: item.end, endNullable: nullable(item.end) }),
          label: start.label,
          kind,
          unscheduled: nullable(item.start),
          ...(toneVisible
            ? {
                tone: Object.freeze({
                  field: item.tone!.field,
                  tones: Object.freeze(
                    Object.fromEntries(
                      item.tone!.choices.map((choice) => [
                        choice.value,
                        choice.tone,
                      ]),
                    ),
                  ) as Readonly<Record<string, ListCalendarTone>>,
                }),
              }
            : {}),
        }),
      ];
    }),
  );
}
