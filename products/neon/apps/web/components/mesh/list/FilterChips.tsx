"use client";

// components/mesh/list/FilterChips.tsx
//
// Renders active filters as removable badge chips below the command bar.

import { X } from "lucide-react";

import { useListPage, useListPageActions } from "./ListPageContext";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FilterChips<T>() {
  const { state, config } = useListPage<T>();
  const actions = useListPageActions();

  // Collect active (non-default) filters
  const chips: {
    key: string;
    label: string;
    value: string;
    removable: boolean;
  }[] = [];

  if (state.search) {
    chips.push({
      key: "__search",
      label: "Search",
      value: state.search,
      removable: true,
    });
  }

  const quickFilterIds = new Set(config.quickFilters.map((qf) => qf.id));

  for (const qf of config.quickFilters) {
    const current = state.filters[qf.id];
    if (current && current !== qf.defaultValue) {
      const optLabel =
        qf.options.find((o) => o.value === current)?.label ?? current;
      chips.push({
        key: qf.id,
        label: qf.label,
        value: optLabel,
        removable: true,
      });
    }
  }

  // Column-based text filters (e.g. Code, Name)
  for (const [filterId, value] of Object.entries(state.filters)) {
    if (!value || quickFilterIds.has(filterId)) continue;
    const col = config.columns.find((c) => c.id === filterId);
    if (col) {
      chips.push({
        key: filterId,
        label: col.header || filterId,
        value,
        removable: true,
      });
    }
  }

  // Sort chip (multi-sort summary)
  if (state.sortRules.length > 0) {
    const parts = state.sortRules.map((r) => {
      const col = config.columns.find((c) => c.sortKey === r.fieldId);
      return `${col?.header ?? r.fieldId} ${r.dir === "asc" ? "\u2191" : "\u2193"}`;
    });
    chips.push({
      key: "__sort",
      label: "Sort",
      value: parts.join(", "),
      removable: true,
    });
  }

  // Group-by chip
  if (state.groupBy.length > 0) {
    const parts = state.groupBy.map((r) => {
      const col = config.columns.find((c) => c.id === r.fieldId);
      return col?.header ?? r.fieldId;
    });
    chips.push({
      key: "__group",
      label: "Grouped by",
      value: parts.join(", "),
      removable: true,
    });
  }

  // Density chip (only if user changed from the responsive system default)
  const mobileDefault = config.defaultDensity ?? "compact";
  const desktopDefault = config.defaultDensityDesktop ?? mobileDefault;
  const effectiveDefaultDensity =
    typeof window !== "undefined" && window.innerWidth >= 1024
      ? desktopDefault
      : mobileDefault;
  if (state.density !== effectiveDefaultDensity) {
    chips.push({
      key: "__density",
      label: "Density",
      value: state.density,
      removable: true,
    });
  }

  if (chips.length === 0) return null;

  const handleRemove = (key: string) => {
    if (key === "__search") {
      actions.setSearch("");
    } else if (key === "__sort") {
      actions.setSortRules([]);
    } else if (key === "__group") {
      actions.setGroupBy([]);
    } else if (key === "__density") {
      actions.setDensity(effectiveDefaultDensity);
    } else {
      const qf = config.quickFilters.find((f) => f.id === key);
      if (qf) {
        actions.setFilter(key, qf.defaultValue);
      } else {
        actions.removeFilter(key);
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground/70">
        Active filters:
      </span>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="h-5 gap-0.5 px-1.5 pr-0.5 text-[10px] font-normal"
        >
          <span className="text-muted-foreground">{chip.label}:</span>
          {chip.value}
          <button
            type="button"
            className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
            onClick={() => handleRemove(chip.key)}
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
          onClick={actions.clearFilters}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
