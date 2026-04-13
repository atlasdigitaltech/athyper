"use client";

import { useQuery } from "@tanstack/react-query";
import type { GlAccountNode, AccountClass, NodeType, NormalBalance } from "../data/types";

interface FlatAccount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  level: number;
  accountClass: AccountClass;
  nodeType: NodeType;
  normalBalance: NormalBalance;
  subledgerType: string | null;
}

/** Build a nested GlAccountNode tree from a flat list with parentId references. */
export function buildAccountTree(flat: FlatAccount[]): GlAccountNode[] {
  const byId = new Map<string, GlAccountNode>();
  for (const f of flat) {
    byId.set(f.id, {
      id: f.id, code: f.code, name: f.name,
      accountClass: f.accountClass, nodeType: f.nodeType,
      normalBalance: f.normalBalance, level: f.level,
      subledgerType: f.subledgerType,
      closingDebit: 0, closingCredit: 0,
      children: null,
    });
  }
  const roots: GlAccountNode[] = [];
  for (const f of flat) {
    const node = byId.get(f.id)!;
    if (f.parentId && byId.has(f.parentId)) {
      const parent = byId.get(f.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function useAccountTree(chartCode: string | null) {
  return useQuery<GlAccountNode[]>({
    queryKey: ["finance", "master", "accounts", chartCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/finance/master/charts/${encodeURIComponent(chartCode!)}/accounts`,
      );
      if (!res.ok) throw new Error("Failed to load accounts");
      const flat = await res.json() as FlatAccount[];
      return buildAccountTree(flat);
    },
    enabled: !!chartCode,
    staleTime: 5 * 60 * 1000,
  });
}
