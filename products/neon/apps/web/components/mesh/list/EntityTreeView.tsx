"use client";

// components/mesh/list/EntityTreeView.tsx
//
// Tree view for hierarchical entities (e.g. Chart of Accounts, Cost Centers).
// Builds a tree from flat sorted items using the parentField from TreeConfig.

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useCallback } from "react";

import { useListPage, useListPageActions } from "./ListPageContext";

import type { Density, RowAction, TreeConfig } from "./types";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Tree Node Type ─────────────────────────────────────────

interface TreeNode<T> {
  item: T;
  id: string;
  children: TreeNode<T>[];
  depth: number;
  isGroup: boolean;
}

// ─── Tree Builder ───────────────────────────────────────────

function buildTree<T>(
  items: T[],
  getId: (item: T) => string,
  treeConfig: TreeConfig,
): TreeNode<T>[] {
  const { parentField, isGroupField } = treeConfig;

  // Index items by id
  const itemMap = new Map<string, T>();
  for (const item of items) {
    itemMap.set(getId(item), item);
  }

  // Build child lists
  const childrenMap = new Map<string, TreeNode<T>[]>();
  const roots: TreeNode<T>[] = [];

  for (const item of items) {
    const id = getId(item);
    const parentId = (item as Record<string, unknown>)[parentField];
    const isGroup = isGroupField
      ? !!(item as Record<string, unknown>)[isGroupField]
      : false;

    const node: TreeNode<T> = {
      item,
      id,
      children: [],
      depth: 0,
      isGroup,
    };

    if (!parentId || !itemMap.has(String(parentId))) {
      // Root node (no parent or parent not in current dataset)
      roots.push(node);
    } else {
      const pid = String(parentId);
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(node);
    }

    // Store node for later child assignment
    childrenMap.set(`__node__${id}`, [node]);
  }

  // Assign children and compute depths
  function assignChildren(nodes: TreeNode<T>[], depth: number): void {
    for (const node of nodes) {
      node.depth = depth;
      const kids = childrenMap.get(node.id) ?? [];
      node.children = kids;
      // If a node has children, treat it as a group regardless of isGroupField
      if (kids.length > 0) node.isGroup = true;
      assignChildren(kids, depth + 1);
    }
  }

  assignChildren(roots, 0);
  return roots;
}

// ─── Collect all expandable (group) node IDs ────────────────

function collectGroupIds<T>(nodes: TreeNode<T>[]): string[] {
  const ids: string[] = [];
  function walk(list: TreeNode<T>[]) {
    for (const node of list) {
      if (node.isGroup) ids.push(node.id);
      walk(node.children);
    }
  }
  walk(nodes);
  return ids;
}

// ─── Count total visible nodes ──────────────────────────────

function countNodes<T>(nodes: TreeNode<T>[]): number {
  let count = 0;
  function walk(list: TreeNode<T>[]) {
    for (const node of list) {
      count++;
      walk(node.children);
    }
  }
  walk(nodes);
  return count;
}

// ─── Density Classes ────────────────────────────────────────

const DENSITY_ROW_CLASSES: Record<Density, string> = {
  compact: "py-0.5 text-xs",
  comfortable: "py-1.5 text-sm",
  spacious: "py-2.5 text-sm",
};

const DENSITY_INDENT: Record<Density, number> = {
  compact: 20,
  comfortable: 24,
  spacious: 28,
};

// ─── Main Component ─────────────────────────────────────────

export function EntityTreeView<T>() {
  const { state, config, sortedItems, loading, isPendingQuery } =
    useListPage<T>();
  const actions = useListPageActions();

  const treeConfig = config.tree;

  // Build tree from flat sorted items
  const tree = useMemo(
    () => (treeConfig ? buildTree(sortedItems, config.getId, treeConfig) : []),
    [sortedItems, config.getId, treeConfig],
  );

  const allGroupIds = useMemo(() => collectGroupIds(tree), [tree]);
  const totalCount = useMemo(() => countNodes(tree), [tree]);
  const allExpanded =
    allGroupIds.length > 0 &&
    allGroupIds.every((id) => state.expandedIds.has(id));

  const handleExpandAll = useCallback(() => {
    actions.expandAll(allGroupIds);
  }, [actions, allGroupIds]);

  const handleCollapseAll = useCallback(() => {
    actions.collapseAll();
  }, [actions]);

  if (!treeConfig) return null;

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="size-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No items found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={allExpanded ? handleCollapseAll : handleExpandAll}
        >
          {allExpanded ? (
            <ChevronsDownUp className="size-3.5" />
          ) : (
            <ChevronsUpDown className="size-3.5" />
          )}
          {allExpanded ? "Collapse All" : "Expand All"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Tree rows */}
      <div
        className={cn(
          "divide-y divide-border/50",
          isPendingQuery &&
            !loading &&
            "opacity-50 transition-opacity duration-150",
        )}
      >
        {tree.map((node) => (
          <TreeNodeRow<T>
            key={node.id}
            node={node}
            expandedIds={state.expandedIds}
            density={state.density}
            config={config}
            onToggle={actions.toggleExpand}
            rowActions={config.rowActions}
            treeConfig={treeConfig}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Recursive Tree Row ─────────────────────────────────────

interface TreeNodeRowProps<T> {
  node: TreeNode<T>;
  expandedIds: Set<string>;
  density: Density;
  config: {
    getId: (item: T) => string;
    getItemHref?: (item: T) => string;
    columns: {
      id: string;
      header: string;
      accessor: (item: T) => React.ReactNode;
    }[];
  };
  onToggle: (id: string) => void;
  rowActions?: RowAction<T>[];
  treeConfig: TreeConfig;
}

function TreeNodeRow<T>({
  node,
  expandedIds,
  density,
  config,
  onToggle,
  rowActions,
  treeConfig,
}: TreeNodeRowProps<T>) {
  const isExpanded = expandedIds.has(node.id);
  const indent = node.depth * DENSITY_INDENT[density];

  // Use first two visible columns for display: primary label + secondary info
  const primaryCol = config.columns[0];
  const secondaryCol = config.columns[1];

  const primaryValue = primaryCol?.accessor(node.item);
  const secondaryValue = secondaryCol?.accessor(node.item);

  const href = config.getItemHref?.(node.item);

  const visibleActions =
    rowActions?.filter((a) => !a.hidden?.(node.item)) ?? [];

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-4 hover:bg-muted/50 transition-colors group",
          DENSITY_ROW_CLASSES[density],
        )}
        style={{ paddingLeft: `${indent + 16}px` }}
      >
        {/* Expand/Collapse toggle */}
        <button
          type="button"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent",
            !node.isGroup && "invisible",
          )}
          onClick={() => onToggle(node.id)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {node.isGroup &&
            (isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            ))}
        </button>

        {/* Icon */}
        {node.isGroup ? (
          isExpanded ? (
            <FolderOpen className="size-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="size-4 shrink-0 text-amber-500" />
          )
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}

        {/* Primary label */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {href ? (
            <Link href={href} className="truncate font-medium hover:underline">
              {primaryValue}
            </Link>
          ) : (
            <span className="truncate font-medium">{primaryValue}</span>
          )}

          {/* Secondary info */}
          {secondaryValue && (
            <span className="hidden truncate text-muted-foreground sm:inline">
              {secondaryValue}
            </span>
          )}

          {/* Status badge */}
          <StatusBadge item={node.item as Record<string, unknown>} />
        </div>

        {/* Row actions */}
        {visibleActions.length > 0 && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {visibleActions.map((action) => (
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                className="h-6 px-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick(node.item);
                }}
                disabled={action.disabled?.(node.item)}
              >
                {action.icon && <action.icon className="size-3.5" />}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Children (only rendered when expanded) */}
      {isExpanded &&
        node.children.map((child) => (
          <TreeNodeRow<T>
            key={child.id}
            node={child}
            expandedIds={expandedIds}
            density={density}
            config={config}
            onToggle={onToggle}
            rowActions={rowActions}
            treeConfig={treeConfig}
          />
        ))}
    </>
  );
}

// ─── Status Badge ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  INACTIVE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  SUNSET:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  ARCHIVED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  UNDER_REVIEW: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

function StatusBadge({ item }: { item: Record<string, unknown> }) {
  const status = item.status as string | undefined;
  if (!status) return null;

  const colorClass = STATUS_COLORS[status.toUpperCase()] ?? STATUS_COLORS.DRAFT;

  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        colorClass,
      )}
    >
      {status}
    </span>
  );
}
