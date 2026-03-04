"use client";

// components/mesh/list/GroupSection.tsx
//
// Shared group header row for table views (EntityDataGrid, AdjustableDataGrid).
// Renders a full-width row with expand/collapse chevron, field label, group
// label, and item count badge.

import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface GroupSectionProps {
  label: string;
  /** Column header prefix, e.g. "Status" → renders "Status: Active" */
  fieldLabel?: string;
  count: number;
  collapsed: boolean;
  totalCols: number;
  onToggle: () => void;
  /** Nesting depth for multi-level grouping (default 0). */
  depth?: number;
  children: React.ReactNode;
}

export function GroupSection({
  label,
  fieldLabel,
  count,
  collapsed,
  totalCols,
  onToggle,
  depth = 0,
  children,
}: GroupSectionProps) {
  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer hover:bg-muted/60",
          depth === 0 && "bg-muted/40",
          depth === 1 && "bg-muted/25",
          depth >= 2 && "bg-muted/15",
        )}
        onClick={onToggle}
      >
        <TableCell colSpan={totalCols} className="py-1.5">
          <div
            className="flex items-center gap-2"
            style={depth > 0 ? { paddingLeft: `${depth * 24}px` } : undefined}
          >
            <Button variant="ghost" size="icon" className="size-6">
              {collapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </Button>
            {fieldLabel && (
              <span className="text-[10px] text-muted-foreground">
                {fieldLabel}:
              </span>
            )}
            <span className="text-xs font-medium">{label}</span>
            <Badge variant="secondary" className="text-[10px]">
              {count}
            </Badge>
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
