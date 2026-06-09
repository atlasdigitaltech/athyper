"use client";

import { Star, StarOff } from "lucide-react";
import { runtimeListText } from "../core/resources";

interface RuntimeSelectionBarProps {
  count:                   number;
  markFavouriteDisabled:   boolean;
  onMarkFavourite:         () => void;
  removeFavouriteDisabled: boolean;
  onRemoveFavourite:       () => void;
  onClear:                 () => void;
}

export function RuntimeSelectionBar({
  count,
  markFavouriteDisabled,
  onMarkFavourite,
  removeFavouriteDisabled,
  onRemoveFavourite,
  onClear,
}: RuntimeSelectionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg ring-1 ring-border">
        <span className="text-sm font-medium text-foreground">
          {runtimeListText.summary.selectedCount(count)}
        </span>
        <div className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onMarkFavourite}
          disabled={markFavouriteDisabled}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-muted-foreground/45"
        >
          <Star aria-hidden="true" className="size-3.5" />
          Mark as Favourite
        </button>
        <button
          type="button"
          onClick={onRemoveFavourite}
          disabled={removeFavouriteDisabled}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-muted-foreground/45"
        >
          <StarOff aria-hidden="true" className="size-3.5" />
          Remove Favourite
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {runtimeListText.actions.clear}
        </button>
      </div>
    </div>
  );
}
