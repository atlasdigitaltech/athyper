/**
 * MarkAllReadButton Component
 *
 * Bulk action button to mark all notifications as read.
 */

"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/utils";

export interface MarkAllReadButtonProps {
  onMarkAllRead: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function MarkAllReadButton({
  onMarkAllRead,
  disabled = false,
  className,
}: MarkAllReadButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onMarkAllRead();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium",
        "rounded-xs border border-border bg-background",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-50 disabled:pointer-events-none",
        "transition-colors",
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CheckCheck className="size-4" />
      )}
      <span>Mark all read</span>
    </button>
  );
}
