"use client";

import { cn } from "@athyper/theme/utils";

export interface DocumentSectionSkeletonProps {
  /**
   * Minimum height the skeleton reserves. Keeps the page's scroll height
   * stable so scrollspy thresholds don't shift between skeleton and content.
   * Default 260px — tuned for a typical fields-panel section.
   */
  minHeight?: number;
  /** Optional className on the wrapper. */
  className?: string;
}

/**
 * Placeholder shown inside a `<DocumentSection>` while its data has not been
 * loaded yet (per its `loadPolicy`). Reserves height so the section anchor
 * stays in the same scroll position before and after content arrives,
 * preventing scrollspy band drift and link-anchor jumps.
 *
 * Reusable across neon / mesh / admin.
 */
export function DocumentSectionSkeleton({
  minHeight = 260,
  className,
}: DocumentSectionSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      data-document-section-skeleton=""
      style={{ minHeight: `${minHeight}px` }}
      className={cn("space-y-3 px-4 sm:px-6 py-4", className)}
    >
      <div className="h-4 w-1/3 rounded bg-muted/60 animate-pulse" />
      <div className="h-4 w-1/2 rounded bg-muted/60 animate-pulse" />
      <div className="h-32 w-full rounded bg-muted/40 animate-pulse" />
    </div>
  );
}
