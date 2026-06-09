/**
 * @athyper/shell — NavBadge
 *
 * Shared notification/count badge used across NavRail, Topbar, and ContextPanel.
 *
 * Two variants:
 *   overlay — absolutely positioned over an icon button (inbox, notifications)
 *   inline  — inline badge beside a list item label (pinned items, modules)
 */

import { cn } from "@athyper/theme/utils";

export interface NavBadgeProps {
  count: number;
  variant?: "overlay" | "inline";
  /** Custom aria label; defaults to "{count} unread". */
  ariaLabel?: string;
}

export function NavBadge({ count, variant = "inline", ariaLabel }: NavBadgeProps) {
  const safeCount = normalizeCount(count);
  if (safeCount <= 0) return null;

  const label = ariaLabel ?? `${safeCount} unread`;
  const display = safeCount > 99 ? "99+" : safeCount;

  return (
    <span
      aria-label={label}
      className={cn(
        "flex items-center justify-center rounded-full bg-destructive font-medium leading-none text-destructive-foreground",
        variant === "overlay"
          ? "absolute right-0.5 top-0.5 h-3.5 min-w-3.5 px-0.5 text-xs"
          : "h-4 min-w-4 shrink-0 px-1 text-xs",
      )}
    >
      {display}
    </span>
  );
}

function normalizeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}
