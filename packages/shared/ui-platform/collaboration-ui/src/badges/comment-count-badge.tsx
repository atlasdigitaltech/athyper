"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface CommentCountBadgeProps {
  /** Total comment count (resolved + unresolved). Hidden when 0. */
  total:      number;
  /** Whether any comment in the thread is unresolved. Shows accent dot. */
  hasOpen:    boolean;
  /** Called when the badge is clicked. Caller handles navigation. */
  onClick?:   () => void;
  className?: string;
}

/**
 * CommentCountBadge — speech-bubble count for list rows.
 *
 * Lifecycle-aware rendering:
 *   total = 0           → renders nothing
 *   total > 0, !hasOpen → count in muted foreground (all resolved)
 *   total > 0, hasOpen  → count + accent dot in info intent color
 *
 * The accent dot color is resolved through resolveSemanticColors('info')
 * to preserve semantic intent invariant (§2.2). Never a hardcoded class.
 *
 * Props-driven; no internal fetching. Parent batch-fetches counts for
 * all visible row IDs via useCommentCounts.
 */
export function CommentCountBadge({
  total,
  hasOpen,
  onClick,
  className,
}: CommentCountBadgeProps) {
  if (total === 0) return null;

  return (
    <button
      aria-label={`${total} comment${total === 1 ? "" : "s"}${hasOpen ? ", some unresolved" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "flex items-center gap-0.5 rounded p-0.5",
        "text-muted-foreground/50 hover:text-muted-foreground transition-colors",
        className,
      )}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      <span className="text-xs tabular-nums leading-none">{total}</span>

    </button>
  );
}
