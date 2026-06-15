"use client";

/**
 * RuntimeSelectionBar — surface adapter for the runtime master/lookup list.
 *
 * Thin wrapper around the shared `@athyper/ui/composites/FloatingSelectionBar`.
 * Maps the bookmark-state callbacks into the data-driven `actions[]`
 * contract. The component's external prop shape is preserved so
 * `SelectionIsland.tsx` consumers do not need to change.
 */

import { useMemo } from "react";
import { Star, StarOff } from "lucide-react";
import {
  FloatingSelectionBar,
  type SelectionAction,
} from "@athyper/ui/composites";
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
  const actions = useMemo<SelectionAction[]>(() => [
    {
      id:       "favourite",
      label:    "Mark as Favourite",
      icon:     Star,
      group:    "primary",
      disabled: markFavouriteDisabled,
      onSelect: onMarkFavourite,
    },
    {
      id:       "unfavourite",
      label:    "Remove Favourite",
      icon:     StarOff,
      group:    "primary",
      disabled: removeFavouriteDisabled,
      onSelect: onRemoveFavourite,
    },
  ], [markFavouriteDisabled, removeFavouriteDisabled, onMarkFavourite, onRemoveFavourite]);

  // `runtimeListText.summary.selectedCount` was used for SR-friendly text in
  // the previous implementation. The shared primitive now formats this via
  // its `noun` prop; we use generic "record(s)" to match the existing string.
  void runtimeListText;

  return (
    <FloatingSelectionBar
      count={count}
      noun={{ singular: "record", plural: "records" }}
      actions={actions}
      onClear={onClear}
      enableShortcuts={false}
      autoFocus="keyboard-only"
      testId="runtime-selection-bar"
    />
  );
}
