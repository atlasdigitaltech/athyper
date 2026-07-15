"use client";

import { ORGANIZE_SECONDARY_BUTTON_CLASS } from "./palette-styles";

interface PaletteDrawerActionsProps {
  onApply:        () => void;
  onReset:        () => void;
  onDiscard:      () => void;
  hasChanges?:    boolean;
  applyDisabled?: boolean;
}

export function PaletteDrawerActions({
  onApply,
  onReset,
  onDiscard,
  hasChanges,
  applyDisabled = false,
}: PaletteDrawerActionsProps) {
  const canApply = (hasChanges ?? !applyDisabled) && !applyDisabled;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onReset}
        className={ORGANIZE_SECONDARY_BUTTON_CLASS}
      >
        Reset
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Discard
      </button>
    </div>
  );
}
