import type { ListFieldDescriptorV1, ListTreeV1 } from "@athyper/contract-platform-entity-list";
import type { EntityHierarchyDescriptor } from "@athyper/server-contract-metadata";

export const LIST_TREE_PARENT_FIELD_UNAVAILABLE = "LIST_TREE_PARENT_FIELD_UNAVAILABLE";

export type ListTreeResolution =
  | { readonly tree: ListTreeV1 }
  | { readonly unavailable: typeof LIST_TREE_PARENT_FIELD_UNAVAILABLE };

const NUMERIC = new Set(["integer", "decimal", "money"]);

/** Resolves the published hierarchy for one viewer (Entity list Tree
 * blueprint sections 2.2 and 6). Tree is usable only when the parent field is
 * listed for the viewer, unmasked and filterable with `eq`, `in` and
 * `is_null`, so every roots, children and orphans query is admissible. An
 * order, node-kind or rollup field the viewer cannot read is omitted: siblings
 * then follow the list's default sort, rows show no kind, and the rollup is
 * not offered. */
export function resolveListTree(input: {
  readonly hierarchy: EntityHierarchyDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly masked: (key: string) => boolean;
}): ListTreeResolution {
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const readable = (key: string) => {
    const field = listed.get(key);
    return field && !input.masked(key) ? field : undefined;
  };
  const parent = readable(input.hierarchy.parentField);
  if (!parent || !["eq", "in", "is_null"].every((operator) => parent.filterOperators.includes(operator as never)))
    return { unavailable: LIST_TREE_PARENT_FIELD_UNAVAILABLE };
  const order = input.hierarchy.orderField ? readable(input.hierarchy.orderField) : undefined;
  const kind = input.hierarchy.nodeKind ? readable(input.hierarchy.nodeKind.field) : undefined;
  const rollups = (input.hierarchy.rollups ?? []).flatMap((rollup) => {
    const field = readable(rollup.field);
    return field && NUMERIC.has(field.valueKind) ? [Object.freeze({ field: rollup.field, aggregate: rollup.aggregate, label: field.label })] : [];
  });
  return {
    tree: Object.freeze({
      parentField: parent.key,
      ...(order && order.sortable ? { orderField: order.key } : {}),
      ...(kind && input.hierarchy.nodeKind
        ? {
            nodeKind: Object.freeze({
              field: kind.key,
              branchValues: input.hierarchy.nodeKind.branchValues,
              ...(kind.statusTones ? { tones: kind.statusTones } : {}),
            }),
          }
        : {}),
      maxDepth: input.hierarchy.maxDepth,
      ...(rollups.length ? { rollups: Object.freeze(rollups) } : {}),
    }),
  };
}
