import type {
  EntityListDescriptorV1,
  JsonValue,
  ListFieldDescriptorV1,
  ListFilterV1,
} from "@athyper/contract-platform-entity-list";
import { zonedDayStart } from "@athyper/platform-temporal";

/** One grouping level: a field, or a date field by month or quarter (A3). */
export interface GroupLevel {
  readonly field: string;
  readonly unit?: "month" | "quarter";
}

/** Reads a `groups` entry: `field`, `field:month` or `field:quarter`. */
export function groupLevel(entry: string): GroupLevel {
  const [field, unit] = entry.split(":");
  return { field: field!, ...(unit === "month" || unit === "quarter" ? { unit } : {}) };
}

/** A `groups` entry's readable name: the field label, or "Due date by month". */
export function groupEntryLabel(entry: string, fields: readonly ListFieldDescriptorV1[], intl: { message(key: string, values?: Record<string, string>): string }): string {
  const level = groupLevel(entry);
  const label = fields.find((field) => field.key === level.field)?.label ?? level.field;
  return level.unit ? intl.message(level.unit === "month" ? "list.group.byMonth" : "list.group.byQuarter", { field: label }) : label;
}

/** A bucket's first day and the next bucket's first day (`YYYY-MM-DD`). */
export function bucketDays(bucket: string): { readonly start: string; readonly end: string } | undefined {
  const month = /^(\d{4})-(\d{2})$/.exec(bucket);
  const quarter = /^(\d{4})-Q([1-4])$/.exec(bucket);
  const year = Number((month ?? quarter)?.[1]);
  if (!month && !quarter) return undefined;
  const first = month ? Number(month[2]) : (Number(quarter![2]) - 1) * 3 + 1;
  const next = first + (month ? 1 : 3);
  const day = (y: number, m: number) => `${y + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, "0")}-01`;
  return { start: day(year, first), end: day(year, next) };
}

/** The aggregates a grouped list asks for (A2): for each visible column whose
 * field publishes aggregations, the first one other than count, on a numeric
 * field; at most five. */
export function groupAggregates(descriptor: EntityListDescriptorV1, columns: readonly string[]): readonly string[] {
  const numeric = new Set(["integer", "decimal", "money"]);
  return columns
    .flatMap((key) => {
      const field = descriptor.fields.find((item) => item.key === key);
      const aggregate = field && numeric.has(field.valueKind) ? field.aggregations.find((item) => item !== "count") : undefined;
      return aggregate ? [`${key}:${aggregate}`] : [];
    })
    .slice(0, 5);
}

/** One group heading at one level of the grouped tree. */
export interface GroupHeading {
  /** Stable key within its level: field and raw value, never the label. */
  readonly key: string;
  readonly kind: "choice" | "none" | "unmapped";
  /** The raw value for a choice heading. */
  readonly value?: JsonValue;
  /** The raw values folded into the Unmapped values heading (exact counts only). */
  readonly values?: readonly JsonValue[];
  /** The published choice label; No value and Unmapped values are labelled by the view. */
  readonly label?: string;
  /** Only under exact counts (foundation section 5). */
  readonly count?: number;
  /** Requested aggregates keyed `field:aggregate` (A2), exact counts only. */
  readonly aggregates?: Readonly<Record<string, number | string | null>>;
}

/** At most this many headings per level; more shows the "more groups" notice. */
export const GROUP_HEADING_LIMIT = 50;

const keyFor = (field: string, kind: string, value?: JsonValue) => JSON.stringify([field, kind, value ?? null]);

/** The published choices of a grouping field, in published order: its
 * authorized choice list, or true then false for a boolean. */
export function groupChoices(field: ListFieldDescriptorV1, booleanLabels: { readonly yes: string; readonly no: string }): readonly { readonly value: JsonValue; readonly label: string }[] {
  if (field.valueKind === "boolean") return [{ value: true, label: booleanLabels.yes }, { value: false, label: booleanLabels.no }];
  return (field.filterOptions ?? []).map((option) => ({ value: option.value, label: option.label }));
}

/** The headings of one level (Tree blueprint section 7.1), in published choice
 * order, then No value, then Unmapped values.
 * - Under exact counts, from the server's buckets: choices without records are
 *   omitted, values outside the published choices fold into Unmapped values.
 * - Otherwise from the published choices alone, with no counts and no
 *   request: every choice is a heading (an empty one reports "No records"
 *   when opened); No value appears when the field can be empty; Unmapped
 *   values cannot be found without a query, so the view says so. */
export function groupHeadings(
  field: ListFieldDescriptorV1,
  choices: readonly { readonly value: JsonValue; readonly label: string }[],
  buckets: readonly { readonly value: JsonValue; readonly count?: number; readonly aggregates?: GroupHeading["aggregates"] }[] | undefined,
  unit?: GroupLevel["unit"],
): readonly GroupHeading[] {
  // Date buckets (A3) come only from the group query, in chronological order.
  if (unit) {
    return (buckets ?? []).map((bucket) =>
      bucket.value === null || bucket.value === ""
        ? { key: keyFor(field.key, "none"), kind: "none" as const, ...(bucket.count !== undefined ? { count: bucket.count } : {}), ...(bucket.aggregates ? { aggregates: bucket.aggregates } : {}) }
        : { key: keyFor(field.key, "choice", bucket.value), kind: "choice" as const, value: bucket.value, ...(bucket.count !== undefined ? { count: bucket.count } : {}), ...(bucket.aggregates ? { aggregates: bucket.aggregates } : {}) },
    );
  }
  const nullable = field.filterOperators.includes("is_null");
  if (!buckets) {
    return [
      ...choices.map((choice) => ({ key: keyFor(field.key, "choice", choice.value), kind: "choice" as const, value: choice.value, label: choice.label })),
      ...(nullable ? [{ key: keyFor(field.key, "none"), kind: "none" as const }] : []),
    ];
  }
  const counts = new Map<string, { count: number; aggregates?: GroupHeading["aggregates"] }>();
  let none: { count: number; aggregates?: GroupHeading["aggregates"] } | undefined;
  const unmapped: { value: JsonValue; count: number; aggregates?: GroupHeading["aggregates"] }[] = [];
  const known = new Set(choices.map((choice) => JSON.stringify(choice.value)));
  for (const bucket of buckets) {
    const item = { count: bucket.count ?? 0, ...(bucket.aggregates ? { aggregates: bucket.aggregates } : {}) };
    if (bucket.value === null || bucket.value === "") none = none ? { count: none.count + item.count } : item;
    else if (known.has(JSON.stringify(bucket.value))) counts.set(JSON.stringify(bucket.value), item);
    else unmapped.push({ value: bucket.value, ...item });
  }
  return [
    ...choices.flatMap((choice) => {
      const item = counts.get(JSON.stringify(choice.value));
      return item === undefined ? [] : [{ key: keyFor(field.key, "choice", choice.value), kind: "choice" as const, value: choice.value, label: choice.label, ...item }];
    }),
    ...(none === undefined ? [] : [{ key: keyFor(field.key, "none"), kind: "none" as const, ...none }]),
    ...(unmapped.length
      ? [{
          key: keyFor(field.key, "unmapped"),
          kind: "unmapped" as const,
          values: unmapped.map((item) => item.value),
          count: unmapped.reduce((sum, item) => sum + item.count, 0),
          ...(unmapped.some((item) => item.aggregates) ? { aggregates: combineAggregates(unmapped.map((item) => item.aggregates ?? {})) } : {}),
        }]
      : []),
  ];
}

/** Unmapped values combine their buckets' sums, minimums and maximums; an
 * average cannot be combined from averages, so it is left out. */
export function combineAggregates(items: readonly Readonly<Record<string, number | string | null>>[]): Readonly<Record<string, number | null>> {
  const combined: Record<string, number | null> = {};
  for (const key of new Set(items.flatMap((item) => Object.keys(item)))) {
    if (key.endsWith(":average")) continue;
    const values = items.map((item) => item[key]).filter((value): value is number | string => value !== null && value !== undefined).map(Number);
    combined[key] = !values.length ? null : key.endsWith(":sum") ? values.reduce((sum, value) => sum + value, 0) : key.endsWith(":minimum") ? Math.min(...values) : Math.max(...values);
  }
  return combined;
}

/** The filters that select a heading's records (ANDed with its ancestors' and
 * the list's own filters). An Unmapped values heading has none: its records
 * load per value. A date bucket (A3) is `gte` its first day and `lt` the next
 * bucket's first day, the zoned start of those days for a datetime field. */
export function headingFilters(field: ListFieldDescriptorV1, heading: GroupHeading, unit?: GroupLevel["unit"], timeZone = "UTC"): readonly ListFilterV1[] | undefined {
  if (heading.kind === "none") return [{ field: field.key, operator: "is_null" }];
  if (heading.kind !== "choice") return undefined;
  if (!unit) return [{ field: field.key, operator: "eq", value: heading.value! }];
  const days = bucketDays(String(heading.value));
  if (!days) return undefined;
  const edge = (day: string) => (field.valueKind === "datetime" ? zonedDayStart(day, timeZone) : day);
  return [
    { field: field.key, operator: "gte", value: edge(days.start) },
    { field: field.key, operator: "lt", value: edge(days.end) },
  ];
}


/** The list's own page request when Table or Cards is grouped. Under exact
 * counts it asks for the level-1 groups only (`groupsOnly`), which the tree
 * draws as its first level. Otherwise it stays an ordinary first page: its
 * rows are not drawn, but they decide the list's empty state. */
export function groupedPageState<S extends { readonly groups?: readonly string[]; readonly cursor?: string; readonly pageIndex?: number }>(
  state: S,
  exact: boolean,
  options: { readonly aggregates?: readonly string[]; readonly timeZone?: string } = {},
): S & { readonly group?: string; readonly groupsOnly?: boolean; readonly aggregates?: readonly string[]; readonly timeZone?: string } {
  if (!state.groups?.length) return state;
  return exact
    ? {
        ...state,
        group: state.groups[0],
        groupsOnly: true,
        cursor: undefined,
        pageIndex: undefined,
        ...(options.aggregates?.length ? { aggregates: options.aggregates } : {}),
        ...(groupLevel(state.groups[0]!).unit && options.timeZone ? { timeZone: options.timeZone } : {}),
      }
    : { ...state, cursor: undefined, pageIndex: undefined };
}
