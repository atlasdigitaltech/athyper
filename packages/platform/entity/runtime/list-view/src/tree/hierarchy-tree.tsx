"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { entityListOperation, entityListQuery, type HttpClient } from "@athyper/platform-api-client";
import {
  LIST_TREE_NODE_CEILING,
  type EntityListDescriptorV1,
  type EntityListResultV1,
  type EntityListRowV1,
  type EntityListScopeCoordinateV1,
  type ListLocationStateV1,
  type ListTreeV1,
} from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { datedRowParts } from "../date-range/date-range-parts";
import { formatFieldValue } from "../field-format";
import {
  TREE_ORPHANS,
  TREE_ROOTS,
  admitPage,
  branchByKind,
  levelsFromMatches,
  treeConstrained,
  ceilingState,
  childLevel,
  childrenQuery,
  expandLoaded,
  loadedDepth,
  nodePath,
  nodePlaces,
  orphansQuery,
  parentIdOf,
  recordQuery,
  rootsQuery,
  treeEntries,
  type TreeEntry,
  type TreeLevel,
  type TreeLevels,
  type TreeQueryState,
} from "./tree-model";
import { TreeIndent, TreePath, TreeStrip, TreeToggle } from "./tree-parts";

type EntityIntl = ReturnType<typeof useEntityI18n>;
type NodeEntry = Extract<TreeEntry, { kind: "node" }>;

/** Where the Tree layout's queries come from: the list's own state (filters,
 * search, standard view, page size, scope). */
export interface HierarchySource {
  readonly client: HttpClient;
  readonly scope?: EntityListScopeCoordinateV1;
  readonly refreshKey: string;
  readonly query: ListLocationStateV1;
}

export type TreeNotice = "revealMissing" | "revealTooDeep";

export interface HierarchyTree {
  readonly tree: ListTreeV1;
  readonly levels: TreeLevels;
  readonly entries: readonly TreeEntry[];
  /** The roots page has arrived. */
  readonly ready: boolean;
  /** A search or filter is active: the tree shows matches with their paths (B2). */
  readonly matching: boolean;
  readonly matchesTruncated?: true;
  readonly matchesBeyondDepth?: number;
  /** Nothing at the top level and no orphans, once both have loaded. */
  readonly empty: boolean;
  readonly reached: boolean;
  readonly capped: boolean;
  readonly notice?: TreeNotice;
  readonly selected?: string;
  readonly loadedRows: readonly EntityListRowV1[];
  readonly toggle: (id: string) => void;
  readonly toggleOrphans: () => void;
  readonly loadMore: (levelKey: string) => void;
  readonly expandAll: () => void;
  readonly collapseAll: () => void;
  readonly showToLevel: (level: number) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly focusNode: (id: string) => void;
  readonly gridRef: React.RefObject<HTMLElement | null>;
}

/** The Tree layout's loaded levels, expansion and deep-link reveal (Tree
 * blueprint sections 7.2 and 8). The roots page is the list's own page query;
 * the orphans and each node's children are list queries sent from here, one
 * per expansion, never deeper than the declared maximum depth and never past
 * the node ceiling. State resets whenever the list's query changes. */
export function useHierarchyTree(input: {
  readonly descriptor: EntityListDescriptorV1;
  readonly source: HierarchySource | undefined;
  /** The roots page, once current. */
  readonly rootsPage: EntityListResultV1 | undefined;
  /** `tree.node` from the location. It stays in the location (a reload
   * reveals the node again); it is revealed once per mount, so later search
   * or filter changes do not reapply it. */
  readonly revealId?: string;
}): HierarchyTree | undefined {
  const { descriptor, source, rootsPage } = input;
  const tree = descriptor.surface.tree;
  const enabled = Boolean(tree && source);
  const exact = descriptor.limits.countMode === "exact";
  const resetKey = JSON.stringify([
    descriptor.revision.descriptorHash,
    descriptor.scope.fingerprint,
    source ? [source.refreshKey, source.query.standardViewKey ?? null, source.query.query ?? null, source.query.filters, source.query.sort, source.query.columns, source.query.pageSize ?? null] : null,
  ]);
  const [levels, setLevels] = useState<TreeLevels>(() => new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [orphansOpen, setOrphansOpen] = useState(true);
  const [notice, setNotice] = useState<TreeNotice>();
  const [selected, setSelected] = useState<string>();
  const [focusRequest, setFocusRequest] = useState<{ readonly id: string; readonly seq: number }>();
  const levelsRef = useRef<TreeLevels>(levels);
  const inflight = useRef(new Map<string, Promise<TreeLevel | undefined>>());
  const controllers = useRef(new Set<AbortController>());
  const epoch = useRef(0);
  const lastKey = useRef(resetKey);
  const revealed = useRef(false);
  const gridRef = useRef<HTMLElement | null>(null);
  const latest = useRef(input);
  latest.current = input;
  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey;
    epoch.current += 1;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    inflight.current.clear();
    levelsRef.current = new Map();
    setLevels(levelsRef.current);
    setExpanded(new Set());
    setOrphansOpen(true);
    setNotice(undefined);
  }
  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort();
  }, []);
  const commit = useCallback((change: (current: TreeLevels) => TreeLevels) => {
    levelsRef.current = change(levelsRef.current);
    setLevels(levelsRef.current);
  }, []);

  const fetchPage = useCallback(async (query: TreeQueryState, cursor?: string): Promise<EntityListResultV1> => {
    const { descriptor: current, source: from } = latest.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const page = await from!.client.request(entityListOperation, {
        params: { entityCode: current.entity.code },
        query: entityListQuery({ ...query, cursor }, current, from!.scope),
        signal: controller.signal,
      });
      if (page.descriptorHash !== current.revision.descriptorHash || page.scopeFingerprint !== current.scope.fingerprint)
        throw new TypeError("Tree response authority no longer matches its descriptor");
      return page;
    } finally {
      controllers.current.delete(controller);
    }
  }, []);

  /** Loads a level's first page (once) or its next page. Resolves to the
   * level as loaded, or undefined when the ceiling blocks it or the list
   * state moved on. */
  const loadLevel = useCallback(
    (key: string, query: TreeQueryState, append: boolean): Promise<TreeLevel | undefined> => {
      const pending = inflight.current.get(key);
      if (pending) return pending;
      const current = levelsRef.current.get(key);
      if (!append && current && current.status !== "failed") return Promise.resolve(current);
      if (append && !current?.nextCursor) return Promise.resolve(current);
      if (ceilingState(levelsRef.current, LIST_TREE_NODE_CEILING).reached) return Promise.resolve(current);
      const at = epoch.current;
      commit((levels) => new Map(levels).set(key, { ...(current ?? { rows: [] }), status: "loading" }));
      const run = fetchPage(query, append ? current!.nextCursor : undefined)
        .then((page) => {
          if (at !== epoch.current) return undefined;
          commit((levels) =>
            admitPage(
              levels,
              key,
              {
                rows: page.rows,
                ...(page.pagination.hasNext && page.pagination.nextCursor ? { nextCursor: page.pagination.nextCursor } : {}),
                ...(page.pagination.countMode === "exact" && page.pagination.total !== undefined ? { total: page.pagination.total } : {}),
              },
              append,
              LIST_TREE_NODE_CEILING,
            ),
          );
          return levelsRef.current.get(key);
        })
        .catch(() => {
          if (at !== epoch.current) return undefined;
          commit((levels) => new Map(levels).set(key, { ...(levels.get(key) ?? { rows: [] }), status: "failed" }));
          return levelsRef.current.get(key);
        })
        .finally(() => {
          if (inflight.current.get(key) === run) inflight.current.delete(key);
        });
      inflight.current.set(key, run);
      return run;
    },
    [commit, fetchPage],
  );

  const queryFor = useCallback((key: string): TreeQueryState | undefined => {
    const { descriptor: current, source: from } = latest.current;
    const declared = current.surface.tree;
    if (!declared || !from) return undefined;
    if (key === TREE_ROOTS) return rootsQuery(from.query, current, declared);
    if (key === TREE_ORPHANS) return orphansQuery(from.query, current, declared);
    return childrenQuery(from.query, current, declared, key.slice(2));
  }, []);

  // The roots arrive with the list's own page; the orphans load beside them.
  // With a search or filter the page is the matches response (B2): every
  // level it needs comes with it, so no orphans request is sent.
  const rootsCurrent = enabled && rootsPage ? rootsPage : undefined;
  const matching = Boolean(tree && source && treeConstrained(source.query, descriptor, tree));
  useEffect(() => {
    if (!rootsCurrent || levelsRef.current.has(TREE_ROOTS)) return;
    const declared = latest.current.descriptor.surface.tree;
    if (matching && declared) {
      const { levels: placed, expanded: open } = levelsFromMatches(rootsCurrent.rows, declared);
      commit(() => placed);
      setExpanded(open);
      return;
    }
    commit((levels) =>
      admitPage(
        levels,
        TREE_ROOTS,
        {
          rows: rootsCurrent.rows,
          ...(rootsCurrent.pagination.hasNext && rootsCurrent.pagination.nextCursor ? { nextCursor: rootsCurrent.pagination.nextCursor } : {}),
          ...(rootsCurrent.pagination.countMode === "exact" && rootsCurrent.pagination.total !== undefined ? { total: rootsCurrent.pagination.total } : {}),
        },
        false,
        LIST_TREE_NODE_CEILING,
      ),
    );
    const orphans = queryFor(TREE_ORPHANS);
    if (orphans) void loadLevel(TREE_ORPHANS, orphans, false);
  }, [rootsCurrent, resetKey, matching, commit, loadLevel, queryFor]);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const toggle = useCallback(
    (id: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (!expandedRef.current.has(id)) {
        const query = queryFor(childLevel(id));
        if (query) void loadLevel(childLevel(id), query, false);
      }
    },
    [loadLevel, queryFor],
  );

  // A deep link: resolve the record's path upwards (one request per level,
  // never past the maximum depth), then load each level downwards until the
  // next node on the path is loaded, expanding as it goes.
  useEffect(() => {
    const { revealId } = latest.current;
    if (!rootsCurrent || !revealId || revealed.current || !tree || !source) return;
    revealed.current = true;
    const at = epoch.current;
    const finish = (result?: TreeNotice) => {
      if (at !== epoch.current) return;
      if (result) setNotice(result);
    };
    // Matches view: the response already holds every path it shows.
    if (matching) {
      if (nodePlaces(levelsRef.current).has(revealId)) {
        setSelected(revealId);
        setFocusRequest((previous) => ({ id: revealId, seq: (previous?.seq ?? 0) + 1 }));
      } else finish("revealMissing");
      return;
    }
    void (async () => {
      const state = source.query;
      const path: EntityListRowV1[] = [];
      let base = TREE_ROOTS;
      try {
        for (let next: string | undefined = revealId; next; ) {
          if (path.length >= tree.maxDepth) return finish("revealTooDeep");
          const page = await fetchPage(recordQuery(state, descriptor, tree, next, true));
          const row = page.rows[0];
          if (!row) {
            if (!path.length) return finish("revealMissing");
            // The parent is not in the tree as shown. If it exists without the
            // search and filters, they hide it (filters apply level by level);
            // otherwise the viewer cannot read it and the path starts among the
            // orphans.
            if (state.query?.trim() || state.filters.length) {
              const unfiltered = await fetchPage(recordQuery(state, descriptor, tree, next, false));
              if (unfiltered.rows.length) return finish("revealMissing");
            }
            base = TREE_ORPHANS;
            break;
          }
          path.unshift(row);
          next = parentIdOf(row, tree);
        }
        let levelKey = base;
        for (const [index, node] of path.entries()) {
          if (at !== epoch.current) return;
          const query = queryFor(levelKey)!;
          let level = await loadLevel(levelKey, query, false);
          while (level && !level.rows.some((row) => row.id === node.id) && level.nextCursor && at === epoch.current)
            level = await loadLevel(levelKey, query, true);
          if (!level?.rows.some((row) => row.id === node.id)) return finish("revealMissing");
          if (levelKey === TREE_ORPHANS) setOrphansOpen(true);
          if (index < path.length - 1) {
            setExpanded((current) => new Set(current).add(node.id));
            levelKey = childLevel(node.id);
          }
        }
        if (at !== epoch.current) return;
        setSelected(revealId);
        setFocusRequest((previous) => ({ id: revealId, seq: (previous?.seq ?? 0) + 1 }));
        finish();
      } catch {
        finish("revealMissing");
      }
    })();
  }, [rootsCurrent, matching, tree, source, descriptor, fetchPage, loadLevel, queryFor]);

  useEffect(() => {
    if (!focusRequest) return;
    const element = gridRef.current?.querySelector<HTMLElement>(`[data-tree-key="${CSS.escape(focusRequest.id)}"]`);
    if (!element) return;
    for (const other of gridRef.current!.querySelectorAll<HTMLElement>("[data-tree-key]")) other.tabIndex = -1;
    element.tabIndex = 0;
    element.focus();
    element.scrollIntoView?.({ block: "nearest" });
    // Focus moves once per request: later loads never take it away.
    setFocusRequest(undefined);
  }, [focusRequest, levels, expanded]);

  const places = useMemo(() => nodePlaces(levels), [levels]);
  const loadedRows = useMemo(() => [...places.values()].map((place) => place.row), [places]);
  if (!enabled || !tree) return undefined;
  const { reached, capped: browseCapped } = ceilingState(levels, LIST_TREE_NODE_CEILING);
  // Matches are capped by the server at 500 matches and say so themselves.
  const capped = browseCapped && !matching;
  const entries = treeEntries(levels, expanded, orphansOpen, tree, reached);
  const roots = levels.get(TREE_ROOTS);
  const orphans = levels.get(TREE_ORPHANS);
  return {
    tree,
    levels,
    entries,
    ready: Boolean(roots),
    matching,
    ...(matching && rootsCurrent?.matchesTruncated ? { matchesTruncated: true } : {}),
    ...(matching && rootsCurrent?.matchesBeyondDepth ? { matchesBeyondDepth: rootsCurrent.matchesBeyondDepth } : {}),
    empty: Boolean(roots && !roots.rows.length && orphans && orphans.status !== "loading" && !orphans.rows.length),
    reached,
    capped,
    ...(notice ? { notice } : {}),
    ...(selected && places.has(selected) ? { selected } : {}),
    loadedRows,
    toggle,
    toggleOrphans: () => setOrphansOpen((open) => !open),
    loadMore: (levelKey) => {
      const query = queryFor(levelKey);
      if (query) void loadLevel(levelKey, query, true);
    },
    expandAll: () => setExpanded(expandLoaded(levels, tree)),
    collapseAll: () => setExpanded(new Set()),
    showToLevel: (level) => setExpanded(expandLoaded(levels, tree, level)),
    onFocus: (event) => {
      const key = (event.target as HTMLElement).closest<HTMLElement>("[data-tree-key]")?.dataset.treeKey;
      if (key && places.has(key)) setSelected(key);
    },
    focusNode: (id) => setFocusRequest((previous) => ({ id, seq: (previous?.seq ?? 0) + 1 })),
    gridRef,
  };
}

/** A node's readable label: identity, then title (Tree blueprint section 8).
 * Never the record ID. */
export function treeNodeLabel(row: EntityListRowV1, descriptor: EntityListDescriptorV1): { readonly identity?: string; readonly title?: string; readonly text: string } {
  const parts = datedRowParts(row, descriptor);
  return { ...parts, text: [parts.identity, parts.title].filter(Boolean).join(" ") };
}

/** The tree controls, the path of the selected node and the notices. */
export function HierarchyTreeChrome({ hierarchy, descriptor, filtered, selecting = false, intl }: {
  readonly hierarchy: HierarchyTree;
  readonly descriptor: EntityListDescriptorV1;
  /** Search or filters are active: they apply level by level in Phase B1. */
  readonly filtered: boolean;
  /** Records are selected: selection covers loaded records only. */
  readonly selecting?: boolean;
  readonly intl: EntityIntl;
}) {
  const depth = Math.min(hierarchy.tree.maxDepth, loadedDepth(hierarchy.levels));
  const path = hierarchy.selected ? nodePath(hierarchy.levels, hierarchy.selected) : [];
  return (
    <div className="a-entity-tree">
      <TreeStrip
        levels={depth}
        expandAllLabel={intl.message("list.tree.expandAll")}
        collapseAllLabel={intl.message("list.tree.collapseAll")}
        levelLabel={intl.message("list.tree.showToLevel")}
        onExpandAll={hierarchy.expandAll}
        onCollapseAll={hierarchy.collapseAll}
        onLevel={hierarchy.showToLevel}
      />
      <TreePath
        label={intl.message("list.tree.path")}
        hint={intl.message("list.tree.pathHint")}
        path={path.map((row) => ({ key: row.id, label: treeNodeLabel(row, descriptor).text }))}
        onSelect={hierarchy.focusNode}
      />
      {hierarchy.matching ? (
        <p className="a-entity-tree__caption">{intl.message("list.tree.matchesCaption")}</p>
      ) : filtered ? (
        <p className="a-entity-tree__caption">{intl.message("list.tree.filtered")}</p>
      ) : null}
      {hierarchy.matchesTruncated ? (
        <p className="a-entity-tree__notice" role="status">{intl.message("list.tree.matchesTruncated", { count: 500 })}</p>
      ) : null}
      {hierarchy.matchesBeyondDepth ? (
        <p className="a-entity-tree__notice" role="status">{intl.message("list.tree.matchesBeyondDepth", { count: hierarchy.matchesBeyondDepth, depth: hierarchy.tree.maxDepth })}</p>
      ) : null}
      {selecting ? <p className="a-entity-tree__caption">{intl.message("list.tree.selectionLoaded")}</p> : null}
      {hierarchy.capped ? (
        <p className="a-entity-tree__notice" role="status">{intl.message("list.tree.ceiling", { count: LIST_TREE_NODE_CEILING })}</p>
      ) : null}
      {hierarchy.notice ? (
        <p className="a-entity-tree__notice" role="status">{intl.message(`list.tree.${hierarchy.notice}`, { depth: hierarchy.tree.maxDepth })}</p>
      ) : null}
    </div>
  );
}

/** The leading cell content of a node: indentation, the expand control, the
 * node-kind dot (round for a branch kind, a diamond for a leaf kind, with the
 * kind as hidden text), the label link and its markers. */
export function TreeNodeLabel({ entry, hierarchy, descriptor, intl, href, onOpen }: {
  readonly entry: NodeEntry;
  readonly hierarchy: HierarchyTree;
  readonly descriptor: EntityListDescriptorV1;
  readonly intl: EntityIntl;
  readonly href?: string;
  readonly onOpen?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { tree } = hierarchy;
  const { row } = entry;
  const label = treeNodeLabel(row, descriptor);
  // Node kind (T2): round for "may have children", a diamond for a leaf; a
  // choice kind draws its published tone, a boolean kind a neutral one. The
  // kind is hidden text: the choice label, or the field label and yes or no.
  const nodeKind = tree.nodeKind;
  const branch = branchByKind(row, tree);
  const kindField = nodeKind ? descriptor.fields.find((field) => field.key === nodeKind.field) : undefined;
  const kindValue = nodeKind ? row.values[nodeKind.field] : undefined;
  const kindText =
    branch === undefined || !nodeKind
      ? undefined
      : nodeKind.kind === "boolean"
        ? `${kindField?.label ?? ""}: ${formatFieldValue(kindValue as boolean, kindField, intl)}`
        : String(row.displayValues?.[nodeKind.field] ?? formatFieldValue(kindValue as string, kindField, intl));
  const tone = nodeKind?.kind === "choice" && typeof kindValue === "string" ? (nodeKind.tones?.[kindValue] ?? "neutral") : "neutral";
  const children = hierarchy.levels.get(childLevel(row.id));
  const count = entry.expanded && children?.total !== undefined ? children.total : undefined;
  const content = (
    <>
      {label.identity ? <span className="a-entity-tree__identity">{label.identity}</span> : null}
      {label.title ? <span className="a-entity-tree__title">{label.title}</span> : null}
    </>
  );
  return (
    <span className="a-entity-tree__heading a-entity-tree__node">
      <TreeIndent level={entry.level} />
      <TreeToggle
        expandable={entry.state === "expandable"}
        expanded={entry.expanded}
        label={intl.message(entry.expanded ? "list.tree.collapseNode" : "list.tree.expandNode", { record: label.text })}
        onToggle={() => hierarchy.toggle(row.id)}
      />
      {kindText !== undefined ? (
        <span className="a-entity-tree__kind" data-tone={tone} data-shape={branch ? "branch" : "leaf"}>
          <span className="a-visually-hidden">{kindText}</span>
        </span>
      ) : null}
      {href ? (
        <a className="a-entity-tree__label" href={href} onClick={onOpen} tabIndex={-1} data-tree-open="" title={label.text}>{content}</a>
      ) : (
        <span className="a-entity-tree__label" title={label.text}>{content}</span>
      )}
      {count !== undefined ? <span className="a-entity-tree__count">{intl.number(count)}</span> : null}
      {entry.orphan && entry.depth === 1 ? (
        <span className="a-entity-tree__marker" title={intl.message("list.tree.parentOutsideHint")}>{intl.message("list.tree.parentOutside")}</span>
      ) : null}
      {row.treeRole === "context" ? (
        <span className="a-entity-tree__marker a-entity-tree__marker--context">{intl.message("list.tree.context")}</span>
      ) : null}
      {entry.state === "limit" ? (
        <span className="a-entity-tree__marker a-entity-tree__marker--limit" title={intl.message("list.tree.depthLimitHint", { depth: tree.maxDepth })}>
          {intl.message("list.tree.depthLimit")}
        </span>
      ) : null}
    </span>
  );
}

/** Every visible line of the tree: node lines come from `renderNode` (a table
 * row or a narrow list item); the orphans heading, messages and "Load more"
 * are drawn here. */
export function HierarchyTreeLines({ hierarchy, variant, columnCount, intl, renderNode }: {
  readonly hierarchy: HierarchyTree;
  readonly variant: "table" | "list";
  readonly columnCount: number;
  readonly intl: EntityIntl;
  readonly renderNode: (entry: NodeEntry, focusable: boolean) => ReactNode;
}) {
  const first = hierarchy.entries.find((entry) => entry.kind === "node" || entry.kind === "orphans")?.key;
  const line = (key: string, level: number, content: ReactNode, attributes: Record<string, unknown> = {}) =>
    variant === "table" ? (
      <tr key={key} {...attributes}>
        <td colSpan={columnCount}>
          <span className="a-entity-tree__heading">
            <TreeIndent level={level} />
            {content}
          </span>
        </td>
      </tr>
    ) : (
      <div key={key} {...attributes}>
        <div role="gridcell" className="a-entity-tree__heading">
          <TreeIndent level={level} />
          {content}
        </div>
      </div>
    );
  return (
    <>
      {hierarchy.entries.map((entry) => {
        if (entry.kind === "node") return <React.Fragment key={entry.key}>{renderNode(entry, entry.key === first)}</React.Fragment>;
        if (entry.kind === "orphans") {
          const label = intl.message("list.tree.orphans");
          const heading = (
            <>
              <TreeToggle expandable expanded={entry.expanded} label={intl.message(entry.expanded ? "list.group.collapse" : "list.group.expand", { group: label })} onToggle={hierarchy.toggleOrphans} />
              <strong>{label}</strong>
              {entry.count !== undefined ? <span className="a-entity-tree__count">{intl.number(entry.count)}</span> : null}
              <span className="a-entity-tree__message">{intl.message("list.tree.orphansHint")}</span>
            </>
          );
          const attributes = {
            role: "row",
            className: "a-entity-list__group-row a-entity-tree__group-row",
            "data-tree-key": entry.key,
            "aria-level": 1,
            "aria-expanded": entry.expanded,
            "aria-label": entry.count !== undefined ? intl.message("list.gantt.toggleGroup", { group: label, count: entry.count }) : label,
            tabIndex: entry.key === first ? 0 : -1,
          };
          return variant === "table" ? (
            <tr key={entry.key} {...attributes}>
              <th colSpan={columnCount} scope="rowgroup">
                <span className="a-entity-tree__heading">{heading}</span>
              </th>
            </tr>
          ) : (
            <div key={entry.key} {...attributes}>
              <div role="gridcell" className="a-entity-tree__heading">{heading}</div>
            </div>
          );
        }
        if (entry.kind === "message")
          return line(
            entry.key,
            entry.level,
            <>
              <span className="a-entity-tree__toggle a-entity-tree__toggle--spacer" aria-hidden="true" />
              <span className="a-entity-tree__message">
                {entry.message === "ceiling"
                  ? intl.message("list.tree.ceilingNode", { count: LIST_TREE_NODE_CEILING })
                  : intl.message(`list.tree.${entry.message === "noChildren" ? "noChildren" : entry.message}`)}
              </span>
            </>,
            { className: "a-entity-tree__message-row", ...(variant === "list" ? { role: "row" } : {}) },
          );
        if (hierarchy.reached) return null;
        const level = hierarchy.levels.get(entry.levelKey);
        return line(
          entry.key,
          entry.level,
          <>
            <span className="a-entity-tree__toggle a-entity-tree__toggle--spacer" aria-hidden="true" />
            <button type="button" className="a-entity-tree__more" disabled={level?.status === "loading"} onClick={() => hierarchy.loadMore(entry.levelKey)}>
              {entry.remaining !== undefined ? intl.message("list.tree.loadMoreLeft", { count: entry.remaining }) : intl.message("list.tree.loadMore")}
            </button>
          </>,
          { className: "a-entity-tree__message-row", ...(variant === "list" ? { role: "row" } : {}) },
        );
      })}
    </>
  );
}

/** The attributes of a node line in the tree grid. */
export function treeNodeAttributes(entry: NodeEntry, focusable: boolean) {
  return {
    role: "row",
    "data-tree-key": entry.key,
    "aria-level": entry.level,
    "aria-posinset": entry.posinset,
    "aria-setsize": entry.setsize,
    ...(entry.row.treeRole ? { "data-tree-role": entry.row.treeRole } : {}),
    ...(entry.state === "expandable" ? { "aria-expanded": entry.expanded } : {}),
    tabIndex: focusable ? 0 : -1,
  } as const;
}
