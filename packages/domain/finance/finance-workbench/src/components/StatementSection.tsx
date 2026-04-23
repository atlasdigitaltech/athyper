"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
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
}: StatementSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const variance = showComparative && priorTotal !== undefined ? total - priorTotal : null;

  return (
    <div className="border-b last:border-0">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1 px-2 py-[5px] hover:bg-muted/30 transition-colors text-left"
        style={{ paddingLeft: `${indent * 16 + 8}px` }}
      >
        {expanded ? (
          <ChevronDown size={11} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-doc-subtitle font-semibold flex-1">{title}</span>

        <div className="flex items-center gap-6 pr-0">
          <span className="font-mono text-doc-subtitle w-28 text-right font-medium">
            {fmtCompact(total)}
          </span>
          {showComparative && (
            <>
              <span className="font-mono text-doc-subtitle w-28 text-right text-muted-foreground">
                {priorTotal !== undefined ? fmtCompact(priorTotal) : "—"}
              </span>
              <span
                className={cn(
                  "font-mono text-doc-subtitle w-20 text-right",
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
            />
          ))}
          {/* Sub-total row when section has items */}
          {rows.length > 1 && (
            <div
              className="flex items-center py-[4px] bg-muted/20"
              style={{ paddingLeft: `${(indent + 1) * 16 + 8}px` }}
            >
              <span className="text-doc-support text-muted-foreground flex-1 italic">
                {totalLabel ?? `Total ${title}`}
              </span>
              <div className="flex items-center gap-6 pr-0">
                <span className="font-mono text-doc-support w-28 text-right font-medium">
                  {fmtCompact(total)}
                </span>
                {showComparative && (
                  <>
                    <span className="font-mono text-doc-support w-28 text-right text-muted-foreground">
                      {priorTotal !== undefined ? fmtCompact(priorTotal) : "—"}
                    </span>
                    <span className="font-mono text-doc-support w-20 text-right text-muted-foreground">
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
