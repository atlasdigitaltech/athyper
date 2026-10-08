import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { LIST_TREE_PARENT_FIELD_UNAVAILABLE, resolveListTree } from "./list-tree.js";
import { parseRecordListParameters } from "./records-routes.js";

const listField = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key, label: key, valueKind, defaultVisible: true, defaultOrder: 0, filterOperators: ["eq", "in", "is_null", "is_not_null"], sortable: true, groupable: false, aggregations: [], ...options,
});
const hierarchy = { parentField: "parent", orderField: "sequence", nodeKind: { field: "kind", branchValues: ["summary"] }, maxDepth: 6, rollups: [{ field: "budget", aggregate: "sum" as const }] };
const fields = [listField("parent", "reference"), listField("sequence", "integer"), listField("kind", "enum", { statusTones: { summary: "neutral" } }), listField("budget", "money")];

describe("per-viewer Tree resolution", () => {
  it("offers the hierarchy with order, node kind and rollups the viewer can read", () => {
    expect(resolveListTree({ hierarchy, fields, masked: () => false })).toEqual({ tree: {
      parentField: "parent", orderField: "sequence", nodeKind: { field: "kind", branchValues: ["summary"], tones: { summary: "neutral" } }, maxDepth: 6,
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
});

describe("hierarchy requests", () => {
  it("parse nodes and orphans, and never combine with group", () => {
    expect(parseRecordListParameters({ hierarchy: "nodes" })).toMatchObject({ hierarchy: "nodes" });
    expect(parseRecordListParameters({ hierarchy: "orphans" })).toMatchObject({ hierarchy: "orphans" });
    expect(() => parseRecordListParameters({ hierarchy: "all" })).toThrow();
    expect(() => parseRecordListParameters({ hierarchy: "nodes", group: "kind" })).toThrow(/cannot be combined with group/);
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

  it("returns no child flags on ordinary requests", async () => {
    expect((await seed().list({ ...base, filters: [] })).hasChildren).toBeUndefined();
  });
});
