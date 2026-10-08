import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityHierarchy, validateEntityHierarchy } from "./entity-hierarchy-descriptor.js";

const field = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({ key, storagePath: key, type, required: false, writableOn: [], ...extra });
const fields = new Map([
  ["parent", field("parent", "reference", { referenceTargetEntity: "gl_account" })],
  ["other", field("other", "reference", { referenceTargetEntity: "cost_center" })],
  ["sequence", field("sequence", "integer")],
  ["kind", field("kind", "enum", { validation: { options: ["summary", "posting"] } })],
  ["budget", field("budget", "money", { list: { aggregations: ["sum"] } })],
  ["name", field("name", "string")],
]);

describe("published record hierarchy", () => {
  it("parses a Chart of Accounts declaration and accepts it for its own Entity", () => {
    const hierarchy = parseEntityHierarchy({ parentField: "parent", orderField: "sequence", nodeKind: { field: "kind", branchValues: ["summary"] }, maxDepth: 6, rollups: [{ field: "budget", aggregate: "sum" }] });
    expect(() => validateEntityHierarchy("gl_account", hierarchy, ["table", "tree"], fields)).not.toThrow();
  });

  it("rejects a parent field that is not a nullable reference to the same Entity", () => {
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "other", maxDepth: 3 }), ["tree"], fields)).toThrow(/TREE_PARENT_FIELD_NOT_SELF_REFERENCE/);
    const required = new Map(fields).set("parent", field("parent", "reference", { referenceTargetEntity: "gl_account", required: true }));
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", maxDepth: 3 }), ["tree"], required)).toThrow(/TREE_PARENT_FIELD_NOT_NULLABLE/);
  });

  it("checks depth, order, node kind and rollups, and requires a hierarchy for Tree", () => {
    expect(() => parseEntityHierarchy({ parentField: "parent", maxDepth: 17 })).toThrow(/TREE_DEPTH_OUT_OF_RANGE/);
    expect(() => parseEntityHierarchy({ parentField: "parent", maxDepth: 3, rollups: [{ field: "budget", aggregate: "maximum" }] })).toThrow(/sum or count/);
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", orderField: "name", maxDepth: 3 }), ["tree"], fields)).toThrow(/TREE_ORDER_FIELD_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", nodeKind: { field: "kind", branchValues: ["header"] }, maxDepth: 3 }), ["tree"], fields)).toThrow(/TREE_NODE_KIND_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", maxDepth: 3, rollups: [{ field: "budget", aggregate: "count" }] }), ["tree"], fields)).toThrow(/TREE_ROLLUP_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", undefined, ["table", "tree"], fields)).toThrow(/TREE_PARENT_FIELD_REQUIRED/);
    expect(() => parseEntityHierarchy({ parentField: "parent", maxDepth: 3, inferred: true })).toThrow(/not a published hierarchy property/);
  });
});
