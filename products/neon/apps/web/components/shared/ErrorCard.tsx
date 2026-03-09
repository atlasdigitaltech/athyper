"use client";

/**
 * Shared Error Display
 *
 * Standardized error card for all modules. Replaces the 10+ inline
 * error patterns (text-destructive, border-destructive, etc.) with
 * a single, consistent component.
 *
 * Usage:
 *   <ErrorCard message={error} />
 *   <ErrorCard message={error} onRetry={refresh} />
 *   <ErrorCard message={error} title="Failed to load GL report" />
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorCardProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorCard({
  message,
  title,
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorCardProps) {
  return (
    <div
      className={`rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center ${className ?? ""}`}
    >
      <div className="flex flex-col items-center gap-2">
        <AlertCircle className="size-5 text-destructive" />
        {title && (
          <p className="text-sm font-medium text-destructive">{title}</p>
        )}
        <p className="text-sm text-destructive">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="mr-1.5 size-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Inline error text for compact error display (e.g., inside panels).
 */
export function ErrorInline({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-auto shrink-0 text-xs underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
