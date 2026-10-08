import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityListDescriptorV1, EntityListRowV1, ListLocationStateV1, ListTreeV1 } from "@athyper/contract-platform-entity-list";
import {
  TREE_ORPHANS,
  TREE_ROOTS,
  admitPage,
  ceilingState,
  childLevel,
  childrenQuery,
  expandLoaded,
  loadedDepth,
  nodePath,
  orphansQuery,
  recordQuery,
  rootsQuery,
  treeEntries,
  treeOrdered,
  type TreeLevels,
} from "../../packages/platform/entity/runtime/list-view/src/tree/tree-model";

const field = (key: string, valueKind: string, extra: Record<string, unknown> = {}) => ({ key, label: key, valueKind, sortable: true, filterOperators: ["eq", "is_null"], ...extra });
const descriptor = {
  entity: { code: "gl_account", identityField: "code" },
  fields: [field("code", "string"), field("name", "string", { semanticRole: "title" }), field("parent", "reference"), field("seq", "integer"), field("kind", "enum")],
  limits: { maxSortLevels: 3 },
} as unknown as EntityListDescriptorV1;
const tree: ListTreeV1 = { parentField: "parent", orderField: "seq", nodeKind: { field: "kind", branchValues: ["summary"] }, maxDepth: 3 };
const state = { filters: [{ field: "status", operator: "eq", value: "active" }], sort: [{ field: "name", direction: "desc" }], columns: ["code", "seq"], density: "comfortable", mode: "tree", query: "cash" } as unknown as ListLocationStateV1;
const row = (id: string, hasChildren = false, parent?: string): EntityListRowV1 => ({ id, values: { code: id.toUpperCase(), name: `Account ${id}`, ...(parent ? { parent } : {}) }, hasChildren }) as unknown as EntityListRowV1;
const levels = (entries: Record<string, readonly EntityListRowV1[]>, extra: Record<string, object> = {}): TreeLevels =>
  new Map(Object.entries(entries).map(([key, rows]) => [key, { rows, status: "ready" as const, ...(extra[key] ?? {}) }]));

describe("tree queries", () => {
  it("roots and children are the list query plus the parent filter, the declared order, the tree's fields and hierarchy=nodes", () => {
    const roots = rootsQuery(state, descriptor, tree);
    assert.deepEqual(roots.filters, [...state.filters, { field: "parent", operator: "is_null" }]);
    assert.deepEqual(roots.sort, [{ field: "seq", direction: "asc" }, { field: "code", direction: "asc" }]);
    assert.equal(roots.hierarchy, "nodes");
    assert.equal(roots.query, "cash");
    assert.deepEqual(roots.columns, ["code", "seq", "name", "parent", "kind"]);
    const children = childrenQuery(state, descriptor, tree, "a1");
    assert.deepEqual(children.filters.at(-1), { field: "parent", operator: "eq", value: "a1" });
    assert.equal(children.hierarchy, "nodes");
  });

  it("without an order field siblings follow the list's sort, and column sorting stays available", () => {
    const unordered = { ...tree, orderField: undefined };
    assert.deepEqual(rootsQuery(state, descriptor, unordered).sort, state.sort);
    assert.equal(treeOrdered(unordered, descriptor), false);
    assert.equal(treeOrdered(tree, descriptor), true);
  });

  it("orphans are sorted by readable identity and use hierarchy=orphans without a parent filter", () => {
    const orphans = orphansQuery(state, descriptor, tree);
    assert.deepEqual(orphans.sort, [{ field: "code", direction: "asc" }]);
    assert.equal(orphans.hierarchy, "orphans");
    assert.ok(!orphans.filters.some((filter) => filter.field === "parent"));
  });

  it("a deep link resolves one record by ID, with or without the list's search and filters", () => {
    assert.deepEqual(recordQuery(state, descriptor, tree, "x", true).recordIds, ["x"]);
    const unfiltered = recordQuery(state, descriptor, tree, "x", false);
    assert.deepEqual(unfiltered.filters, []);
    assert.equal(unfiltered.query, undefined);
  });
});

describe("tree levels", () => {
  it("draws roots, expanded children, Load more, then the orphans group", () => {
    const loaded = levels(
      { [TREE_ROOTS]: [row("a", true), row("b")], [childLevel("a")]: [row("a1", true, "a")], [TREE_ORPHANS]: [row("z", false, "hidden")] },
      { [TREE_ROOTS]: { nextCursor: "c1", total: 5 } },
    );
    const entries = treeEntries(loaded, new Set(["a"]), true, tree, false);
    assert.deepEqual(entries.map((entry) => [entry.kind, entry.key, entry.level]), [
      ["node", "a", 1], ["node", "a1", 2], ["node", "b", 1], ["more", `more:${TREE_ROOTS}`, 1], ["orphans", TREE_ORPHANS, 1], ["node", "z", 2],
    ]);
    const a = entries[0] as Extract<(typeof entries)[number], { kind: "node" }>;
    assert.equal(a.setsize, 5);
    assert.equal(a.posinset, 1);
    assert.equal(a.expanded, true);
    assert.equal((entries[3] as { remaining?: number }).remaining, 3);
    const z = entries[5] as Extract<(typeof entries)[number], { kind: "node" }>;
    assert.equal(z.orphan, true);
    assert.equal(z.depth, 1);
  });

  it("leaves have no expand control; a node with children at the maximum depth shows the depth limit instead", () => {
    const loaded = levels({ [TREE_ROOTS]: [row("a", true)], [childLevel("a")]: [row("b", true, "a")], [childLevel("b")]: [row("c", true, "b"), row("d", false, "b")] });
    const entries = treeEntries(loaded, new Set(["a", "b", "c"]), true, tree, false).filter((entry) => entry.kind === "node");
    assert.deepEqual(entries.map((entry) => [entry.key, entry.state, entry.expanded]), [["a", "expandable", true], ["b", "expandable", true], ["c", "limit", false], ["d", "leaf", false]]);
  });

  it("an expanded node whose visible children are gone reports it", () => {
    const loaded = levels({ [TREE_ROOTS]: [row("a", true)], [childLevel("a")]: [] });
    const entries = treeEntries(loaded, new Set(["a"]), true, tree, false);
    assert.deepEqual(entries.at(-1), { kind: "message", key: "none:a", level: 2, message: "noChildren" });
  });

  it("expand all loaded and show to level act on loaded nodes only", () => {
    const loaded = levels({ [TREE_ROOTS]: [row("a", true), row("b", true)], [childLevel("a")]: [row("a1", true, "a")], [childLevel("a1")]: [row("a2", false, "a1")] });
    assert.deepEqual([...expandLoaded(loaded, tree)].sort(), ["a", "a1"]);
    assert.deepEqual([...expandLoaded(loaded, tree, 2)], ["a"]);
    assert.equal(loadedDepth(loaded), 3);
    assert.deepEqual(nodePath(loaded, "a2").map((item) => item.id), ["a", "a1", "a2"]);
  });

  it("the node ceiling cuts a page off and marks the level truncated", () => {
    let loaded: TreeLevels = levels({ [TREE_ROOTS]: [row("a", true), row("b")] });
    loaded = admitPage(loaded, childLevel("a"), { rows: [row("c", false, "a"), row("d", false, "a"), row("e", false, "a")], nextCursor: "n" }, false, 4);
    const children = loaded.get(childLevel("a"))!;
    assert.deepEqual(children.rows.map((item) => item.id), ["c", "d"]);
    assert.equal(children.truncated, true);
    assert.equal(children.nextCursor, undefined);
    assert.deepEqual(ceilingState(loaded, 4), { reached: true, capped: true });
  });

  it("reaching the ceiling exactly is a notice only when more pages remain", () => {
    const loaded = levels({ [TREE_ROOTS]: [row("a"), row("b")] });
    assert.deepEqual(ceilingState(loaded, 2), { reached: true, capped: false });
    assert.deepEqual(ceilingState(levels({ [TREE_ROOTS]: [row("a"), row("b")] }, { [TREE_ROOTS]: { nextCursor: "n" } }), 2), { reached: true, capped: true });
  });

  it("an expanded node that the ceiling stops from loading says so", () => {
    const loaded = levels({ [TREE_ROOTS]: [row("a", true)] });
    assert.deepEqual(treeEntries(loaded, new Set(["a"]), true, tree, true).at(-1), { kind: "message", key: "ceiling:a", level: 2, message: "ceiling" });
  });
});
