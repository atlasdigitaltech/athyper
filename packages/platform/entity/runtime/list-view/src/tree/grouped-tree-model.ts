import type {
  JsonValue,
  ListFieldDescriptorV1,
  ListFilterV1,
} from "@athyper/contract-platform-entity-list";

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
}

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
  buckets: readonly { readonly value: JsonValue; readonly count?: number }[] | undefined,
): readonly GroupHeading[] {
  const nullable = field.filterOperators.includes("is_null");
  if (!buckets) {
    return [
      ...choices.map((choice) => ({ key: keyFor(field.key, "choice", choice.value), kind: "choice" as const, value: choice.value, label: choice.label })),
      ...(nullable ? [{ key: keyFor(field.key, "none"), kind: "none" as const }] : []),
    ];
  }
  const counts = new Map<string, number>();
  let none: number | undefined;
  const unmapped: { value: JsonValue; count: number }[] = [];
  const known = new Set(choices.map((choice) => JSON.stringify(choice.value)));
  for (const bucket of buckets) {
    const count = bucket.count ?? 0;
    if (bucket.value === null || bucket.value === "") none = (none ?? 0) + count;
    else if (known.has(JSON.stringify(bucket.value))) counts.set(JSON.stringify(bucket.value), count);
    else unmapped.push({ value: bucket.value, count });
  }
  return [
    ...choices.flatMap((choice) => {
      const count = counts.get(JSON.stringify(choice.value));
      return count === undefined ? [] : [{ key: keyFor(field.key, "choice", choice.value), kind: "choice" as const, value: choice.value, label: choice.label, count }];
    }),
    ...(none === undefined ? [] : [{ key: keyFor(field.key, "none"), kind: "none" as const, count: none }]),
    ...(unmapped.length
      ? [{ key: keyFor(field.key, "unmapped"), kind: "unmapped" as const, values: unmapped.map((item) => item.value), count: unmapped.reduce((sum, item) => sum + item.count, 0) }]
      : []),
  ];
}

/** The filter that selects a heading's records (ANDed with its ancestors' and
 * the list's own filters). An Unmapped values heading has no single filter:
 * its records load per value. */
export function headingFilter(field: string, heading: GroupHeading): ListFilterV1 | undefined {
  if (heading.kind === "none") return { field, operator: "is_null" };
  if (heading.kind === "choice") return { field, operator: "eq", value: heading.value! };
  return undefined;
}

/** The list's own page request when Table or Cards is grouped. Under exact
 * counts it asks for the level-1 groups only (`groupsOnly`), which the tree
 * draws as its first level. Otherwise it stays an ordinary first page: its
 * rows are not drawn, but they decide the list's empty state. */
export function groupedPageState<S extends { readonly groups?: readonly string[]; readonly cursor?: string; readonly pageIndex?: number }>(
  state: S,
  exact: boolean,
): S & { readonly group?: string; readonly groupsOnly?: boolean } {
  if (!state.groups?.length) return state;
  return exact
    ? { ...state, group: state.groups[0], groupsOnly: true, cursor: undefined, pageIndex: undefined }
    : { ...state, cursor: undefined, pageIndex: undefined };
}
