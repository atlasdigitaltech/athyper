import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { LIST_TREE_PARENT_FIELD_UNAVAILABLE, LIST_TREE_SCOPE_FIELD_UNAVAILABLE, LIST_TREE_SCOPE_UNBOUND, lockedScope, resolveListTree } from "./list-tree.js";
import { parseRecordListParameters } from "./records-routes.js";

const listField = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key, label: key, valueKind, defaultVisible: true, defaultOrder: 0, filterOperators: ["eq", "in", "is_null", "is_not_null"], sortable: true, groupable: false, aggregations: [], ...options,
});
const hierarchy = { parentField: "parent", orderField: "sequence", nodeKind: { kind: "choice" as const, field: "kind", branchValues: ["summary"] }, maxDepth: 6, rollups: [{ field: "budget", aggregate: "sum" as const }] };
const fields = [listField("parent", "reference"), listField("sequence", "integer"), listField("kind", "enum", { statusTones: { summary: "neutral" } }), listField("budget", "money")];

describe("per-viewer Tree resolution", () => {
  it("offers the hierarchy with order, node kind and rollups the viewer can read", () => {
    expect(resolveListTree({ hierarchy, fields, masked: () => false })).toEqual({ tree: {
      parentField: "parent", orderField: "sequence", nodeKind: { kind: "choice", field: "kind", branchValues: ["summary"], tones: { summary: "neutral" } }, maxDepth: 6,
      rollups: [{ field: "budget", aggregate: "sum", label: "budget" }],
    } });
  });

  it("is unavailable when the parent field is masked or lacks eq, in or is_null", () => {
    expect(resolveListTree({ hierarchy, fields, masked: (key) => key === "parent" })).toEqual({ unavailable: LIST_TREE_PARENT_FIELD_UNAVAILABLE });
    expect(resolveListTree({ hierarchy, fields: [listField("parent", "reference", { filterOperators: ["eq"] }), ...fields.slice(1)], masked: () => false })).toEqual({ unavailable: LIST_TREE_PARENT_FIELD_UNAVAILABLE });
  });

  it("omits an order, node-kind or rollup field the viewer cannot read", () => {
    const result = resolveListTree({ hierarchy, fields, masked: (key) => key !== "parent" });
    expect(result).toEqual({ tree: { parentField: "parent", maxDepth: 6 } });
  });

  const scoped = { parentField: "parent", scopeField: "chart", maxDepth: 6 };
  const withChart = [...fields, listField("chart", "reference", { filterOperators: ["eq", "in"] })];
  it("offers a scoped hierarchy only when the viewer can filter by its scope field (T1)", () => {
    expect(resolveListTree({ hierarchy: scoped, fields: withChart, masked: () => false })).toEqual({ tree: { parentField: "parent", scopeField: "chart", maxDepth: 6 } });
    expect(resolveListTree({ hierarchy: scoped, fields: withChart, masked: (key) => key === "chart" })).toEqual({ unavailable: LIST_TREE_SCOPE_FIELD_UNAVAILABLE });
    expect(resolveListTree({ hierarchy: scoped, fields: [...fields, listField("chart", "reference", { filterOperators: ["in"] })], masked: () => false })).toEqual({ unavailable: LIST_TREE_SCOPE_FIELD_UNAVAILABLE });
  });

  it("in a record section, the locked scope must fix the scope field or Tree fails closed (T3)", () => {
    const parent = (field: string) => lockedScope([{ kind: "entity.parent.v1", entityCode: "gl_account", storageSchema: "app", storageObject: "gl_account", predicates: [{ field, value: "c-1" }] }]);
    expect(resolveListTree({ hierarchy: scoped, fields: withChart, masked: () => false, locked: parent("chart") })).toEqual({ tree: { parentField: "parent", scopeField: "chart", scopeLocked: true, maxDepth: 6 } });
    expect(resolveListTree({ hierarchy: scoped, fields: withChart, masked: () => false, locked: parent("owner") })).toEqual({ unavailable: LIST_TREE_SCOPE_UNBOUND });
    expect(lockedScope([])).toEqual({ recordScoped: false, fields: new Set() });
  });

  it("publishes movable only when the service says the hierarchy may move (B4)", () => {
    expect(resolveListTree({ hierarchy: { parentField: "parent", maxDepth: 6 }, fields, masked: () => false, movable: true })).toEqual({ tree: { parentField: "parent", maxDepth: 6, movable: true } });
    expect(resolveListTree({ hierarchy: { parentField: "parent", maxDepth: 6 }, fields, masked: () => false })).toEqual({ tree: { parentField: "parent", maxDepth: 6 } });
  });

  it("publishes a boolean node kind with its branch value (T2)", () => {
    const result = resolveListTree({ hierarchy: { parentField: "parent", nodeKind: { kind: "boolean" as const, field: "postable", branchWhen: false }, maxDepth: 6 }, fields: [...fields, listField("postable", "boolean")], masked: () => false });
    expect(result).toEqual({ tree: { parentField: "parent", nodeKind: { kind: "boolean", field: "postable", branchWhen: false }, maxDepth: 6 } });
  });
});

describe("hierarchy requests", () => {
  it("parse nodes and orphans, and never combine with group", () => {
    expect(parseRecordListParameters({ hierarchy: "nodes" })).toMatchObject({ hierarchy: "nodes" });
    expect(parseRecordListParameters({ hierarchy: "orphans" })).toMatchObject({ hierarchy: "orphans" });
    expect(() => parseRecordListParameters({ hierarchy: "all" })).toThrow();
    expect(() => parseRecordListParameters({ hierarchy: "nodes", group: "kind" })).toThrow(/cannot be combined with group/);
    expect(parseRecordListParameters({ hierarchy: "matches", search: "cash" })).toMatchObject({ hierarchy: "matches" });
    expect(() => parseRecordListParameters({ hierarchy: "matches", cursor: "abc" })).toThrow(/cursor or recordIds/);
    expect(() => parseRecordListParameters({ hierarchy: "matches", recordIds: "7f3c2e1d-4b5a-4c6d-8e9f-000000000001" })).toThrow(/cursor or recordIds/);
  });

  const descriptor = {
    entityCode: "gl_account", planeKey: "neon",
    storage: { schema: "app", object: "gl_account", idField: "id", tenantField: "tenant_id", softDeleteField: "deleted_at" },
    fields: [
      { key: "code", storagePath: "code", type: "string", required: true, writableOn: [], filterable: true },
      { key: "parent", storagePath: "parent_id", type: "reference", required: false, writableOn: [], filterable: true, referenceTargetEntity: "gl_account" },
      { key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true },
    ],
    hierarchy: { parentField: "parent", maxDepth: 6 },
  } as unknown as EntityRuntimeDescriptor;
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
  const seed = () => {
    const persistence = createInMemoryRecordPersistence();
    persistence.seed(descriptor, tenantId, [
      { id: id(1), tenant_id: tenantId, code: "1000", parent_id: null, status: "active" },
      { id: id(2), tenant_id: tenantId, code: "1100", parent_id: id(1), status: "active" },
      { id: id(3), tenant_id: tenantId, code: "2000", parent_id: null, status: "active" },
      // A hidden child (soft-deleted, so outside the visible set) and its own visible child.
      { id: id(4), tenant_id: tenantId, code: "2100", parent_id: id(3), status: "active", deleted_at: "2026-10-01T00:00:00Z" },
      { id: id(5), tenant_id: tenantId, code: "2110", parent_id: id(4), status: "active" },
      { id: id(6), tenant_id: tenantId, code: "3000", parent_id: null, status: "closed" },
      { id: id(7), tenant_id: tenantId, code: "3100", parent_id: id(6), status: "closed" },
    ]);
    return persistence.repository;
  };
  const base = { descriptor, tenantId, limit: 10, sort: [{ field: "code", direction: "asc" as const }], countMode: "none" as const, projection: ["code"], cursorScope: "test", collectionScope: [] };

  it("reports visible children only, so a node whose children are all hidden looks like a leaf", async () => {
    const roots = await seed().list({ ...base, filters: [{ field: "parent", operator: "is_null" }], hierarchy: { mode: "nodes", parentField: "parent" } });
    expect(roots.data.map((row) => row["code"])).toEqual(["1000", "2000", "3000"]);
    expect(roots.hasChildren).toEqual([true, false, true]);
  });

  it("applies the list's own filters to child existence, leaving out the parent filter", async () => {
    const roots = await seed().list({ ...base, filters: [{ field: "parent", operator: "is_null" }, { field: "status", operator: "eq", value: "active" }], hierarchy: { mode: "nodes", parentField: "parent" } });
    expect(roots.data.map((row) => row["code"])).toEqual(["1000", "2000"]);
    expect(roots.hasChildren).toEqual([true, false]);
  });

  it("selects orphans: a set parent that is not in the visible set", async () => {
    const orphans = await seed().list({ ...base, filters: [], hierarchy: { mode: "orphans", parentField: "parent" } });
    expect(orphans.data.map((row) => row["code"])).toEqual(["2110"]);
    expect(orphans.hasChildren).toEqual([false]);
  });

  it("compares the scope for child existence and orphans in a scoped hierarchy (T1)", async () => {
    const scopedDescriptor = {
      ...descriptor,
      fields: [...descriptor.fields, { key: "chart", storagePath: "chart_id", type: "reference", required: true, writableOn: [], filterable: true }],
      hierarchy: { parentField: "parent", scopeField: "chart", maxDepth: 6 },
    } as unknown as EntityRuntimeDescriptor;
    const persistence = createInMemoryRecordPersistence();
    persistence.seed(scopedDescriptor, tenantId, [
      { id: id(1), tenant_id: tenantId, code: "1000", parent_id: null, chart_id: "chart-a", status: "active" },
      { id: id(2), tenant_id: tenantId, code: "1100", parent_id: id(1), chart_id: "chart-a", status: "active" },
      // A row naming a parent in another chart is never that parent's child.
      { id: id(3), tenant_id: tenantId, code: "1100", parent_id: id(1), chart_id: "chart-b", status: "active" },
    ]);
    const scopedBase = { ...base, descriptor: scopedDescriptor };
    const roots = await persistence.repository.list({ ...scopedBase, filters: [{ field: "parent", operator: "is_null" }, { field: "chart", operator: "eq", value: "chart-a" }], hierarchy: { mode: "nodes", parentField: "parent", scopeField: "chart" } });
    expect(roots.hasChildren).toEqual([true]);
    const orphans = await persistence.repository.list({ ...scopedBase, filters: [{ field: "chart", operator: "eq", value: "chart-b" }], hierarchy: { mode: "orphans", parentField: "parent", scopeField: "chart" } });
    expect(orphans.data.map((row) => row["code"])).toEqual(["1100"]);
  });

  it("returns matches with the visible ancestors that place them (B2)", async () => {
    const tree = { mode: "matches" as const, parentField: "parent", maxDepth: 6 };
    const placed = await seed().list({ ...base, filters: [{ field: "code", operator: "eq", value: "1100" }], hierarchy: tree });
    expect(placed.data.map((row) => row["code"])).toEqual(["1100", "1000"]);
    expect(placed.treeRoles).toEqual(["match", "context"]);
    expect(placed.parentOutsideView).toEqual([false, false]);
    expect(placed.hasChildren).toEqual([false, true]);
    // 2110's parent is not visible: the path stops and its top row is marked.
    const hidden = await seed().list({ ...base, filters: [{ field: "code", operator: "eq", value: "2110" }], hierarchy: tree });
    expect(hidden.data.map((row) => row["code"])).toEqual(["2110"]);
    expect(hidden.parentOutsideView).toEqual([true]);
    // A path longer than maxDepth is not returned, only counted.
    const deep = await seed().list({ ...base, filters: [{ field: "code", operator: "eq", value: "1100" }], hierarchy: { ...tree, maxDepth: 1 } });
    expect(deep.data).toEqual([]);
    expect(deep.matchesBeyondDepth).toBe(1);
  });

  it("returns no child flags on ordinary requests", async () => {
    expect((await seed().list({ ...base, filters: [] })).hasChildren).toBeUndefined();
  });
});
