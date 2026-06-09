"use client";

/**
 * MyWorkDropdown — toolbar dropdown for quick personal-scope filters.
 *
 * Options rendered (metadata-gated):
 *   All             — always; clears personal-scope virtual filters
 *   My favourites   — always (bookmark infrastructure is unconditional)
 *
 * Applies virtual bookmark filters which are
 * resolved server-side before the main field-filter builder.
 * Does NOT affect sort, columns, view mode, or saved-view schema (shell contract §stability).
 */

import { useState } from "react";
import { ChevronDown, Check, UserCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { EntityListFilters } from "@athyper/api-contracts/entity-list";

// Virtual filter keys written by this dropdown
const VK_BOOKMARKED = "__bookmarked";

type VirtualMode = "all" | "favourites";

function activeMode(filters: EntityListFilters): VirtualMode {
  const f = filters as Record<string, unknown>;
  if (f[VK_BOOKMARKED]) return "favourites";
  return "all";
}

export interface MyWorkDropdownProps {
  entity:        CompiledEntity;
  activeFilters: EntityListFilters;
  onSetFilters:  (filters: EntityListFilters) => void;
}

export function MyWorkDropdown({
  entity: _entity,
  activeFilters,
  onSetFilters,
}: MyWorkDropdownProps) {
  const [open, setOpen] = useState(false);

  const current = activeMode(activeFilters);
  const isPersonal = current !== "all";

  const strip = (filters: EntityListFilters): EntityListFilters => {
    const next = { ...filters } as Record<string, unknown>;
    delete next[VK_BOOKMARKED];
    return next as EntityListFilters;
  };

  const apply = (mode: VirtualMode) => {
    setOpen(false);
    const base = strip(activeFilters);
    if (mode === "all")      { onSetFilters(base); return; }
    if (mode === "favourites") { onSetFilters({ ...base, [VK_BOOKMARKED]: { op: "eq", value: [true]  } } as EntityListFilters); return; }
  };

  const label =
    current === "favourites" ? "My favourites"  :
    "My Work";

  const options: { mode: VirtualMode; label: string; show: boolean }[] = [
    { mode: "all",      label: "All",             show: true             },
    { mode: "favourites", label: "My favourites", show: true             },
  ];

  const visibleOptions = options.filter((o) => o.show);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-1 rounded-md border border-input bg-background shadow-sm px-2.5 text-xs font-medium transition-colors",
          isPersonal
            ? "border-primary/40 bg-primary/5 text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <UserCircle className={cn("h-3.5 w-3.5 shrink-0", isPersonal ? "text-primary" : "text-muted-foreground")} />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border bg-popover py-1 shadow-md">
            {visibleOptions.map(({ mode, label: optLabel }) => (
              <button
                key={mode}
                onClick={() => apply(mode)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors"
              >
                <span className={cn("h-3 w-3 shrink-0", current === mode ? "opacity-100" : "opacity-0")}>
                  <Check className="h-3 w-3 text-primary" />
                </span>
                <span className={cn(current === mode && "font-medium text-foreground", "text-muted-foreground")}>
                  {optLabel}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
