"use client";

import { X } from "lucide-react";

interface ValueChipProps {
  /** Display text for this value. */
  label: string;
  /**
   * When provided the chip renders a remove button.
   * Omit for read-only / summary display contexts.
   */
  onRemove?: () => void;
  /** Additional classes merged onto the chip span. */
  className?: string;
}

/**
 * Compact chip representing a single applied filter value.
 *
 * Used in:
 * - Applied-filter summary bars (outside the palette)
 * - Multi-select value displays inside the filter panel
 *
 * Styling: `rounded-md` (not `rounded-full`) to match StatusBadge and platform
 * tag conventions. Omit `onRemove` for static/read-only display.
 */
export function ValueChip({ label, onRemove, className }: ValueChipProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className="max-w-[8rem] truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
