"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "./format";

export interface StatementLineItem {
  accountCode: string;
  accountName: string;
  current: number;
  prior?: number;
  /** If true, bold + divider treatment */
  isTotal?: boolean;
  isSubtotal?: boolean;
}

interface StatementRowProps {
  row: StatementLineItem;
  showComparative?: boolean;
  indent?: number;
  onSelect?: (code: string) => void;
}

export function StatementRow({
  row,
  showComparative = false,
  indent = 0,
  onSelect,
}: StatementRowProps) {
  const variance =
    showComparative && row.prior !== undefined
      ? row.current - row.prior
      : null;

  const isClickable = !!onSelect && !row.isTotal && !row.isSubtotal;

  return (
    <div
      onClick={isClickable ? () => onSelect?.(row.accountCode) : undefined}
      className={cn(
        "flex items-center py-[3px] transition-colors",
        isClickable && "cursor-pointer hover:bg-muted/30",
        row.isTotal && "font-semibold bg-muted/20 border-t",
        row.isSubtotal && "font-medium",
      )}
      style={{ paddingLeft: `${indent * 16 + 8}px` }}
    >
      <span className={cn(
        "font-mono text-[9px] text-muted-foreground w-16 shrink-0",
        (row.isTotal || row.isSubtotal) && "text-foreground",
      )}>
        {!row.isTotal ? row.accountCode : ""}
      </span>
      <span className={cn(
        "text-[11px] flex-1 truncate",
        row.isTotal && "text-xs",
      )}>
        {row.accountName}
      </span>

      <div className="flex items-center gap-6 pr-0">
        <span className={cn(
          "font-mono text-[11px] w-28 text-right",
          row.isTotal && "text-xs font-bold",
          row.current < 0 && "text-destructive",
        )}>
          {fmtCompact(row.current)}
        </span>
        {showComparative && (
          <>
            <span className="font-mono text-[11px] w-28 text-right text-muted-foreground">
              {row.prior !== undefined ? fmtCompact(row.prior) : "—"}
            </span>
            <span
              className={cn(
                "font-mono text-[11px] w-20 text-right",
                variance !== null && variance > 0
                  ? "text-success"
                  : variance !== null && variance < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {variance !== null ? fmtCompact(variance) : "—"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
