"use client";

/**
 * WorkbenchHierarchyTree â€” collapsible tree for displaying hierarchical records
 * in a workbench sidebar or panel (e.g. COA hierarchy, org-unit tree, category tree).
 *
 * Features:
 *   - Generic over TRecord â€” caller provides typed data
 *   - Expand/collapse per node; all-expand and all-collapse controls
 *   - Per-node action menu (configurable via `nodeActions`)
 *   - Optional sticky column headers
 *   - Keyboard navigation on tree nodes
 *   - Search/filter via `filterValue` prop (caller owns input)
 *
 * All data is provided via `nodes` prop. The component owns expand state only;
 * selection, filtering, and data loading live in the caller.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Search, Settings2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../primitives";

export interface WorkbenchHierarchyNode<TRecord> {
  id: string;
  parentId: string | null;
  record: TRecord;
  children: WorkbenchHierarchyNode<TRecord>[];
  depth: number;
}

export interface WorkbenchHierarchyMeta<TRecord> {
  getId: (record: TRecord) => string;
  getParentId: (record: TRecord) => string | null | undefined;
  getLabel: (record: TRecord) => ReactNode;
  getCode?: (record: TRecord) => ReactNode;
  getDescription?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => ReactNode;
  getBadge?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => ReactNode;
  getSearchText?: (record: TRecord) => string;
  hasChildren?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => boolean;
  compare?: (left: TRecord, right: TRecord) => number;
  isSelectable?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => boolean;
}

export interface WorkbenchHierarchyTreeProps<TRecord> {
  items: TRecord[];
  meta: WorkbenchHierarchyMeta<TRecord>;
  selectedId?: string | null;
  onSelect?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => void;
  title?: ReactNode;
  searchPlaceholder?: string;
  resultSummary?: ReactNode;
  searchValue?: string;
  searchMode?: "client" | "server";
  loadingIds?: Iterable<string>;
  onSearchChange?: (value: string) => void;
  onLoadChildren?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => void | Promise<void>;
  emptyMessage?: ReactNode;
  initiallyExpanded?: "none" | "roots" | "all";
  className?: string;
}

export function buildWorkbenchHierarchy<TRecord>(
  items: TRecord[],
  meta: WorkbenchHierarchyMeta<TRecord>,
): WorkbenchHierarchyNode<TRecord>[] {
  const byId = new Map<string, WorkbenchHierarchyNode<TRecord>>();

  for (const record of items) {
    const id = meta.getId(record);
    byId.set(id, {
      id,
      parentId: meta.getParentId(record) ?? null,
      record,
      children: [],
      depth: 0,
    });
  }

  const roots: WorkbenchHierarchyNode<TRecord>[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortAndStamp(nodes: WorkbenchHierarchyNode<TRecord>[], depth: number) {
    if (meta.compare) nodes.sort((left, right) => meta.compare!(left.record, right.record));
    for (const node of nodes) {
      node.depth = depth;
      sortAndStamp(node.children, depth + 1);
    }
  }

  sortAndStamp(roots, 0);
  return roots;
}

function collectIds<TRecord>(nodes: WorkbenchHierarchyNode<TRecord>[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...collectIds(node.children));
  }
  return ids;
}

function findAncestorIds<TRecord>(
  nodes: WorkbenchHierarchyNode<TRecord>[],
  selectedId: string | null | undefined,
  trail: string[] = [],
): string[] {
  if (!selectedId) return [];
  for (const node of nodes) {
    if (node.id === selectedId) return trail;
    const found = findAncestorIds(node.children, selectedId, [...trail, node.id]);
    if (found.length > 0) return found;
  }
  return [];
}

function nodeMatches<TRecord>(
  node: WorkbenchHierarchyNode<TRecord>,
  meta: WorkbenchHierarchyMeta<TRecord>,
  search: string,
): boolean {
  if (!search) return true;
  const text = meta.getSearchText?.(node.record) ?? [
    meta.getId(node.record),
    String(meta.getLabel(node.record) ?? ""),
    String(meta.getCode?.(node.record) ?? ""),
  ].join(" ");
  return text.toLowerCase().includes(search);
}

function hasMatchingDescendant<TRecord>(
  node: WorkbenchHierarchyNode<TRecord>,
  meta: WorkbenchHierarchyMeta<TRecord>,
  search: string,
): boolean {
  return node.children.some((child) => (
    nodeMatches(child, meta, search) || hasMatchingDescendant(child, meta, search)
  ));
}

function TreeNode<TRecord>({
  node,
  meta,
  selectedId,
  expanded,
  search,
  loadingIds,
  onToggle,
  onSelect,
}: {
  node: WorkbenchHierarchyNode<TRecord>;
  meta: WorkbenchHierarchyMeta<TRecord>;
  selectedId?: string | null;
  expanded: Set<string>;
  search: string;
  loadingIds: Set<string>;
  onToggle: (node: WorkbenchHierarchyNode<TRecord>) => void;
  onSelect?: (record: TRecord, node: WorkbenchHierarchyNode<TRecord>) => void;
}) {
  const hasChildren = meta.hasChildren?.(node.record, node) ?? node.children.length > 0;
  const matchesSelf = nodeMatches(node, meta, search);
  const matchesChild = hasMatchingDescendant(node, meta, search);
  const isOpen = expanded.has(node.id) || (!!search && matchesChild);
  const isLoading = loadingIds.has(node.id);
  const selected = selectedId === node.id;
  const selectable = meta.isSelectable?.(node.record, node) ?? true;

  if (search && !matchesSelf && !matchesChild) return null;

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={selected}
        className={cn(
          "group flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-left transition-colors",
          selected ? "bg-primary/10 text-primary" : "hover:bg-muted/70",
          !selectable && "cursor-default opacity-80",
        )}
        style={{ paddingLeft: `${node.depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node);
            }}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => selectable && onSelect?.(node.record, node)}
          disabled={!selectable}
        >
          <span className={cn("truncate text-sm font-medium leading-5", node.depth === 0 ? "text-foreground" : "text-foreground/90")}>
            {meta.getLabel(node.record)}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            {meta.getCode && <span className="truncate tabular-nums">{meta.getCode(node.record)}</span>}
            {meta.getDescription && <span className="truncate">{meta.getDescription(node.record, node)}</span>}
          </span>
        </button>

        {meta.getBadge?.(node.record, node)}
      </div>

      {hasChildren && isOpen && (
        <div role="group">
          {isLoading ? (
            <div
              className="px-2 py-1.5 text-xs leading-4 text-muted-foreground"
              style={{ paddingLeft: `${(node.depth + 1) * 14 + 28}px` }}
            >
              Loading children...
            </div>
          ) : (
            node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                meta={meta}
                selectedId={selectedId}
                expanded={expanded}
                search={search}
                loadingIds={loadingIds}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}

export function WorkbenchHierarchyTree<TRecord>({
  items,
  meta,
  selectedId,
  onSelect,
  title = "Hierarchy",
  searchPlaceholder = "Find item",
  resultSummary,
  searchValue,
  searchMode = "client",
  loadingIds,
  onSearchChange,
  onLoadChildren,
  emptyMessage = "No hierarchy items matched.",
  initiallyExpanded = "roots",
  className,
}: WorkbenchHierarchyTreeProps<TRecord>) {
  const [internalSearch, setInternalSearch] = useState("");
  const [filterVisible, setFilterVisible] = useState(true);
  const tree = useMemo(() => buildWorkbenchHierarchy(items, meta), [items, meta]);
  const initializedExpansionRef = useRef(tree.length > 0);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (initiallyExpanded === "all") return new Set(collectIds(tree));
    if (initiallyExpanded === "roots") return new Set(tree.map((node) => node.id));
    return new Set();
  });
  const loadingIdSet = useMemo(() => new Set(loadingIds ?? []), [loadingIds]);
  const search = searchValue ?? internalSearch;

  const setSearch = useCallback((value: string) => {
    if (searchValue === undefined) setInternalSearch(value);
    onSearchChange?.(value);
  }, [onSearchChange, searchValue]);

  useEffect(() => {
    if (initializedExpansionRef.current || tree.length === 0) return;
    initializedExpansionRef.current = true;
    setExpanded(() => {
      if (initiallyExpanded === "all") return new Set(collectIds(tree));
      if (initiallyExpanded === "roots") return new Set(tree.map((node) => node.id));
      return new Set();
    });
  }, [initiallyExpanded, tree]);

  useEffect(() => {
    const ancestorIds = findAncestorIds(tree, selectedId);
    if (ancestorIds.length === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of ancestorIds) next.add(id);
      return next;
    });
  }, [selectedId, tree]);

  const toggle = useCallback((node: WorkbenchHierarchyNode<TRecord>) => {
    const hasChildren = meta.hasChildren?.(node.record, node) ?? node.children.length > 0;
    const shouldLoadChildren = (
      hasChildren &&
      node.children.length === 0 &&
      !expanded.has(node.id) &&
      !loadingIdSet.has(node.id)
    );

    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });

    if (shouldLoadChildren) void onLoadChildren?.(node.record, node);
  }, [expanded, loadingIdSet, meta, onLoadChildren]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(collectIds(tree)));
  }, [tree]);

  const toggleFilterVisibility = useCallback(() => {
    setFilterVisible((current) => {
      if (current) setSearch("");
      return !current;
    });
  }, [setSearch]);

  const normalizedSearch = search.trim().toLowerCase();
  const treeSearch = searchMode === "server" ? "" : normalizedSearch;

  useEffect(() => {
    if (searchMode !== "server" || !normalizedSearch) return;
    setExpanded(new Set(collectIds(tree)));
  }, [normalizedSearch, searchMode, tree]);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-xs font-medium leading-none text-muted-foreground">{title}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Hierarchy settings"
              title="Hierarchy settings"
            >
              <Settings2 className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={collapseAll}>Collapse all</DropdownMenuItem>
            <DropdownMenuItem onSelect={expandAll}>
              {onLoadChildren ? "Expand loaded" : "Expand all"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleFilterVisibility}>
              {filterVisible ? "Hide filter" : "Show filter"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filterVisible && (
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </div>
      )}
      <div role="tree" className="min-h-0 flex-1 overflow-auto p-2">
        {tree.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm leading-5 text-muted-foreground">{emptyMessage}</div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              meta={meta}
              selectedId={selectedId}
              expanded={expanded}
              search={treeSearch}
              loadingIds={loadingIdSet}
              onToggle={toggle}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      {resultSummary && (
        <div className="shrink-0 border-t px-3 py-2 text-xs leading-4 text-muted-foreground">
          {resultSummary}
        </div>
      )}
    </aside>
  );
}
