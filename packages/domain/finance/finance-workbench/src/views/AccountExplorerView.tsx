"use client";

import { useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { Badge, Input, Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { ChartOfAccount, GlAccountNode } from "../data/types";
import { findNode, collectPostings } from "../data/demo-data";
import { useAccountTree } from "../hooks/useAccountTree";
import { AccountTree } from "../components/AccountTree";
import { AccountDetail } from "../components/AccountDetail";
import { TierBadge } from "../components/ChartBadge";

interface AccountExplorerViewProps {
  chart: ChartOfAccount;
  onBack: () => void;
}

export function AccountExplorerView({ chart, onBack }: AccountExplorerViewProps) {
  const { data: tree, isLoading } = useAccountTree(chart.code);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const liveTree: GlAccountNode[] = tree ?? [];
  const selectedNode = selectedId ? findNode(liveTree, selectedId) : null;
  const postingCount = isLoading ? null : collectPostings(liveTree).length;

  return (
    <div className="flex h-full">
      {/* Left: tree */}
      <div className={cn("flex flex-col border-r", selectedNode ? "w-[55%]" : "flex-1")}>
        {/* Chart header */}
        <div className="px-3 py-1.5 border-b flex items-center gap-1.5">
          <button
            onClick={onBack}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
          >
            <ChevronLeft size={14} />
          </button>
          <TierBadge tier={chart.tier} />
          <span className="text-xs font-medium">{chart.code}</span>
          <span className="text-doc-support text-muted-foreground truncate">— {chart.name}</span>
          <span className="flex-1" />
          {chart.country && (
            <Badge variant="muted" className="text-doc-label py-0">{chart.country}</Badge>
          )}
          <Badge variant="muted" className="text-doc-label py-0">{chart.framework}</Badge>
        </div>

        {/* Search */}
        <div className="px-3 py-1 border-b">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="h-7 pl-7 text-doc-subtitle"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto">
          {isLoading
            ? (
              <div className="p-3 space-y-1.5">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            )
            : (
              <AccountTree
                tree={liveTree}
                selectedId={selectedId}
                onSelect={setSelectedId}
                search={search}
              />
            )}
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 border-t text-doc-support text-muted-foreground">
          {postingCount !== null ? `${postingCount} posting accounts` : "Loading…"}
        </div>
      </div>

      {/* Right: detail */}
      {selectedNode && (
        <div className="flex-1 overflow-y-auto p-4">
          <AccountDetail
            node={selectedNode}
            chartCode={chart.code}
            onSelectChild={setSelectedId}
          />
        </div>
      )}
    </div>
  );
}
