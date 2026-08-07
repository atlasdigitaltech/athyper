"use client";

import { Star } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

export interface BookmarkToggleProps {
  bookmarked:  boolean;
  recordId:    string;
  onToggle:    (recordId: string) => void;
  /** Loading state during optimistic update flush */
  isPending?:  boolean;
  className?:  string;
}

/**
 * BookmarkToggle — per-row favourites icon.
 *
 * Props-driven: no internal data fetching.
 * Parent (RowMetaStrip) resolves bookmark state via useRecordBookmarks
 * and passes it down after batch-fetching for all visible rows.
 *
 * Colors: resolved via Tailwind semantic tokens (text-primary for active),
 * never hardcoded hex values. Satisfies §2.2 semantic intent preservation.
 */
export function BookmarkToggle({
  bookmarked,
  recordId,
  onToggle,
  isPending = false,
  className,
}: BookmarkToggleProps) {
  return (
    <button
      aria-label={bookmarked ? "Remove from favourites" : "Add to favourites"}
      title={bookmarked ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={bookmarked}
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation(); // don't navigate to detail page
        onToggle(recordId);
      }}
      className={cn(
        "flex items-center justify-center rounded p-0.5 transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        bookmarked
          ? "text-primary hover:text-primary/70"
          : "text-muted-foreground/30 hover:text-primary/60",
        className,
      )}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5 transition-all",
          bookmarked && "fill-current",
        )}
      />
    </button>
  );
}
