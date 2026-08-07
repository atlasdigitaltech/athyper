"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Input, Skeleton } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import { useExploreGlAccounts, type ExploreGlAccount } from "../../hooks/useFinanceExplore";

export interface GlAccountsListPanelProps {
  companyCode: string;
  onSelect?:   (account: ExploreGlAccount) => void;
  selectedCode?: string | null;
  className?:  string;
}

export function GlAccountsListPanel({ companyCode, onSelect, selectedCode, className }: GlAccountsListPanelProps) {
  const q = useExploreGlAccounts(companyCode);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.accountCode.toLowerCase().includes(needle)
      || r.accountName.toLowerCase().includes(needle),
    );
  }, [q.data, search]);

  return (
    <div className={cn("flex h-full flex-col rounded-lg border bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by code or name…"
          className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
          aria-label="Filter GL accounts"
        />
        {q.data ? <Badge variant="muted" size="sm">{filtered.length}</Badge> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {q.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : q.isError ? (
          <p className="p-6 text-sm text-destructive">Failed to load GL accounts.</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No accounts found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Class</th>
                <th className="p-2">Control</th>
                <th className="p-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isSelected = row.accountCode === selectedCode;
                return (
                  <tr
                    key={row.glAccountId}
                    onClick={() => onSelect?.(row)}
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-muted/40",
                      isSelected && "bg-primary/10 hover:bg-primary/15",
                    )}
                  >
                    <td className="p-2 font-mono text-xs tabular-nums text-muted-foreground">{row.accountCode}</td>
                    <td className="p-2">{row.accountName}</td>
                    <td className="p-2 text-xs text-muted-foreground">{row.accountClass}</td>
                    <td className="p-2">
                      {row.hasCompanyControl
                        ? <Badge variant="success" size="sm">✓</Badge>
                        : <Badge variant="warning" size="sm">missing</Badge>}
                    </td>
                    <td className="p-2 space-x-1">
                      {!row.postingAllowed && <Badge variant="destructive" size="sm">disallowed</Badge>}
                      {row.blockedForManual && <Badge variant="warning" size="sm">no manual</Badge>}
                      {row.blockedForAuto && <Badge variant="warning" size="sm">no auto</Badge>}
                      {row.subledgerType && <Badge variant="outline" size="sm">{row.subledgerType}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
