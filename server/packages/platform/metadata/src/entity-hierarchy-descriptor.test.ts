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
  ["chart", field("chart", "reference", { referenceTargetEntity: "chart_of_account", required: true })],
  ["postable", field("postable", "boolean")],
]);

describe("published record hierarchy", () => {
  it("parses a Chart of Accounts declaration and accepts it for its own Entity", () => {
    const hierarchy = parseEntityHierarchy({ parentField: "parent", orderField: "sequence", nodeKind: { kind: "choice", field: "kind", branchValues: ["summary"] }, maxDepth: 6, rollups: [{ field: "budget", aggregate: "sum" }] });
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
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "choice", field: "kind", branchValues: ["header"] }, maxDepth: 3 }), ["tree"], fields)).toThrow(/TREE_NODE_KIND_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", maxDepth: 3, rollups: [{ field: "budget", aggregate: "count" }] }), ["tree"], fields)).toThrow(/TREE_ROLLUP_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", undefined, ["table", "tree"], fields)).toThrow(/TREE_PARENT_FIELD_REQUIRED/);
    expect(() => parseEntityHierarchy({ parentField: "parent", maxDepth: 3, inferred: true })).toThrow(/not a published hierarchy property/);
  });

  it("accepts a scope field that is a required reference to the owning record (T1)", () => {
    const hierarchy = parseEntityHierarchy({ parentField: "parent", scopeField: "chart", maxDepth: 6 });
    expect(hierarchy.scopeField).toBe("chart");
    expect(() => validateEntityHierarchy("gl_account", hierarchy, ["tree"], fields)).not.toThrow();
    for (const scopeField of ["other", "parent", "name", "missing"])
      expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", scopeField, maxDepth: 6 }), ["tree"], fields)).toThrow(/TREE_SCOPE_FIELD_INELIGIBLE/);
  });

  it("reads a discriminated node kind: choice or boolean (T2)", () => {
    const boolean = parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "boolean", field: "postable", branchWhen: false }, maxDepth: 6 });
    expect(boolean.nodeKind).toEqual({ kind: "boolean", field: "postable", branchWhen: false });
    expect(() => validateEntityHierarchy("gl_account", boolean, ["tree"], fields)).not.toThrow();
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "boolean", field: "kind", branchWhen: false }, maxDepth: 6 }), ["tree"], fields)).toThrow(/TREE_NODE_KIND_INELIGIBLE/);
    expect(() => validateEntityHierarchy("gl_account", parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "choice", field: "postable", branchValues: ["true"] }, maxDepth: 6 }), ["tree"], fields)).toThrow(/TREE_NODE_KIND_INELIGIBLE/);
    // No kind, a mixed shape or a non-boolean branchWhen is rejected at parse time.
    expect(() => parseEntityHierarchy({ parentField: "parent", nodeKind: { field: "kind", branchValues: ["summary"] }, maxDepth: 6 })).toThrow(/choice or boolean/);
    expect(() => parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "boolean", field: "postable", branchValues: [false] }, maxDepth: 6 })).toThrow(/not a published hierarchy property/);
    expect(() => parseEntityHierarchy({ parentField: "parent", nodeKind: { kind: "boolean", field: "postable", branchWhen: "no" }, maxDepth: 6 })).toThrow(/true or false/);
  });
});
