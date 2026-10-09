import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  ListFilterV1,
  ListLocationStateV1,
  ListSortV1,
  ListTreeV1,
} from "@athyper/contract-platform-entity-list";
import type { EntityListQueryState } from "@athyper/platform-api-client";

// The Tree layout's query and state model (Tree blueprint sections 7.2 and 8).
// Every level is an ordinary list query; nothing here reads a hidden record.

/** A Tree query: the list's own state plus the request-level hierarchy mode. */
export type TreeQueryState = ListLocationStateV1 & EntityListQueryState;

/** Siblings follow the declared order field and then the readable identity;
 * without an order field they follow the list's own sort. The server always
 * ends with the record ID, so paging is stable either way. */
export function treeSort(tree: ListTreeV1, descriptor: EntityListDescriptorV1, sort: readonly ListSortV1[]): readonly ListSortV1[] {
  const sortable = (key: string) => descriptor.fields.some((field) => field.key === key && field.sortable);
  if (!tree.orderField || !sortable(tree.orderField)) return sort;
  const identity = descriptor.entity.identityField;
  return descriptor.limits.maxSortLevels > 1 && identity !== tree.orderField && sortable(identity)
    ? [{ field: tree.orderField, direction: "asc" }, { field: identity, direction: "asc" }]
    : [{ field: tree.orderField, direction: "asc" }];
}

/** Whether the declared order field decides sibling order (column sorting is
 * then not offered in Tree). */
export function treeOrdered(tree: ListTreeV1, descriptor: EntityListDescriptorV1): boolean {
  return Boolean(tree.orderField && descriptor.fields.some((field) => field.key === tree.orderField && field.sortable));
}

/** The list's columns plus the fields the tree itself reads: the readable
 * identity and title (the label), the parent field and the node-kind field.
 * The server returns only requested fields. */
export function treeColumns(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1): readonly string[] {
  const listed = new Set(descriptor.fields.map((field) => field.key));
  const title = descriptor.fields.find((field) => field.semanticRole === "title")?.key;
  const wanted = [descriptor.entity.identityField, title, tree.parentField, tree.scopeField, tree.nodeKind?.field];
  return [...new Set([...state.columns, ...wanted.filter((key): key is string => Boolean(key && listed.has(key)))])];
}

function levelQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1, parentFilter: ListFilterV1): TreeQueryState {
  return {
    ...state,
    filters: [...state.filters.filter((filter) => filter.field !== tree.parentField), parentFilter],
    sort: treeSort(tree, descriptor, state.sort),
    columns: treeColumns(state, descriptor, tree),
    groups: undefined,
    cursor: undefined,
    pageIndex: undefined,
    hierarchy: "nodes",
  };
}

/** The top level: records without a parent. */
export function rootsQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1): TreeQueryState {
  return levelQuery(state, descriptor, tree, { field: tree.parentField, operator: "is_null" });
}

/** The children of one node. */
export function childrenQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1, parentId: string): TreeQueryState {
  return levelQuery(state, descriptor, tree, { field: tree.parentField, operator: "eq", value: parentId });
}

/** Visible records whose parent the viewer cannot read, sorted by readable
 * identity: an order value is meaningful only among real siblings. */
export function orphansQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1): TreeQueryState {
  const identity = descriptor.fields.find((field) => field.key === descriptor.entity.identityField);
  return {
    ...state,
    filters: state.filters.filter((filter) => filter.field !== tree.parentField),
    sort: identity?.sortable ? [{ field: identity.key, direction: "asc" }] : [],
    columns: treeColumns(state, descriptor, tree),
    groups: undefined,
    cursor: undefined,
    pageIndex: undefined,
    hierarchy: "orphans",
  };
}

/** One record by ID with its hierarchy fields, for resolving a deep link's
 * path. `filtered` keeps the list's search and filters (what the tree shows). */
export function recordQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1, id: string, filtered: boolean): TreeQueryState {
  return {
    ...state,
    ...(filtered ? {} : { query: undefined, filters: [] }),
    sort: treeSort(tree, descriptor, state.sort),
    columns: treeColumns(state, descriptor, tree),
    groups: undefined,
    cursor: undefined,
    pageIndex: undefined,
    hierarchy: "nodes",
    recordIds: [id],
  };
}

/** A scoped hierarchy (T1) draws one owner's tree: the list's locked record
 * scope fixes the scope field, or the list has exactly one `eq` filter on it.
 * An unscoped hierarchy is always satisfied. */
export function treeScopeSatisfied(state: Pick<ListLocationStateV1, "filters">, tree: ListTreeV1): boolean {
  if (!tree.scopeField || tree.scopeLocked) return true;
  const scope = state.filters.filter((filter) => filter.field === tree.scopeField);
  return scope.length === 1 && scope[0]!.operator === "eq";
}

/** The list's page query in Tree mode is the roots query, so the list's own
 * authority, error and retry handling cover the top level. Without one scope
 * value it stays the ordinary list query: its rows decide only the empty state
 * and no tree request is sent. */
export function treePageState(state: ListLocationStateV1, descriptor: EntityListDescriptorV1): ListLocationStateV1 | TreeQueryState {
  const tree = descriptor.surface.tree;
  if (state.mode !== "tree" || !tree || !treeScopeSatisfied(state, tree)) return state;
  return treeConstrained(state, descriptor, tree) ? matchesQuery(state, descriptor, tree) : rootsQuery(state, descriptor, tree);
}

/** Whether the list has a search or a filter of its own (not the parent or
 * scope filter): then Tree shows matches with their paths (B2, section 7.3),
 * the same rule the server applies (`LIST_TREE_MATCHES_UNCONSTRAINED`). */
export function treeConstrained(state: Pick<ListLocationStateV1, "filters" | "query">, descriptor: EntityListDescriptorV1, tree: ListTreeV1): boolean {
  const query = state.query?.trim() ?? "";
  return (
    (query.length > 0 && query.length >= descriptor.surface.search.minimumQueryLength) ||
    state.filters.some((filter) => filter.field !== tree.parentField && filter.field !== tree.scopeField)
  );
}

/** One request for the matches and the ancestors that place them, sorted by
 * readable identity; the server caps it at 500 matches. */
export function matchesQuery(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, tree: ListTreeV1): TreeQueryState {
  const identity = descriptor.fields.find((field) => field.key === descriptor.entity.identityField);
  return {
    ...state,
    filters: state.filters.filter((filter) => filter.field !== tree.parentField),
    sort: identity?.sortable ? [{ field: identity.key, direction: "asc" }] : [],
    columns: treeColumns(state, descriptor, tree),
    groups: undefined,
    cursor: undefined,
    pageIndex: undefined,
    hierarchy: "matches",
  };
}

/** The levels a matches response draws: each row under its returned parent;
 * paths that reach a root at the top; paths stopped by an unreadable parent in
 * the outside-your-view group. Every row with returned children starts
 * expanded, so each match is seen in context. */
export function levelsFromMatches(rows: readonly EntityListRowV1[], tree: ListTreeV1): { readonly levels: TreeLevels; readonly expanded: ReadonlySet<string> } {
  const ids = new Set(rows.map((row) => row.id));
  // A row with returned children expands to them, whatever its filtered child
  // existence says: a context ancestor rarely matches the search itself.
  const parents = new Set(rows.flatMap((row) => {
    const parent = parentIdOf(row, tree);
    return parent && ids.has(parent) ? [parent] : [];
  }));
  rows = rows.map((row) => (parents.has(row.id) && row.hasChildren !== true ? { ...row, hasChildren: true } : row));
  const roots: EntityListRowV1[] = [];
  const orphans: EntityListRowV1[] = [];
  const children = new Map<string, EntityListRowV1[]>();
  for (const row of rows) {
    const parent = parentIdOf(row, tree);
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), row]);
    else if (row.parentOutsideView) orphans.push(row);
    else roots.push(row);
  }
  const levels = new Map<string, TreeLevel>([
    [TREE_ROOTS, { rows: roots, status: "ready" }],
    [TREE_ORPHANS, { rows: orphans, status: "ready" }],
  ]);
  for (const [parent, list] of children) levels.set(childLevel(parent), { rows: list, status: "ready" });
  return { levels, expanded: new Set(children.keys()) };
}

/** Whether a row may have children by its declared node kind (T2). */
export function branchByKind(row: EntityListRowV1, tree: ListTreeV1): boolean | undefined {
  const kind = tree.nodeKind;
  if (!kind) return undefined;
  const value = row.values[kind.field];
  if (kind.kind === "boolean") return typeof value === "boolean" ? value === kind.branchWhen : undefined;
  return typeof value === "string" ? kind.branchValues.includes(value) : undefined;
}

/** The parent identifier a row carries (internal; never displayed). */
export function parentIdOf(row: EntityListRowV1, tree: ListTreeV1): string | undefined {
  const value = row.values[tree.parentField];
  return typeof value === "string" && value ? value : undefined;
}

// ---------------------------------------------------------------------------
// Loaded levels

export const TREE_ROOTS = "roots";
export const TREE_ORPHANS = "orphans";
/** The level holding a node's children. */
export const childLevel = (id: string) => `n:${id}`;

/** One loaded level: the roots, the orphans or one node's children. */
export interface TreeLevel {
  readonly rows: readonly EntityListRowV1[];
  readonly status: "loading" | "ready" | "failed";
  readonly nextCursor?: string;
  /** Only under exact counts (foundation section 5). */
  readonly total?: number;
  /** Rows were cut off by the node ceiling. */
  readonly truncated?: boolean;
}
export type TreeLevels = ReadonlyMap<string, TreeLevel>;

export function loadedCount(levels: TreeLevels): number {
  let count = 0;
  for (const level of levels.values()) count += level.rows.length;
  return count;
}

/** Adds a fetched page to a level under the node ceiling: rows past the
 * ceiling are cut off and the level is marked truncated (the Gantt rule). */
export function admitPage(
  levels: TreeLevels,
  key: string,
  page: { readonly rows: readonly EntityListRowV1[]; readonly nextCursor?: string; readonly total?: number },
  append: boolean,
  ceiling: number,
): TreeLevels {
  const previous = append ? (levels.get(key)?.rows ?? []) : [];
  const others = loadedCount(levels) - (levels.get(key)?.rows.length ?? 0);
  const room = Math.max(0, ceiling - others - previous.length);
  // A row already loaded elsewhere (for example a record that moved between
  // pages) is drawn once.
  const seen = new Set<string>();
  for (const [other, level] of levels) if (other !== key) for (const row of level.rows) seen.add(row.id);
  for (const row of previous) seen.add(row.id);
  const fresh = page.rows.filter((row) => !seen.has(row.id));
  const taken = fresh.slice(0, room);
  const truncated = taken.length < fresh.length;
  const next = new Map(levels);
  next.set(key, {
    rows: [...previous, ...taken],
    status: "ready",
    ...(page.nextCursor && !truncated ? { nextCursor: page.nextCursor } : {}),
    ...(page.total !== undefined ? { total: page.total } : {}),
    ...(truncated ? { truncated: true } : {}),
  });
  return next;
}

/** Each loaded node's parent node (undefined at the top) and depth (1 at the
 * top). Orphans start at depth 1: their place above is unknown to the viewer. */
export function nodePlaces(levels: TreeLevels): ReadonlyMap<string, { readonly parent?: string; readonly depth: number; readonly row: EntityListRowV1 }> {
  const places = new Map<string, { parent?: string; depth: number; row: EntityListRowV1 }>();
  const visit = (key: string, parent: string | undefined, depth: number) => {
    for (const row of levels.get(key)?.rows ?? []) {
      if (places.has(row.id)) continue;
      places.set(row.id, { ...(parent ? { parent } : {}), depth, row });
      visit(childLevel(row.id), row.id, depth + 1);
    }
  };
  visit(TREE_ROOTS, undefined, 1);
  visit(TREE_ORPHANS, undefined, 1);
  return places;
}

/** A row expands only when it has visible children and sits above the
 * maximum depth; at the maximum depth it shows a depth-limit marker instead,
 * so a node with children never reads as a leaf. */
export function expandability(row: EntityListRowV1, depth: number, tree: ListTreeV1): "expandable" | "leaf" | "limit" {
  if (row.hasChildren !== true) return "leaf";
  return depth >= tree.maxDepth ? "limit" : "expandable";
}

/** The nodes a strip command expands, over loaded nodes only: "Expand all
 * loaded" (no level) or "Show to level n". Neither sends a request. */
export function expandLoaded(levels: TreeLevels, tree: ListTreeV1, level?: number): ReadonlySet<string> {
  const expanded = new Set<string>();
  for (const [id, place] of nodePlaces(levels))
    if (expandability(place.row, place.depth, tree) === "expandable" && levels.has(childLevel(id)) && (level === undefined || place.depth < level))
      expanded.add(id);
  return expanded;
}

/** The deepest loaded level, for the "Show to level" control. */
export function loadedDepth(levels: TreeLevels): number {
  let depth = 0;
  for (const place of nodePlaces(levels).values()) depth = Math.max(depth, place.depth);
  return depth;
}

/** A node's path from the top, from loaded nodes only (no request). */
export function nodePath(levels: TreeLevels, id: string): readonly EntityListRowV1[] {
  const places = nodePlaces(levels);
  const path: EntityListRowV1[] = [];
  for (let at = places.get(id); at; at = at.parent ? places.get(at.parent) : undefined) path.unshift(at.row);
  return path;
}

/** One visible line of the tree grid, in display order. */
export type TreeEntry =
  | {
      readonly kind: "node";
      readonly key: string;
      readonly row: EntityListRowV1;
      readonly depth: number;
      /** aria-level: the depth, one deeper under the orphans heading. */
      readonly level: number;
      readonly posinset: number;
      /** -1 when the size of the level is not known. */
      readonly setsize: number;
      readonly state: "expandable" | "leaf" | "limit";
      readonly expanded: boolean;
      readonly orphan: boolean;
    }
  | { readonly kind: "orphans"; readonly key: string; readonly level: 1; readonly expanded: boolean; readonly count?: number }
  | { readonly kind: "message"; readonly key: string; readonly level: number; readonly message: "loading" | "failed" | "noChildren" | "ceiling" }
  | { readonly kind: "more"; readonly key: string; readonly levelKey: string; readonly level: number; readonly remaining?: number };

/** The visible lines: roots, then the orphans group, each expanded node
 * followed by its children or a message, and "Load more" per level. */
export function treeEntries(
  levels: TreeLevels,
  expanded: ReadonlySet<string>,
  orphansOpen: boolean,
  tree: ListTreeV1,
  ceilingReached: boolean,
): readonly TreeEntry[] {
  const entries: TreeEntry[] = [];
  const drawn = new Set<string>();
  const emit = (levelKey: string, depth: number, offset: number, orphan: boolean) => {
    const level = levels.get(levelKey);
    if (!level) return;
    const rows = level.rows.filter((row) => !drawn.has(row.id));
    const setsize = level.total ?? (level.nextCursor || level.truncated ? -1 : rows.length);
    rows.forEach((row, index) => {
      drawn.add(row.id);
      const state = expandability(row, depth, tree);
      const open = state === "expandable" && expanded.has(row.id);
      entries.push({ kind: "node", key: row.id, row, depth, level: depth + offset, posinset: index + 1, setsize, state, expanded: open, orphan });
      if (!open) return;
      const children = levels.get(childLevel(row.id));
      const childLevelNumber = depth + offset + 1;
      if (!children) entries.push({ kind: "message", key: `ceiling:${row.id}`, level: childLevelNumber, message: ceilingReached ? "ceiling" : "loading" });
      else if (children.status === "loading" && !children.rows.length) entries.push({ kind: "message", key: `loading:${row.id}`, level: childLevelNumber, message: "loading" });
      else if (children.status === "failed" && !children.rows.length) entries.push({ kind: "message", key: `failed:${row.id}`, level: childLevelNumber, message: "failed" });
      else if (!children.rows.length) entries.push({ kind: "message", key: `none:${row.id}`, level: childLevelNumber, message: children.truncated ? "ceiling" : "noChildren" });
      else emit(childLevel(row.id), depth + 1, offset, orphan);
    });
    if (level.nextCursor)
      entries.push({
        kind: "more",
        key: `more:${levelKey}`,
        levelKey,
        level: depth + offset,
        ...(level.total !== undefined ? { remaining: Math.max(0, level.total - level.rows.length) } : {}),
      });
  };
  emit(TREE_ROOTS, 1, 0, false);
  const orphans = levels.get(TREE_ORPHANS);
  if (orphans && (orphans.rows.length || orphans.status === "failed")) {
    entries.push({ kind: "orphans", key: TREE_ORPHANS, level: 1, expanded: orphansOpen, ...(orphans.total !== undefined ? { count: orphans.total } : {}) });
    if (orphansOpen) {
      if (orphans.status === "failed" && !orphans.rows.length) entries.push({ kind: "message", key: "failed:orphans", level: 2, message: "failed" });
      else emit(TREE_ORPHANS, 1, 1, true);
    }
  }
  return entries;
}

/** The ceiling notice claims records exist past the ceiling, so it shows only
 * when rows were cut off, or more pages remain once the ceiling is reached. */
export function ceilingState(levels: TreeLevels, ceiling: number): { readonly reached: boolean; readonly capped: boolean } {
  const reached = loadedCount(levels) >= ceiling;
  let truncated = false, more = false;
  for (const level of levels.values()) {
    truncated ||= Boolean(level.truncated);
    more ||= Boolean(level.nextCursor);
  }
  return { reached, capped: truncated || (reached && more) };
}
