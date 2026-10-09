import type {
  EntityFieldDescriptor,
  EntityHierarchyDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";
import { LIST_TREE_MAX_DEPTH } from "@athyper/contract-platform-entity-list";
import { fail, only as layoutOnly, record } from "./list-date-range-descriptor.js";

// The published record hierarchy (Entity list Tree blueprint sections 2.2,
// 5.2 and 6): parsed for structure, then checked against the Entity.

export const ENTITY_HIERARCHY_MAX_DEPTH = LIST_TREE_MAX_DEPTH;
export const ENTITY_HIERARCHY_MAX_ROLLUPS = 5;

function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  layoutOnly(value, keys, path, "hierarchy");
}
function code(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,127}$/.test(value)) fail(path, "must be a field key");
  return value;
}

/** Parses the published hierarchy declaration (structure only). */
export function parseEntityHierarchy(raw: unknown): EntityHierarchyDescriptor {
  const root = "hierarchy";
  const value = record(raw, root);
  only(value, ["parentField", "scopeField", "orderField", "nodeKind", "maxDepth", "rollups", "movable"], root);
  if (value.movable !== undefined && value.movable !== true) fail(`${root}.movable`, "must be true when present");
  const maxDepth = value.maxDepth;
  if (typeof maxDepth !== "number" || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > ENTITY_HIERARCHY_MAX_DEPTH)
    fail(`${root}.maxDepth`, `must be an integer from 1 to ${ENTITY_HIERARCHY_MAX_DEPTH} (TREE_DEPTH_OUT_OF_RANGE)`);
  let nodeKind: EntityHierarchyDescriptor["nodeKind"];
  if (value.nodeKind !== undefined) {
    // Discriminated, so the declaration says which kind of field it reads.
    const item = record(value.nodeKind, `${root}.nodeKind`);
    if (item.kind === "choice") {
      only(item, ["kind", "field", "branchValues"], `${root}.nodeKind`);
      if (!Array.isArray(item.branchValues) || !item.branchValues.length || item.branchValues.some((entry) => typeof entry !== "string" || !entry))
        fail(`${root}.nodeKind.branchValues`, "must list the choices that may have children");
      nodeKind = Object.freeze({ kind: "choice" as const, field: code(item.field, `${root}.nodeKind.field`), branchValues: Object.freeze([...new Set(item.branchValues as string[])]) });
    } else if (item.kind === "boolean") {
      only(item, ["kind", "field", "branchWhen"], `${root}.nodeKind`);
      if (typeof item.branchWhen !== "boolean") fail(`${root}.nodeKind.branchWhen`, "must be true or false");
      nodeKind = Object.freeze({ kind: "boolean" as const, field: code(item.field, `${root}.nodeKind.field`), branchWhen: item.branchWhen });
    } else fail(`${root}.nodeKind.kind`, "must be choice or boolean (TREE_NODE_KIND_INELIGIBLE)");
  }
  let rollups: EntityHierarchyDescriptor["rollups"];
  if (value.rollups !== undefined) {
    if (!Array.isArray(value.rollups) || value.rollups.length > ENTITY_HIERARCHY_MAX_ROLLUPS)
      fail(`${root}.rollups`, `must list at most ${ENTITY_HIERARCHY_MAX_ROLLUPS} rollups (TREE_ROLLUP_LIMIT)`);
    rollups = Object.freeze((value.rollups as unknown[]).map((entry, index) => {
      const item = record(entry, `${root}.rollups[${index}]`);
      only(item, ["field", "aggregate"], `${root}.rollups[${index}]`);
      if (item.aggregate !== "sum" && item.aggregate !== "count")
        fail(`${root}.rollups[${index}].aggregate`, "must be sum or count (TREE_ROLLUP_INELIGIBLE)");
      return Object.freeze({ field: code(item.field, `${root}.rollups[${index}].field`), aggregate: item.aggregate });
    }));
  }
  return Object.freeze({
    parentField: code(value.parentField, `${root}.parentField`),
    ...(value.scopeField === undefined ? {} : { scopeField: code(value.scopeField, `${root}.scopeField`) }),
    ...(value.orderField === undefined ? {} : { orderField: code(value.orderField, `${root}.orderField`) }),
    ...(nodeKind ? { nodeKind } : {}),
    maxDepth,
    ...(rollups ? { rollups } : {}),
    ...(value.movable === true ? { movable: true as const } : {}),
  });
}

const NUMERIC = new Set(["integer", "decimal", "money"]);

/** Checks the declaration against the Entity: the parent field is a nullable
 * reference to this same Entity; a scope field is a required reference to
 * another Entity; the order field is an integer; a choice node kind is an enum
 * whose branch values are published choices, a boolean one reads a boolean; each rollup is a
 * numeric field that publishes that aggregate; and Tree is declared exactly
 * when a hierarchy is. */
export function validateEntityHierarchy(
  entityCode: string,
  hierarchy: EntityHierarchyDescriptor | undefined,
  supportedModes: readonly EntityListViewMode[] | undefined,
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if ((supportedModes?.includes("tree") === true) && !hierarchy)
    throw new Error("listPresentation.supportedModes declares tree without a hierarchy (TREE_PARENT_FIELD_REQUIRED)");
  if (!hierarchy) return;
  const parent = byKey.get(hierarchy.parentField);
  if (!parent || parent.type !== "reference" || parent.referenceTargetEntity !== entityCode)
    throw new Error(`hierarchy.parentField must reference this same Entity: ${hierarchy.parentField} (TREE_PARENT_FIELD_NOT_SELF_REFERENCE)`);
  if (parent.required)
    throw new Error(`hierarchy.parentField must be nullable, so records without a parent are roots: ${hierarchy.parentField} (TREE_PARENT_FIELD_NOT_NULLABLE)`);
  if (hierarchy.scopeField !== undefined) {
    // The owner every node of one tree shares. Whether the parent key really
    // includes it is a DDL fact, checked at onboarding (blueprint section 2.4).
    const scope = byKey.get(hierarchy.scopeField);
    if (!scope || scope.type !== "reference" || !scope.required || scope.key === hierarchy.parentField || scope.referenceTargetEntity === entityCode)
      throw new Error(`hierarchy.scopeField must be a required reference to the owning record: ${hierarchy.scopeField} (TREE_SCOPE_FIELD_INELIGIBLE)`);
  }
  if (hierarchy.orderField !== undefined && byKey.get(hierarchy.orderField)?.type !== "integer")
    throw new Error(`hierarchy.orderField must be an integer field: ${hierarchy.orderField} (TREE_ORDER_FIELD_INELIGIBLE)`);
  if (hierarchy.nodeKind) {
    const declared = hierarchy.nodeKind;
    const kind = byKey.get(declared.field);
    if (declared.kind === "boolean") {
      if (!kind || kind.type !== "boolean")
        throw new Error(`hierarchy.nodeKind of kind boolean must read a boolean field: ${declared.field} (TREE_NODE_KIND_INELIGIBLE)`);
    } else {
      const options = kind?.validation?.["options"];
      const values = new Set(Array.isArray(options) ? options.map((option) => (option && typeof option === "object" ? String(Reflect.get(option, "value")) : String(option))) : []);
      if (!kind || kind.type !== "enum" || declared.branchValues.some((value) => !values.has(value)))
        throw new Error(`hierarchy.nodeKind of kind choice must be an enum whose branch values are published choices: ${declared.field} (TREE_NODE_KIND_INELIGIBLE)`);
    }
  }
  if (hierarchy.movable && !parent.writableOn.includes("patch"))
    throw new Error(`hierarchy.movable needs a parent field writable on patch: ${hierarchy.parentField} (TREE_MOVABLE_INELIGIBLE)`);
  for (const rollup of hierarchy.rollups ?? []) {
    const field = byKey.get(rollup.field);
    if (!field || !NUMERIC.has(field.type) || !(field.list?.aggregations ?? []).includes(rollup.aggregate))
      throw new Error(`hierarchy.rollups must use a numeric field that publishes the aggregate: ${rollup.field} ${rollup.aggregate} (TREE_ROLLUP_INELIGIBLE)`);
  }
}

/** The DDL side of `movable` (blueprint section 2.4, item 7): a hierarchy may
 * be declared movable only when the database guards the table against cycles
 * (for example `trg_guard_organization_hierarchy_cycle` or a table-specific
 * validator). The published descriptor cannot see triggers, so this runs with
 * the DDL inspection beside {@link hierarchyParentKeyFinding}. */
export function hierarchyMovableFinding(input: {
  readonly hierarchy: EntityHierarchyDescriptor;
  /** The DDL inspection found a cycle guard on the table's parent column. */
  readonly cycleGuarded: boolean;
}): "TREE_MOVABLE_UNGUARDED" | undefined {
  return input.hierarchy.movable && !input.cycleGuarded ? "TREE_MOVABLE_UNGUARDED" : undefined;
}

/** The DDL side of the hierarchy declaration (blueprint section 2.4, item 1):
 * the parent's foreign key decides whether a scope field is required. Given
 * the storage columns of the parent foreign key, returns the finding, or
 * undefined when the declaration matches it. The published descriptor does not
 * carry foreign keys, so this runs where the DDL is known: the onboarding DDL
 * rehearsal now, and Studio validation once authoring storage lands. */
export function hierarchyParentKeyFinding(input: {
  readonly hierarchy: EntityHierarchyDescriptor;
  readonly byKey: ReadonlyMap<string, EntityFieldDescriptor>;
  /** Storage columns of the parent foreign key, in any order. */
  readonly parentKeyColumns: readonly string[];
  readonly tenantColumn?: string;
}): "TREE_PARENT_FIELD_NOT_SELF_REFERENCE" | "TREE_SCOPE_FIELD_REQUIRED" | "TREE_SCOPE_FIELD_INELIGIBLE" | undefined {
  const parent = input.byKey.get(input.hierarchy.parentField)?.storagePath;
  if (!parent || !input.parentKeyColumns.includes(parent)) return "TREE_PARENT_FIELD_NOT_SELF_REFERENCE";
  const owners = input.parentKeyColumns.filter((column) => column !== parent && column !== input.tenantColumn);
  const scope = input.hierarchy.scopeField ? input.byKey.get(input.hierarchy.scopeField)?.storagePath : undefined;
  // A scope is accepted only when the key itself proves parent and child share
  // it. If the foreign key has no owner column, a child can name a parent in
  // another scope and a single-scope filter would still draw them as one tree,
  // so a scope field on such a table is refused rather than trusted. Relaxing
  // this needs a database guarantee, not a declaration.
  if (!owners.length) return input.hierarchy.scopeField ? "TREE_SCOPE_FIELD_INELIGIBLE" : undefined;
  if (owners.length > 1) return "TREE_SCOPE_FIELD_INELIGIBLE";
  if (!input.hierarchy.scopeField) return "TREE_SCOPE_FIELD_REQUIRED";
  return scope === owners[0] ? undefined : "TREE_SCOPE_FIELD_INELIGIBLE";
}
