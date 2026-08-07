"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import {
  Badge, Button,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import { CHARTS, MAPPINGS } from "../data/demo-data";
import type { ChartOfAccount } from "../data/types";

const TYPE_STYLE = {
  direct: "bg-success/10 text-success border-success/30",
  merge:  "bg-info/10 text-info border-info/30",
  split:  "bg-warning/10 text-warning border-warning/30",
} as const;

const STATUS_STYLE = {
  active:  "bg-success/10 text-success border-success/30",
  expired: "bg-muted text-muted-foreground",
  draft:   "bg-warning/10 text-warning border-warning/30",
} as const;

interface MappingWorkbenchViewProps {
  charts?: ChartOfAccount[];
  isLoadingCharts?: boolean;
}

export function MappingWorkbenchView({ charts, isLoadingCharts = false }: MappingWorkbenchViewProps) {
  const [source, setSource] = useState("COA-SOCPA");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showExpired, setShowExpired] = useState(false);
  const effectiveCharts = charts && charts.length > 0 ? charts : CHARTS;
  const sourceCharts = useMemo(
    () => effectiveCharts.filter((c) => c.tier !== "group"),
    [effectiveCharts],
  );

  useEffect(() => {
    if (sourceCharts.length === 0) return;
    if (!sourceCharts.some((chart) => chart.code === source)) {
      setSource(sourceCharts[0]!.code);
    }
  }, [source, sourceCharts]);

  const filtered = useMemo(() => {
    return MAPPINGS.filter((m) =>
      m.sourceChart === source &&
      (typeFilter === "all" || m.mappingType === typeFilter) &&
      (showExpired || m.status === "active"),
    );
  }, [source, typeFilter, showExpired]);

  // Validate split groups sum to 100%
  const splitGroups: Record<string, number> = {};
  filtered
    .filter((m) => m.mappingType === "split")
    .forEach((m) => {
      splitGroups[m.sourceAccount] = (splitGroups[m.sourceAccount] ?? 0) + (m.allocationPct ?? 0);
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isLoadingCharts ? "Loading charts..." : "Source: master.coa_account_mapping · Effective-dated, versioned"}
        </span>
        <Button size="sm" className="h-7 gap-1 text-xs">
          <Plus size={12} />
          New mapping
        </Button>
      </div>

      {/* Source → Target selector */}
      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border">
        <div className="flex-1">
          <div className="text-sm font-medium text-muted-foreground mb-0.5">Source chart</div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourceCharts.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight size={18} className="text-muted-foreground mt-3 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium text-muted-foreground mb-0.5">Target (group)</div>
          <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-xs tabular-nums">
            COA-IFRS-GROUP
          </div>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2">
        {["all", "direct", "merge", "split"].map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? "primary" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setTypeFilter(t)}
          >
            {t === "all" ? "All" : t}
          </Button>
        ))}
        <Button
          variant={showExpired ? "primary" : "outline"}
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={() => setShowExpired(!showExpired)}
        >
          Show expired
        </Button>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">{filtered.length} mappings</span>
      </div>

      {/* Split validation warnings */}
      {Object.entries(splitGroups)
        .filter(([, total]) => total !== 100)
        .map(([account, total]) => (
          <div
            key={account}
            className="flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg border border-warning/20 text-xs text-warning"
          >
            <AlertTriangle size={13} />
            <span className="tabular-nums font-medium">{account}</span>: split allocations total{" "}
            {total}% — must be 100%
          </div>
        ))}

      {/* Mapping table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Source account</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Source name</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Type</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">%</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">→</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Group account</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Group name</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Effective</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground">Ver</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground">Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr
                key={m.id}
                className={cn(
                  "border-b last:border-0 hover:bg-muted/30 transition-colors",
                  m.status === "expired" && "opacity-50",
                )}
              >
                <td className="py-1.5 px-2 tabular-nums">{m.sourceAccount}</td>
                <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[140px]">{m.sourceName}</td>
                <td className="py-1.5 px-2 text-center">
                  <Badge variant="outline" className={cn("text-xs py-0", TYPE_STYLE[m.mappingType])}>
                    {m.mappingType}
                  </Badge>
                </td>
                <td className="py-1.5 px-2 text-center tabular-nums">{m.allocationPct ? `${m.allocationPct}%` : "—"}</td>
                <td className="py-1.5 px-2 text-center">
                  <ArrowRight size={11} className="text-muted-foreground mx-auto" />
                </td>
                <td className="py-1.5 px-2 tabular-nums">{m.targetAccount}</td>
                <td className="py-1.5 px-2 text-muted-foreground">{m.targetName}</td>
                <td className="py-1.5 px-2 text-muted-foreground tabular-nums text-sm font-medium">
                  {m.effectiveFrom}{m.effectiveTo ? ` → ${m.effectiveTo}` : ""}
                </td>
                <td className="py-1.5 px-2 text-center text-muted-foreground">v{m.version}</td>
                <td className="py-1.5 px-2">
                  <Badge variant="outline" className={cn("text-xs py-0", STATUS_STYLE[m.status])}>
                    {m.status}
                  </Badge>
                </td>
                <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[120px]">{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />direct: 1:1</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" />merge: N:1 rollup</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />split: 1:N with % (must sum to 100%)</span>
      </div>
    </div>
  );
}
