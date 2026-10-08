import { LIST_LAYOUT_TONES, type ListCalendarTone } from "./date-range";
import { allowKeys, fail, member, record, text } from "./layout-parse";

/** The record hierarchy this viewer can browse in the Tree layout (Entity
 * list Tree blueprint section 5.3). A masked node-kind field is omitted by
 * the server; a masked parent field makes Tree unavailable. */
export interface ListTreeV1 {
  readonly parentField: string;
  readonly orderField?: string;
  readonly nodeKind?: {
    readonly field: string;
    /** Choices that may have children; other choices are leaves. */
    readonly branchValues: readonly string[];
    readonly tones?: Readonly<Record<string, ListCalendarTone>>;
  };
  readonly maxDepth: number;
  /** Declared rollups; values arrive with Phase B3. */
  readonly rollups?: readonly { readonly field: string; readonly aggregate: "sum" | "count"; readonly label: string }[];
}

export const LIST_TREE_MAX_DEPTH = 16;
/** Loaded nodes the Tree layout draws at most (section 7.2). */
export const LIST_TREE_NODE_CEILING = 500;

/** A `tree.node` deep-link value: a routing identity, never displayed. */
export function isListTreeNode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Parses the browser Tree projection. */
export function parseListTree(
  raw: unknown,
  fields: ReadonlyMap<string, { readonly valueKind: string }>,
): ListTreeV1 {
  const value = record(raw, "surface.tree");
  allowKeys(value, ["parentField", "orderField", "nodeKind", "maxDepth", "rollups"], "surface.tree", "Tree");
  const parentField = text(value.parentField, "surface.tree.parentField");
  if (fields.get(parentField)?.valueKind !== "reference") fail("surface.tree.parentField", "must be a listed reference field");
  const orderField = value.orderField === undefined ? undefined : text(value.orderField, "surface.tree.orderField");
  if (orderField !== undefined && fields.get(orderField)?.valueKind !== "integer") fail("surface.tree.orderField", "must be a listed integer field");
  if (typeof value.maxDepth !== "number" || !Number.isInteger(value.maxDepth) || value.maxDepth < 1 || value.maxDepth > LIST_TREE_MAX_DEPTH)
    fail("surface.tree.maxDepth", `must be an integer from 1 to ${LIST_TREE_MAX_DEPTH}`);
  let nodeKind: ListTreeV1["nodeKind"];
  if (value.nodeKind !== undefined) {
    const item = record(value.nodeKind, "surface.tree.nodeKind");
    allowKeys(item, ["field", "branchValues", "tones"], "surface.tree.nodeKind", "Tree");
    const field = text(item.field, "surface.tree.nodeKind.field");
    if (fields.get(field)?.valueKind !== "enum") fail("surface.tree.nodeKind.field", "must be a listed enum field");
    if (!Array.isArray(item.branchValues)) fail("surface.tree.nodeKind.branchValues", "must be an array");
    const branchValues = (item.branchValues as unknown[]).map((entry, index) => text(entry, `surface.tree.nodeKind.branchValues[${index}]`));
    let tones: Record<string, ListCalendarTone> | undefined;
    if (item.tones !== undefined) {
      tones = {};
      for (const [key, tone] of Object.entries(record(item.tones, "surface.tree.nodeKind.tones")))
        tones[key] = member(tone, LIST_LAYOUT_TONES, `surface.tree.nodeKind.tones.${key}`, "must be a published tone");
    }
    nodeKind = Object.freeze({ field, branchValues: Object.freeze(branchValues), ...(tones ? { tones: Object.freeze(tones) } : {}) });
  }
  let rollups: ListTreeV1["rollups"];
  if (value.rollups !== undefined) {
    if (!Array.isArray(value.rollups)) fail("surface.tree.rollups", "must be an array");
    rollups = Object.freeze((value.rollups as unknown[]).map((entry, index) => {
      const item = record(entry, `surface.tree.rollups[${index}]`);
      allowKeys(item, ["field", "aggregate", "label"], `surface.tree.rollups[${index}]`, "Tree");
      return Object.freeze({
        field: text(item.field, `surface.tree.rollups[${index}].field`),
        aggregate: member(item.aggregate, ["sum", "count"] as const, `surface.tree.rollups[${index}].aggregate`, "must be sum or count"),
        label: text(item.label, `surface.tree.rollups[${index}].label`),
      });
    }));
  }
  return Object.freeze({
    parentField,
    ...(orderField ? { orderField } : {}),
    ...(nodeKind ? { nodeKind } : {}),
    maxDepth: value.maxDepth as number,
    ...(rollups ? { rollups } : {}),
  });
}
