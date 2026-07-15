"use client";

import { Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import {
  useReasonCodeCatalog,
  resolveReasonEntry,
} from "../../hooks/useReasonCodeCatalog";
import type { PostabilityChip as PostabilityChipValue } from "../../lib/finance-setup.types";

const CHIP_VARIANT: Record<PostabilityChipValue, "success" | "warning" | "info" | "destructive"> = {
  postable:         "success",
  adjustment_only:  "warning",
  read_only:        "info",
  locked:           "destructive",
};

const CHIP_LABEL: Record<PostabilityChipValue, string> = {
  postable:         "Postable",
  adjustment_only:  "Adjustment only",
  read_only:        "Read-only",
  locked:           "Locked",
};

export interface PostabilityChipProps {
  chip:        PostabilityChipValue;
  reasonCode?: string;
  reasonCodes?: string[];
  /** Show the reason text next to the chip badge. Default: false. */
  showReason?: boolean;
  size?:       "sm" | "md";
  className?:  string;
}

export function PostabilityChip({
  chip,
  reasonCode,
  reasonCodes,
  showReason = false,
  size = "md",
  className,
}: PostabilityChipProps) {
  const { data: catalog } = useReasonCodeCatalog();
  const codes = reasonCodes && reasonCodes.length > 0
    ? reasonCodes
    : reasonCode
      ? [reasonCode]
      : [];
  const entries = codes.map((c) => resolveReasonEntry(c, catalog));
  const reasonText = entries.map((e) => e.name).join(" · ");
  const ariaLabel = reasonText
    ? `${CHIP_LABEL[chip]}. Reason: ${reasonText}`
    : CHIP_LABEL[chip];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="status"
      aria-label={ariaLabel}
      title={reasonText || undefined}
    >
      <Badge
        variant={CHIP_VARIANT[chip]}
        size={size}
        data-testid={`postability-chip-${chip}`}
      >
        {CHIP_LABEL[chip]}
      </Badge>
      {showReason && reasonText ? (
        <span className="text-xs text-muted-foreground">{reasonText}</span>
      ) : null}
    </span>
  );
}
