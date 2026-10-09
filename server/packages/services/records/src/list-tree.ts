import type { ListFieldDescriptorV1, ListTreeV1 } from "@athyper/contract-platform-entity-list";
import type { EntityHierarchyDescriptor } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeConstraint } from "@athyper/server-contract-records";

export const LIST_TREE_PARENT_FIELD_UNAVAILABLE = "LIST_TREE_PARENT_FIELD_UNAVAILABLE";
export const LIST_TREE_SCOPE_FIELD_UNAVAILABLE = "LIST_TREE_SCOPE_FIELD_UNAVAILABLE";
export const LIST_TREE_SCOPE_UNBOUND = "LIST_TREE_SCOPE_UNBOUND";

export type ListTreeResolution =
  | { readonly tree: ListTreeV1 }
  | { readonly unavailable: typeof LIST_TREE_PARENT_FIELD_UNAVAILABLE | typeof LIST_TREE_SCOPE_FIELD_UNAVAILABLE | typeof LIST_TREE_SCOPE_UNBOUND };

/** The fields a locked record scope fixes: the predicates of the server-
 * resolved parent scope of an embedded record section (foundation section 8).
 * `recordScoped` is true whenever such a scope applies. */
export function lockedScope(constraints: readonly RecordCollectionScopeConstraint[]): { readonly recordScoped: boolean; readonly fields: ReadonlySet<string> } {
  const parent = constraints.filter((constraint) => constraint.kind === "entity.parent.v1");
  return {
    recordScoped: parent.length > 0,
    fields: new Set(parent.flatMap((constraint) => ("predicates" in constraint ? constraint.predicates.map((predicate) => predicate.field) : []))),
  };
}

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
  /** The list's locked record scope, when it is an embedded record section. */
  readonly locked?: { readonly recordScoped: boolean; readonly fields: ReadonlySet<string> };
  /** The hierarchy is movable and its parent field is writable on patch (B4). */
  readonly movable?: boolean;
}): ListTreeResolution {
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const readable = (key: string) => {
    const field = listed.get(key);
    return field && !input.masked(key) ? field : undefined;
  };
  const parent = readable(input.hierarchy.parentField);
  if (!parent || !["eq", "in", "is_null"].every((operator) => parent.filterOperators.includes(operator as never)))
    return { unavailable: LIST_TREE_PARENT_FIELD_UNAVAILABLE };
  // A scoped hierarchy (T1) draws one owner's tree: the viewer must be able to
  // filter by the scope field, and a record section's locked scope must fix it
  // or Tree fails closed there (foundation section 8).
  const scopeKey = input.hierarchy.scopeField;
  const scope = scopeKey ? readable(scopeKey) : undefined;
  if (scopeKey && (!scope || !scope.filterOperators.includes("eq" as never)))
    return { unavailable: LIST_TREE_SCOPE_FIELD_UNAVAILABLE };
  const scopeLocked = Boolean(scopeKey && input.locked?.fields.has(scopeKey));
  if (scopeKey && input.locked?.recordScoped && !scopeLocked) return { unavailable: LIST_TREE_SCOPE_UNBOUND };
  const order = input.hierarchy.orderField ? readable(input.hierarchy.orderField) : undefined;
  const declaredKind = input.hierarchy.nodeKind;
  const kindField = declaredKind ? readable(declaredKind.field) : undefined;
  const kind = kindField && declaredKind && kindField.valueKind === (declaredKind.kind === "boolean" ? "boolean" : "enum") ? kindField : undefined;
  const rollups = (input.hierarchy.rollups ?? []).flatMap((rollup) => {
    const field = readable(rollup.field);
    return field && NUMERIC.has(field.valueKind) ? [Object.freeze({ field: rollup.field, aggregate: rollup.aggregate, label: field.label })] : [];
  });
  return {
    tree: Object.freeze({
      parentField: parent.key,
      ...(scopeKey ? { scopeField: scopeKey } : {}),
      ...(scopeLocked ? { scopeLocked: true as const } : {}),
      ...(order && order.sortable ? { orderField: order.key } : {}),
      ...(kind && declaredKind
        ? {
            nodeKind: Object.freeze(
              declaredKind.kind === "boolean"
                ? { kind: "boolean" as const, field: kind.key, branchWhen: declaredKind.branchWhen }
                : {
                    kind: "choice" as const,
                    field: kind.key,
                    branchValues: declaredKind.branchValues,
                    ...(kind.statusTones ? { tones: kind.statusTones } : {}),
                  },
            ),
          }
        : {}),
      maxDepth: input.hierarchy.maxDepth,
      ...(input.movable ? { movable: true as const } : {}),
      ...(rollups.length ? { rollups: Object.freeze(rollups) } : {}),
    }),
  };
}
