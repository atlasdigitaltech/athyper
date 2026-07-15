"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Circle, CircleDot, Search } from "lucide-react";
import { Badge, Input, Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useExploreChartTree, type ExploreChartNode } from "../../hooks/useFinanceExplore";

interface TreeItem extends ExploreChartNode {
  depth:      number;
  childIds:   string[];
}

function buildTree(nodes: ExploreChartNode[]): { items: TreeItem[]; byId: Map<string, TreeItem> } {
  const byId = new Map<string, TreeItem>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, depth: 0, childIds: [] });
  }
  // Wire parent → children + compute depth
  for (const n of byId.values()) {
    if (n.parentId) {
      const p = byId.get(n.parentId);
      if (p) p.childIds.push(n.id);
    }
  }
  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId!));
  const items: TreeItem[] = [];
  const walk = (id: string, depth: number) => {
    const item = byId.get(id);
    if (!item) return;
    item.depth = depth;
    items.push(item);
    for (const c of item.childIds) walk(c, depth + 1);
  };
  for (const r of roots) walk(r.id, 0);
  return { items, byId };
}

export interface ChartTreePanelProps {
  companyCode: string;
  selectedId?: string | null;
  onSelect?:   (node: ExploreChartNode) => void;
  className?:  string;
}

export function ChartTreePanel({
  companyCode,
  selectedId,
  onSelect,
  className,
}: ChartTreePanelProps) {
  const treeQuery = useExploreChartTree(companyCode);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const { items } = useMemo(
    () => treeQuery.data ? buildTree(treeQuery.data.nodes) : { items: [], byId: new Map() },
    [treeQuery.data],
  );

  const filteredIds = useMemo(() => {
    if (!q.trim()) return null;
    const needle = q.trim().toLowerCase();
    return new Set(items.filter((n) =>
      n.code.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle),
    ).map((n) => n.id));
  }, [q, items]);

  const visibleItems = useMemo(() => {
    if (filteredIds) return items.filter((i) => filteredIds.has(i.id));
    return items.filter((i) => i.depth === 0 || isAncestorExpanded(i, items, expanded));
  }, [items, filteredIds, expanded]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code or name"
          className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
          aria-label="Search chart of accounts"
        />
        {treeQuery.data ? (
          <Badge variant="muted" size="sm">
            {treeQuery.data.postingNodes}/{treeQuery.data.totalNodes}
          </Badge>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {treeQuery.isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : treeQuery.isError ? (
          <p className="p-6 text-sm text-destructive">Failed to load chart.</p>
        ) : !treeQuery.data ? (
          <p className="p-6 text-sm text-muted-foreground">No operating chart assigned.</p>
        ) : (
          <ul role="tree" className="p-1">
            {visibleItems.map((item) => (
              <li key={item.id} role="treeitem" aria-selected={selectedId === item.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(item)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm hover:bg-muted",
                    selectedId === item.id && "bg-primary/10 text-primary",
                  )}
                  style={{ paddingLeft: `${item.depth * 12 + 4}px` }}
                >
                  {item.childIds.length > 0 ? (
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={expanded.has(item.id) ? "Collapse" : "Expand"}
                      onClick={(e) => { e.stopPropagation(); toggle(item.id); }}
                      className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      {expanded.has(item.id) ? (
                        <ChevronDown className="h-3 w-3" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      )}
                    </span>
                  ) : (
                    <span className="inline-block h-4 w-4" />
                  )}
                  {item.isPosting ? (
                    <CircleDot className="h-3 w-3 shrink-0 text-info" aria-label="Posting" />
                  ) : (
                    <Circle className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-label="Header" />
                  )}
                  <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {item.code}
                  </span>
                  <span className="truncate">{item.name}</span>
                  {item.isPosting && !item.hasCompanyControl ? (
                    <Badge variant="warning" size="sm" className="ml-auto">no control</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function isAncestorExpanded(
  item: TreeItem,
  items: TreeItem[],
  expanded: Set<string>,
): boolean {
  if (!item.parentId) return true;
  const byId = new Map(items.map((i) => [i.id, i]));
  let cursor: TreeItem | undefined = byId.get(item.parentId);
  while (cursor) {
    if (!expanded.has(cursor.id)) return false;
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return true;
}
