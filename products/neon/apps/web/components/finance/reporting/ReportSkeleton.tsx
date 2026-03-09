"use client";

// components/finance/reporting/ReportSkeleton.tsx
//
// Multi-row table skeleton for reporting components.
// Renders a realistic loading state that matches the final table layout.

import { Card } from "@neon/ui";
import { cn } from "@/lib/utils";

interface ReportSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  showSummaryCards?: boolean;
}

export function ReportSkeleton({
  rows = 8,
  columns = 5,
  showHeader = true,
  showSummaryCards = false,
}: ReportSkeletonProps) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Summary cards skeleton */}
      {showSummaryCards && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <div className="h-3 w-16 rounded bg-muted mb-2" />
              <div className="h-6 w-24 rounded bg-muted" />
            </Card>
          ))}
        </div>
      )}

      {/* Table skeleton */}
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        {showHeader && (
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2.5">
            {Array.from({ length: columns }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-3 rounded bg-muted/80",
                  i === 0 ? "w-32" : "w-16 ml-auto",
                )}
              />
            ))}
          </div>
        )}

        {/* Rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5",
              rowIdx < rows - 1 && "border-b",
            )}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div
                key={colIdx}
                className={cn(
                  "h-3.5 rounded bg-muted",
                  colIdx === 0
                    ? "w-40"
                    : "w-14 ml-auto",
                )}
                style={{
                  opacity: 0.4 + Math.random() * 0.4,
                  width: colIdx === 0
                    ? `${100 + Math.floor(Math.random() * 60)}px`
                    : `${40 + Math.floor(Math.random() * 24)}px`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
