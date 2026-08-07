"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { fmtCompact } from "./format";
import { StatementRow, type StatementLineItem } from "./StatementRow";

interface StatementSectionProps {
  title: string;
  rows: StatementLineItem[];
  total: number;
  priorTotal?: number;
  showComparative?: boolean;
  defaultExpanded?: boolean;
  totalLabel?: string;
  indent?: number;
  onRowSelect?: (accountCode: string) => void;
}

export function StatementSection({
  title,
  rows,
  total,
  priorTotal,
  showComparative = false,
  defaultExpanded = true,
  totalLabel,
  indent = 0,
  onRowSelect,
}: StatementSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const variance = showComparative && priorTotal !== undefined ? total - priorTotal : null;

  return (
    <div className="border-b last:border-0 text-sm">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-muted/30"
        style={{ paddingLeft: `${indent * 16 + 8}px` }}
      >
        {expanded ? (
          <ChevronDown size={11} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-muted-foreground shrink-0" />
        )}
        <span className="flex-1 font-medium text-foreground">{title}</span>

        <div className="flex items-center gap-6 pr-0">
          <span className="w-28 text-right font-medium tabular-nums">
            {fmtCompact(total)}
          </span>
          {showComparative && (
            <>
              <span className="w-28 text-right tabular-nums text-muted-foreground">
                {priorTotal !== undefined ? fmtCompact(priorTotal) : "—"}
              </span>
              <span
                className={cn(
                  "w-20 text-right tabular-nums",
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
      </button>

      {/* Rows */}
      {expanded && (
        <div>
          {rows.map((row) => (
            <StatementRow
              key={row.accountCode}
              row={row}
              showComparative={showComparative}
              indent={indent + 1}
              onSelect={onRowSelect}
            />
          ))}
          {/* Sub-total row when section has items */}
          {rows.length > 1 && (
            <div
              className="flex items-center bg-muted/20 py-1.5"
              style={{ paddingLeft: `${(indent + 1) * 16 + 8}px` }}
            >
              <span className="flex-1 text-xs italic text-muted-foreground">
                {totalLabel ?? `Total ${title}`}
              </span>
              <div className="flex items-center gap-6 pr-0">
                <span className="w-28 text-right text-xs font-medium tabular-nums">
                  {fmtCompact(total)}
                </span>
                {showComparative && (
                  <>
                    <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
                      {priorTotal !== undefined ? fmtCompact(priorTotal) : "—"}
                    </span>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                      {variance !== null ? fmtCompact(variance) : "—"}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
