"use client";

/**
 * CompletionSummaryPanel — right-rail section completion tracker.
 *
 * Renders each visible section's completion state as a card using
 * SatelliteCardGroup from the orchestrator components.
 *
 * Generic — driven entirely by SectionCompletionReport[] from
 * useCompositeIntakeEngine.completionReport().
 */

import React from "react";
import { CheckCircle2, AlertCircle, Circle, Lock } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { SectionCompletionReport } from "./types";

export interface CompletionSummaryPanelProps {
  report: SectionCompletionReport[];
  className?: string;
  title?: string;
}

export function CompletionSummaryPanel({ report, className, title = "Completion" }: CompletionSummaryPanelProps) {
  const required   = report.filter(r => r.is_required && !r.is_restricted);
  const optional   = report.filter(r => !r.is_required && !r.is_restricted);
  const restricted = report.filter(r => r.is_restricted);

  const completedCount = required.filter(r => r.status === "complete").length;
  const pct = required.length > 0 ? Math.round((completedCount / required.length) * 100) : 100;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Overall progress */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <span className="text-xs font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-2xs text-muted-foreground">
          {completedCount} of {required.length} required section{required.length === 1 ? "" : "s"} complete
        </p>
      </div>

      {/* Required sections */}
      {required.length > 0 && (
        <SectionGroup
          title="Required"
          items={required}
        />
      )}

      {/* Optional sections */}
      {optional.length > 0 && (
        <SectionGroup
          title="Optional"
          items={optional}
        />
      )}

      {/* Restricted sections (view-only — shown as locked) */}
      {restricted.length > 0 && (
        <SectionGroup
          title="System-managed"
          items={restricted}
        />
      )}
    </div>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────

function SectionGroup({
  title,
  items,
}: {
  title: string;
  items: SectionCompletionReport[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </p>
      {items.map(item => (
        <SectionRow key={item.section_key} item={item} />
      ))}
    </div>
  );
}

// ── Section row ───────────────────────────────────────────────────────────────

function SectionRow({ item }: { item: SectionCompletionReport }) {
  const { Icon, colorClass } = statusIcon(item);

  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", colorClass)} />
      <span className="truncate text-xs text-foreground flex-1">{item.label}</span>
      {item.row_count > 0 && !item.is_restricted && (
        <span className="shrink-0 text-2xs text-muted-foreground">
          {item.row_count} row{item.row_count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function statusIcon(item: SectionCompletionReport): {
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
} {
  if (item.is_restricted) {
    return { Icon: Lock, colorClass: "text-muted-foreground" };
  }
  switch (item.status) {
    case "complete":
      return { Icon: CheckCircle2, colorClass: "text-success" };
    case "partial":
      return { Icon: AlertCircle, colorClass: "text-warning" };
    case "optional_empty":
      return { Icon: Circle, colorClass: "text-muted-foreground" };
    case "empty":
      return { Icon: AlertCircle, colorClass: "text-destructive" };
  }
}
