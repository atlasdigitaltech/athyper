"use client";

import { Lock, Unlock } from "lucide-react";
import { Badge, Skeleton } from "@athyper/ui/primitives";
import type { ChartOfAccount } from "../data/types";
import { TierBadge } from "../components/ChartBadge";
import { useCharts } from "../hooks/useCharts";

interface CoaCatalogViewProps {
  onOpenChart: (chart: ChartOfAccount) => void;
}

export function CoaCatalogView({ onOpenChart }: CoaCatalogViewProps) {
  const { data: charts, isLoading } = useCharts();

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-muted-foreground">
        {isLoading ? "Loading…" : `${charts?.length ?? 0} charts · 3-tier architecture`}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Code</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Framework</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Tier</th>
              <th className="py-2 px-3 text-center font-medium text-muted-foreground">Country</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Accounts</th>
              <th className="py-2 px-3 text-center font-medium text-muted-foreground">Ver</th>
              <th className="py-2 px-3 text-center font-medium text-muted-foreground">Lock</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Assignments</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={9} className="py-2 px-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              : (charts ?? []).map((chart) => (
                  <tr
                    key={chart.id}
                    onClick={() => onOpenChart(chart)}
                    className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2 px-3 font-mono font-medium">{chart.code}</td>
                    <td className="py-2 px-3">{chart.name}</td>
                    <td className="py-2 px-3">
                      <Badge variant="muted" className="text-[10px] py-0">{chart.framework}</Badge>
                    </td>
                    <td className="py-2 px-3"><TierBadge tier={chart.tier} /></td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{chart.country ?? "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{chart.accountCount}</td>
                    <td className="py-2 px-3 text-center text-muted-foreground">v{chart.version}</td>
                    <td className="py-2 px-3 text-center">
                      {chart.isLocked
                        ? <Lock size={12} className="text-warning mx-auto" />
                        : <Unlock size={12} className="text-muted-foreground/30 mx-auto" />}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {(chart as ChartOfAccount & { assignmentCount?: number }).assignmentCount ?? "—"}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
