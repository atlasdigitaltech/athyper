"use client";

// components/finance/admin/SnapshotDiffPanel.tsx
//
// Phase 14: Snapshot comparison panel showing structured diff
// between two review snapshots.

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Equal,
  GitCompare,
  Loader2,
  Minus,
  Plus,
  Scale,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  SnapshotDiffDTO,
  SectionDiffDTO,
  ItemDiffDTO,
} from "@/lib/finance/use-review-governance";
import type { ReviewSnapshotSummaryDTO } from "@/lib/finance/use-review-pack";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SnapshotDiffPanelProps {
  snapshots: ReviewSnapshotSummaryDTO[];
  diff: SnapshotDiffDTO | null;
  loading: boolean;
  error: string | null;
  baseId: string | null;
  compareId: string | null;
  onSelectBase: (id: string | null) => void;
  onSelectCompare: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SnapshotDiffPanel({
  snapshots,
  diff,
  loading,
  error,
  baseId,
  compareId,
  onSelectBase,
  onSelectCompare,
}: SnapshotDiffPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitCompare className="h-4 w-4" />
          Snapshot Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Snapshot selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Base Snapshot
            </label>
            <select
              className="mt-1 w-full text-xs border rounded-md px-2 py-1.5 bg-background"
              value={baseId ?? ""}
              onChange={(e) => onSelectBase(e.target.value || null)}
            >
              <option value="">Select base...</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === compareId}>
                  {s.snapshot_code} — {s.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Compare Snapshot
            </label>
            <select
              className="mt-1 w-full text-xs border rounded-md px-2 py-1.5 bg-background"
              value={compareId ?? ""}
              onChange={(e) => onSelectCompare(e.target.value || null)}
            >
              <option value="">Select compare...</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === baseId}>
                  {s.snapshot_code} — {s.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Computing diff...</span>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        {/* No selection */}
        {!loading && !error && !diff && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Select two snapshots to compare.
          </p>
        )}

        {/* Diff results */}
        {diff && !loading && (
          <div className="space-y-3">
            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-2">
              <DeltaCard
                label="Readiness"
                delta={diff.summary.readinessChange}
                suffix="%"
              />
              <DeltaCard
                label="Blockers"
                delta={diff.summary.blockersDelta}
                invertColor
              />
              <DeltaCard
                label="Action Items"
                delta={diff.summary.actionItemsDelta}
                invertColor
              />
              <DeltaCard
                label="Decisions"
                delta={diff.summary.decisionsDelta}
              />
            </div>

            {/* Phase change */}
            {diff.summary.phaseChanged && (
              <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950 p-2 rounded-md">
                <Target className="h-3.5 w-3.5 text-blue-600" />
                <span>
                  Phase changed: <strong>{diff.readiness.basePhase}</strong>
                  {" → "}
                  <strong>{diff.readiness.comparePhase}</strong>
                </span>
              </div>
            )}

            {/* Blocker changes */}
            {(diff.blockers.added.length > 0 || diff.blockers.removed.length > 0) && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Blocker Changes
                </p>
                {diff.blockers.added.map((b, i) => (
                  <div key={`add-${i}`} className="flex items-center gap-1.5 text-xs text-red-600">
                    <Plus className="h-3 w-3" /> {b}
                  </div>
                ))}
                {diff.blockers.removed.map((b, i) => (
                  <div key={`rm-${i}`} className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <Minus className="h-3 w-3" /> {b}
                  </div>
                ))}
              </div>
            )}

            {/* Section diffs */}
            {diff.sections.filter((s) => s.status !== "unchanged").length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Section Changes ({diff.summary.sectionsChanged})
                </p>
                {diff.sections
                  .filter((s) => s.status !== "unchanged")
                  .map((s) => (
                    <SectionDiffRow
                      key={s.sectionKey}
                      section={s}
                      expanded={expandedSection === s.sectionKey}
                      onToggle={() =>
                        setExpandedSection(
                          expandedSection === s.sectionKey ? null : s.sectionKey,
                        )
                      }
                    />
                  ))}
              </div>
            )}

            {/* Item diffs */}
            <ItemDiffBlock title="Action Items" items={diff.actionItems} />
            <ItemDiffBlock title="Decisions" items={diff.decisions} />
            <ItemDiffBlock title="Carry-Forward" items={diff.carryForward} />

            {/* Override delta */}
            {(diff.overrides.baseCount !== diff.overrides.compareCount ||
              diff.overrides.baseImpact !== diff.overrides.compareImpact) && (
              <div className="text-xs space-y-0.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Overrides
                </p>
                <p>
                  Count: {diff.overrides.baseCount} → {diff.overrides.compareCount}
                  {" | "}
                  Impact: {Number(diff.overrides.baseImpact).toLocaleString()} →{" "}
                  {Number(diff.overrides.compareImpact).toLocaleString()}
                </p>
              </div>
            )}

            {/* Total changes */}
            <p className="text-[10px] text-muted-foreground text-right">
              {diff.summary.totalChanges} total change{diff.summary.totalChanges !== 1 ? "s" : ""} detected
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Delta Card
// ---------------------------------------------------------------------------

function DeltaCard({
  label,
  delta,
  suffix = "",
  invertColor = false,
}: {
  label: string;
  delta: number;
  suffix?: string;
  invertColor?: boolean;
}) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const color = invertColor
    ? isPositive ? "text-red-600" : isNegative ? "text-emerald-600" : "text-muted-foreground"
    : isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-muted-foreground";
  const Icon = isPositive ? ArrowUp : isNegative ? ArrowDown : Equal;

  return (
    <div className="border rounded-md p-2 text-center">
      <div className={`text-sm font-semibold flex items-center justify-center gap-1 ${color}`}>
        <Icon className="h-3 w-3" />
        {isPositive ? "+" : ""}{delta}{suffix}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Diff Row
// ---------------------------------------------------------------------------

function SectionDiffRow({
  section,
  expanded,
  onToggle,
}: {
  section: SectionDiffDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<string, string> = {
    added: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    removed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    changed: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  };

  return (
    <div className="border rounded-md">
      <button
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2">
          <Badge className={`text-[9px] ${statusColors[section.status] ?? ""}`}>
            {section.status}
          </Badge>
          {section.title}
        </span>
        {(section.baseBody || section.compareBody) && (
          expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {expanded && (section.baseBody || section.compareBody) && (
        <div className="px-2.5 pb-2 grid grid-cols-2 gap-2">
          {section.baseBody && (
            <div>
              <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Base</p>
              <div className="text-[10px] bg-red-50 dark:bg-red-950 p-1.5 rounded whitespace-pre-line max-h-32 overflow-y-auto">
                {section.baseBody}
              </div>
            </div>
          )}
          {section.compareBody && (
            <div>
              <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Compare</p>
              <div className="text-[10px] bg-emerald-50 dark:bg-emerald-950 p-1.5 rounded whitespace-pre-line max-h-32 overflow-y-auto">
                {section.compareBody}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item Diff Block
// ---------------------------------------------------------------------------

function ItemDiffBlock({ title, items }: { title: string; items: ItemDiffDTO }) {
  if (items.added.length === 0 && items.removed.length === 0 && items.changed.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {title} ({items.baseCount} → {items.compareCount})
      </p>
      {items.added.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 text-xs text-emerald-600">
          <Plus className="h-3 w-3" /> {item.title}
        </div>
      ))}
      {items.removed.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 text-xs text-red-600">
          <Minus className="h-3 w-3" /> {item.title}
        </div>
      ))}
      {items.changed.map((item) => (
        <div key={item.id} className="text-xs text-amber-600">
          <span className="flex items-center gap-1.5">
            <Scale className="h-3 w-3" /> {item.title}
          </span>
          {item.changes.map((c, i) => (
            <span key={i} className="ml-5 text-[10px] block text-muted-foreground">{c}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
