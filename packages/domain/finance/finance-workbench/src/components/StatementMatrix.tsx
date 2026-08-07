"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { fmtCompact } from "./format";
import { openAppRecordFromContextMenu } from "../lib/recordLinks";
import type { StatementBucket, StatementSection as StatementSectionData } from "../hooks/useFinancialStatements";

export interface StatementMatrixGroup {
  key: string;
  title: string;
  sections: StatementSectionData[];
}

export interface StatementMatrixTotalRow {
  key: string;
  label: string;
  values: Record<string, number>;
  tone?: "neutral" | "success" | "danger";
}

interface StatementMatrixProps {
  buckets: StatementBucket[];
  groups: StatementMatrixGroup[];
  totals?: StatementMatrixTotalRow[];
  onRowSelect?: (accountCode: string) => void;
}

function displayAmount(value: number): string {
  return Math.abs(value) < 0.005 ? "-" : fmtCompact(value);
}

function amountTone(value: number, tone?: StatementMatrixTotalRow["tone"]): string {
  if (tone === "success") return "text-success";
  if (tone === "danger") return "text-destructive";
  if (value < -0.005) return "text-destructive";
  return "text-foreground";
}

export function StatementMatrix({
  buckets,
  groups,
  totals = [],
  onRowSelect,
}: StatementMatrixProps) {
  if (buckets.length === 0) return null;

  const gridStyle = {
    gridTemplateColumns: `minmax(260px, 1fr) repeat(${buckets.length}, minmax(116px, 150px))`,
  };

  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="w-max min-w-full text-sm">
        <div
          className="grid items-center border-b bg-muted/20 px-2 py-2 text-xs font-medium text-muted-foreground"
          style={gridStyle}
        >
          <div className="sticky left-0 z-10 bg-card pr-3 shadow-[8px_0_10px_-12px_rgba(0,0,0,0.45)]">Account</div>
          {buckets.map((bucket) => (
            <div key={bucket.key} className="text-right">
              {bucket.label}
            </div>
          ))}
        </div>

        {groups.map((group) => (
          <div key={group.key} className="border-b last:border-b-0">
            <div className="bg-muted/10 px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">
                {group.title}
              </span>
            </div>
            {group.sections.map((section) => (
              <MatrixSection
                key={section.code}
                section={section}
                buckets={buckets}
                gridStyle={gridStyle}
                onRowSelect={onRowSelect}
              />
            ))}
          </div>
        ))}

        {totals.length > 0 && (
          <div className="border-t-2">
            {totals.map((total) => (
              <div
                key={total.key}
                className="grid items-center border-b bg-muted/20 px-2 py-2 font-medium last:border-b-0"
                style={gridStyle}
              >
                <div className="sticky left-0 z-10 bg-card pr-3 shadow-[8px_0_10px_-12px_rgba(0,0,0,0.45)]">
                  {total.label}
                </div>
                {buckets.map((bucket) => {
                  const value = total.values[bucket.key] ?? 0;
                  return (
                    <div key={bucket.key} className={cn("text-right tabular-nums", amountTone(value, total.tone))}>
                      {displayAmount(value)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatrixSection({
  section,
  buckets,
  gridStyle,
  onRowSelect,
}: {
  section: StatementSectionData;
  buckets: StatementBucket[];
  gridStyle: React.CSSProperties;
  onRowSelect?: (accountCode: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="grid w-full items-center px-2 py-2 text-left transition-colors hover:bg-muted/30"
        style={gridStyle}
      >
        <span className="sticky left-0 z-10 flex min-w-0 items-center gap-1 bg-card pr-3 font-medium">
          {expanded ? (
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{section.label}</span>
        </span>
        {buckets.map((bucket) => {
          const value = section.bucketTotals?.[bucket.key] ?? 0;
          return (
            <span key={bucket.key} className={cn("text-right font-medium tabular-nums", amountTone(value))}>
              {displayAmount(value)}
            </span>
          );
        })}
      </button>

      {expanded && (
        <div>
          {section.rows.map((row) => (
            <button
              key={row.accountCode}
              type="button"
              onClick={onRowSelect ? () => onRowSelect(row.accountCode) : undefined}
              onContextMenu={(event) => openAppRecordFromContextMenu(event, "gl_account", row.accountCode)}
              className={cn(
                "grid w-full items-center px-2 py-2 text-left transition-colors hover:bg-muted/20",
                onRowSelect && "cursor-pointer",
              )}
              style={gridStyle}
              title={`${row.accountName} (${row.accountCode})`}
            >
              <span className="sticky left-0 z-10 min-w-0 truncate bg-card pl-7 pr-3 text-foreground">
                {row.accountName}
              </span>
              {buckets.map((bucket) => {
                const value = row.buckets?.[bucket.key] ?? 0;
                return (
                  <span key={bucket.key} className={cn("text-right tabular-nums", amountTone(value))}>
                    {displayAmount(value)}
                  </span>
                );
              })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
