"use client";

import { Filter } from "lucide-react";
import { useOptionalOrganizeFilterPanel } from "./organize/organize-state";

interface RuntimeColumnFilterButtonProps {
  fieldName: string;
  fieldLabel: string;
  active: boolean;
}

/** Opens the canonical filter drawer with one metadata-backed field staged. */
export function RuntimeColumnFilterButton({
  fieldName,
  fieldLabel,
  active,
}: RuntimeColumnFilterButtonProps) {
  const panel = useOptionalOrganizeFilterPanel();
  if (!panel) return null;

  const expanded = panel.open && panel.requestedFieldName === fieldName;

  return (
    <button
      type="button"
      aria-label={active ? `Edit filter for ${fieldLabel}` : `Filter by ${fieldLabel}`}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      title={active ? `Edit ${fieldLabel} filter` : `Filter by ${fieldLabel}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        panel.showField(fieldName, event.currentTarget);
      }}
      className={[
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-sm outline-none transition-[color,background-color,opacity] duration-150 hover:bg-background/80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        active
          ? "text-primary opacity-100"
          : "text-muted-foreground opacity-0 group-hover/header:opacity-50",
      ].join(" ")}
      data-runtime-column-filter
      data-active={active ? "true" : "false"}
    >
      <Filter aria-hidden="true" className="size-3.5" />
      {active && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary ring-1 ring-muted"
        />
      )}
    </button>
  );
}
