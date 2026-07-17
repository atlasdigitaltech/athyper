"use client";

import { Button } from "@athyper/ui";

interface PaletteDrawerActionsProps {
  onApply:        () => void;
  onReset:        () => void;
  onDiscard:      () => void;
  hasChanges?:    boolean;
  applyDisabled?: boolean;
  applyLabel?:    string;
  resetLabel?:    string;
  discardLabel?:  string;
  layout?:        "grid" | "inline";
}

export function PaletteDrawerActions({
  onApply,
  onReset,
  onDiscard,
  hasChanges,
  applyDisabled = false,
  applyLabel = "Apply",
  resetLabel = "Reset",
  discardLabel = "Discard",
  layout = "grid",
}: PaletteDrawerActionsProps) {
  const canApply = (hasChanges ?? !applyDisabled) && !applyDisabled;
  const applyButton = (
    <Button
      type="button"
      onClick={onApply}
      disabled={!canApply}
      variant="primary"
      size="md"
      className={layout === "inline" ? undefined : "w-full"}
    >
      {applyLabel}
    </Button>
  );
  const resetButton = (
    <Button
      type="button"
      onClick={onReset}
      variant="outline"
      size="md"
      className={layout === "inline" ? undefined : "w-full"}
    >
      {resetLabel}
    </Button>
  );
  const discardButton = (
    <Button
      type="button"
      onClick={onDiscard}
      variant="ghost"
      size="md"
      className={layout === "inline" ? "text-muted-foreground" : "w-full text-muted-foreground"}
    >
      {discardLabel}
    </Button>
  );

  if (layout === "inline") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto">{resetButton}</div>
        {discardButton}
        {applyButton}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {applyButton}
      {resetButton}
      {discardButton}
    </div>
  );
}
