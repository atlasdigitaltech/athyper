import type { ListFieldDescriptorV1, ListFilterOperator } from "./types";

/** Maximum quick filters shown when a list does not configure its own. */
export const MAX_FALLBACK_QUICK_FIELDS = 4;

/** Ranks fields for the fallback quick-filter bar. Ranking comes only from the
 * metadata `semanticRole` (never from key or label text, which are localized
 * and entity-specific); other fields keep their declared column order. */
const QUICK_FILTER_ROLE_RANK: Readonly<Record<string, number>> = Object.freeze({
  status: 0,
  category: 1,
  country_code: 2,
  updated_at: 3,
});

export function quickFilterPriority(field: ListFieldDescriptorV1): number {
  const rank =
    field.semanticRole === undefined
      ? undefined
      : QUICK_FILTER_ROLE_RANK[field.semanticRole];
  return rank ?? 10 + field.defaultOrder;
}

/** Default operator for a filterable field, limited to its supported operators. */
export function preferredFilterOperator(
  field: ListFieldDescriptorV1,
): ListFilterOperator {
  const preferred: ListFilterOperator =
    field.valueKind === "date" || field.valueKind === "datetime"
      ? "relative"
      : field.filterOptions?.length ||
          field.valueKind === "enum" ||
          field.valueKind === "boolean" ||
          field.valueKind === "reference"
        ? "eq"
        : "contains";
  return field.filterOperators.includes(preferred)
    ? preferred
    : field.filterOperators[0]!;
}

/** Quick-filter fields used when the entity metadata configures none. */
export function fallbackQuickFields(
  fields: readonly ListFieldDescriptorV1[],
): readonly { readonly field: string; readonly defaultOperator: ListFilterOperator }[] {
  return Object.freeze(
    fields
      .filter((field) => field.filterOperators.length)
      .sort(
        (left, right) =>
          quickFilterPriority(left) - quickFilterPriority(right) ||
          left.defaultOrder - right.defaultOrder,
      )
      .slice(0, MAX_FALLBACK_QUICK_FIELDS)
      .map((field) =>
        Object.freeze({
          field: field.key,
          defaultOperator: preferredFilterOperator(field),
        }),
      ),
  );
}
