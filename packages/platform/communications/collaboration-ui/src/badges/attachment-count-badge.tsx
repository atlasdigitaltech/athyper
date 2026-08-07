"use client";

import { Paperclip } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

export interface AttachmentCountBadgeProps {
  count:      number;
  className?: string;
}

/**
 * AttachmentCountBadge — paperclip count for list rows.
 * Hidden when count = 0. Count sourced from row.attachment_count.
 */
export function AttachmentCountBadge({ count, className }: AttachmentCountBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} attachment${count === 1 ? "" : "s"}`}
      className={cn(
        "flex items-center gap-0.5 rounded p-0.5",
        "text-muted-foreground/50",
        className,
      )}
    >
      <Paperclip className="h-3.5 w-3.5" />
      <span className="text-xs tabular-nums leading-none">{count}</span>
    </span>
  );
}
