"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import type { GlAccountNode } from "../data/types";
import { sumTree } from "../data/demo-data";
import { AccountClassBadge, AccountClassDot } from "./ChartBadge";
import { fmtCompact } from "./format";
import { Badge } from "@athyper/platform-ui/primitives";

/* -- Single tree row ------------------------------------------------------ */

function TreeRow({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
  search,
}: {
  node: GlAccountNode;
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  search: string;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = expanded.has(node.id);
  const net = node.closingDebit - node.closingCredit;
  const headerTotal = hasChildren ? sumTree(node.children!) : null;
  const displayNet = headerTotal ? headerTotal.dr - headerTotal.cr : net;

  // Search filtering
  const matchesSelf =
    !search ||
    node.name.toLowerCase().includes(search) ||
    node.code.toLowerCase().includes(search);

  const hasMatchingDescendant = (n: GlAccountNode): boolean => {
    if (!n.children) return false;
    return n.children.some(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.code.toLowerCase().includes(search) ||
        hasMatchingDescendant(c),
    );
  };

  if (!matchesSelf && !hasChildren) return null;
  if (!matchesSelf && hasChildren && !hasMatchingDescendant(node)) return null;

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected === node.id}
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded-md transition-colors",
          selected === node.id
            ? "bg-accent"
            : "hover:bg-muted/50",
        )}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}

        <AccountClassDot cls={node.accountClass} />

        <span className="tabular-nums text-xs text-muted-foreground w-28 shrink-0 truncate">
          {node.code}
        </span>

        <span
          className={cn(
            "text-xs flex-1 truncate",
            node.nodeType === "header" ? "font-medium text-foreground" : "text-foreground/80",
          )}
        >
          {node.name}
        </span>

        {node.nodeType === "posting" && (
          <AccountClassBadge cls={node.accountClass} />
        )}

        {node.subledgerType && (
          <Badge variant="muted" className="text-xs py-0">
            {node.subledgerType}
          </Badge>
        )}

        <span
          className={cn(
            "tabular-nums text-xs w-20 text-right shrink-0",
            displayNet >= 0 ? "text-foreground/70" : "text-destructive",
          )}
        >
          {fmtCompact(Math.abs(displayNet))}
        </span>
      </div>

      {isOpen && hasChildren &&
        node.children!.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selected={selected}
            onToggle={onToggle}
            onSelect={onSelect}
            search={search}
          />
        ))}
    </>
  );
}

/* -- Main tree component -------------------------------------------------- */

interface AccountTreeProps {
  tree: GlAccountNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search?: string;
  className?: string;
}

export function AccountTree({ tree, selectedId, onSelect, search = "", className }: AccountTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(tree.map((nd) => nd.id)),
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const normalizedSearch = search.toLowerCase();

  return (
    <div role="tree" className={cn("py-1", className)}>
      {tree.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selected={selectedId}
          onToggle={toggle}
          onSelect={onSelect}
          search={normalizedSearch}
        />
      ))}
    </div>
  );
}
