import type {
  EntityFieldDescriptor,
  EntityHierarchyDescriptor,
  EntityListViewMode,
} from "@athyper/server-contract-metadata";

// The published record hierarchy (Entity list Tree blueprint sections 2.2,
// 5.2 and 6): parsed for structure, then checked against the Entity.

export const ENTITY_HIERARCHY_MAX_DEPTH = 16;
export const ENTITY_HIERARCHY_MAX_ROLLUPS = 5;

function fail(path: string, reason: string): never {
  throw new Error(`${path} ${reason}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "is not a published hierarchy property");
}
function code(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,127}$/.test(value)) fail(path, "must be a field key");
  return value;
}

/** Parses the published hierarchy declaration (structure only). */
export function parseEntityHierarchy(raw: unknown): EntityHierarchyDescriptor {
  const root = "hierarchy";
  const value = record(raw, root);
  only(value, ["parentField", "orderField", "nodeKind", "maxDepth", "rollups"], root);
  const maxDepth = value.maxDepth;
  if (typeof maxDepth !== "number" || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > ENTITY_HIERARCHY_MAX_DEPTH)
    fail(`${root}.maxDepth`, `must be an integer from 1 to ${ENTITY_HIERARCHY_MAX_DEPTH} (TREE_DEPTH_OUT_OF_RANGE)`);
  let nodeKind: EntityHierarchyDescriptor["nodeKind"];
  if (value.nodeKind !== undefined) {
    const item = record(value.nodeKind, `${root}.nodeKind`);
    only(item, ["field", "branchValues"], `${root}.nodeKind`);
    if (!Array.isArray(item.branchValues) || !item.branchValues.length || item.branchValues.some((entry) => typeof entry !== "string" || !entry))
      fail(`${root}.nodeKind.branchValues`, "must list the choices that may have children");
    nodeKind = Object.freeze({ field: code(item.field, `${root}.nodeKind.field`), branchValues: Object.freeze([...new Set(item.branchValues as string[])]) });
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
    ...(value.orderField === undefined ? {} : { orderField: code(value.orderField, `${root}.orderField`) }),
    ...(nodeKind ? { nodeKind } : {}),
    maxDepth,
    ...(rollups ? { rollups } : {}),
  });
}

const NUMERIC = new Set(["integer", "decimal", "money"]);

/** Checks the declaration against the Entity: the parent field is a nullable
 * reference to this same Entity; the order field is an integer; the node kind
 * is an enum whose branch values are published choices; each rollup is a
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
  if (hierarchy.orderField !== undefined && byKey.get(hierarchy.orderField)?.type !== "integer")
    throw new Error(`hierarchy.orderField must be an integer field: ${hierarchy.orderField} (TREE_ORDER_FIELD_INELIGIBLE)`);
  if (hierarchy.nodeKind) {
    const kind = byKey.get(hierarchy.nodeKind.field);
    const options = kind?.validation?.["options"];
    const values = new Set(Array.isArray(options) ? options.map((option) => (option && typeof option === "object" ? String(Reflect.get(option, "value")) : String(option))) : []);
    if (!kind || kind.type !== "enum" || hierarchy.nodeKind.branchValues.some((value) => !values.has(value)))
      throw new Error(`hierarchy.nodeKind must be an enum whose branch values are published choices: ${hierarchy.nodeKind.field} (TREE_NODE_KIND_INELIGIBLE)`);
  }
  for (const rollup of hierarchy.rollups ?? []) {
    const field = byKey.get(rollup.field);
    if (!field || !NUMERIC.has(field.type) || !(field.list?.aggregations ?? []).includes(rollup.aggregate))
      throw new Error(`hierarchy.rollups must use a numeric field that publishes the aggregate: ${rollup.field} ${rollup.aggregate} (TREE_ROLLUP_INELIGIBLE)`);
  }
}
