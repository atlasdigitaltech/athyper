"use client";

// components/mesh/list/KpiSummaryBar.tsx
//
// Zone 2 — Responsive row of clickable KPI metric cards.

import { useListPage, useListPageActions } from "./ListPageContext";

import { Card, CardContent } from "@/components/ui/card";
import { KPI_CARD, KPI_VALUE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

function formatKpiValue(
  value: number | string,
  format?: "number" | "currency" | "percent",
): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value}%`;
    default:
      return new Intl.NumberFormat("en-US").format(value);
  }
}

export function KpiSummaryBar<T>() {
  const { config, allItems } = useListPage<T>();
  const actions = useListPageActions();

  if (!config.kpis || config.kpis.length === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {config.kpis.map((kpi) => {
        const rawValue = kpi.compute(allItems);
        const numericValue = typeof rawValue === "number" ? rawValue : 0;
        const variant =
          kpi.variantFn?.(numericValue) ?? kpi.variant ?? "default";
        const displayValue = formatKpiValue(rawValue, kpi.format);
        const isClickable = !!kpi.filterOnClick;

        return (
          <Card
            key={kpi.id}
            className={cn(
              "transition-all",
              KPI_CARD[variant],
              isClickable && "cursor-pointer hover:shadow-md",
            )}
            onClick={
              isClickable
                ? () => actions.setFilters(kpi.filterOnClick!)
                : undefined
            }
          >
            <CardContent className="flex items-center gap-3 p-3">
              <div className="rounded-md bg-muted p-2">
                <kpi.icon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    KPI_VALUE[variant],
                  )}
                >
                  {displayValue}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {kpi.label}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
