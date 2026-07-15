"use client";

import { Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { DefinitionState, DefinitionStateVocabulary } from "../../lib/finance-setup.types";

const STATE_VARIANT: Record<DefinitionState, "muted" | "success" | "outline"> = {
  draft:    "muted",
  active:   "success",
  inactive: "outline",
};

const STATE_LABEL: Record<DefinitionState, string> = {
  draft:    "Draft",
  active:   "Active",
  inactive: "Inactive",
};

export interface DefinitionStateChipProps {
  state:      DefinitionState;
  /** F2 audit: object-specific vocabulary. Chip refuses to render states outside vocabulary. */
  vocabulary: DefinitionStateVocabulary;
  objectKind?: string;
  size?:      "sm" | "md";
  className?: string;
}

export function DefinitionStateChip({
  state,
  vocabulary,
  objectKind,
  size = "md",
  className,
}: DefinitionStateChipProps) {
  if (!vocabulary.includes(state)) {
    // Defensive: never render a state the object doesn't support.
    return (
      <Badge variant="outline" size={size} className={className} data-testid="definition-chip-unsupported">
        {state}
      </Badge>
    );
  }
  return (
    <Badge
      variant={STATE_VARIANT[state]}
      size={size}
      className={cn(className)}
      role="status"
      aria-label={`${STATE_LABEL[state]}${objectKind ? ` (${objectKind})` : ""}`}
      data-testid={`definition-chip-${state}`}
    >
      {STATE_LABEL[state]}
    </Badge>
  );
}
