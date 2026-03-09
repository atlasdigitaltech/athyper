"use client";

/**
 * Shared Loading States
 *
 * Standardized loading indicators for all modules. Replaces the
 * inline Loader2 + animate-spin patterns scattered across 50+ components.
 *
 * Usage:
 *   <LoadingSpinner />                          // centered spinner
 *   <LoadingSpinner message="Loading report..." />
 *   <LoadingSkeleton lines={5} />               // skeleton rows
 *   <LoadingOverlay />                          // full-area overlay
 */

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Spinner — centered loading indicator
// ---------------------------------------------------------------------------

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SPINNER_SIZES = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
} as const;

export function LoadingSpinner({
  message,
  className,
  size = "md",
}: LoadingSpinnerProps) {
  return (
    <div
      className={`flex items-center justify-center py-12 ${className ?? ""}`}
    >
      <Loader2
        className={`${SPINNER_SIZES[size]} animate-spin text-muted-foreground`}
      />
      {message && (
        <span className="ml-2 text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — content placeholder
// ---------------------------------------------------------------------------

interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({
  lines = 3,
  className,
}: LoadingSkeletonProps) {
  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton — for list/table loading
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 py-1">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              className={`h-4 flex-1 ${c === 0 ? "w-[140px]" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay — covers parent with a semi-transparent loading indicator
// ---------------------------------------------------------------------------

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {message ?? "Loading..."}
      </div>
    </div>
  );
}
