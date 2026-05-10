"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "./format";
import { openAppRecordFromContextMenu } from "../lib/recordLinks";

export interface StatementLineItem {
  accountCode: string;
  accountName: string;
  current: number;
  prior?: number;
  buckets?: Record<string, number>;
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
  const isRecordLink = !row.isTotal && !row.isSubtotal && !!row.accountCode;

  return (
    <div
      onClick={isClickable ? () => onSelect?.(row.accountCode) : undefined}
      className={cn(
        "flex items-center py-1.5 transition-colors",
        isClickable && "cursor-pointer hover:bg-muted/30",
        row.isTotal && "font-semibold bg-muted/20 border-t",
        row.isSubtotal && "font-medium",
      )}
      style={{ paddingLeft: `${indent * 16 + 8}px` }}
    >
      <span className={cn(
        "flex-1 truncate text-sm",
        isRecordLink && "cursor-context-menu",
        row.isTotal && "font-semibold",
      )}
      title={isRecordLink ? `${row.accountName} (${row.accountCode})` : undefined}
      onContextMenu={isRecordLink
        ? (event) => openAppRecordFromContextMenu(event, "gl_account", row.accountCode)
        : undefined}
      >
        {row.accountName}
      </span>

      <div className="flex items-center gap-6 pr-0">
        <span className={cn(
          "w-28 text-right text-sm tabular-nums",
          row.isTotal && "font-semibold",
          row.current < 0 && "text-destructive",
        )}>
          {fmtCompact(row.current)}
        </span>
        {showComparative && (
          <>
            <span className="w-28 text-right text-sm tabular-nums text-muted-foreground">
              {row.prior !== undefined ? fmtCompact(row.prior) : "—"}
            </span>
            <span
              className={cn(
                "w-20 text-right text-sm tabular-nums",
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
