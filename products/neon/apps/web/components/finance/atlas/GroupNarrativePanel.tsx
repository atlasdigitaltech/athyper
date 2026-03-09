"use client";

// components/finance/atlas/GroupNarrativePanel.tsx
//
// Group-level narrative display for the Global Close Monitor Phase 2.
// Shows: dashboard summary, CFO brief, delay explanation, and provenance.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  Info,
} from "lucide-react";

import type {
  GroupNarrative,
  EnhancedCriticalPath,
  EntityProjection,
} from "@/lib/finance/use-global-close-monitor";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupNarrativePanelProps {
  narrative: GroupNarrative;
  criticalPath: EnhancedCriticalPath;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupNarrativePanel({ narrative, criticalPath }: GroupNarrativePanelProps) {
  return (
    <div className="space-y-4">
      {/* Group Dashboard Summary */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <LayoutDashboard className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold">Group Dashboard Summary</span>
          <Badge variant="outline" className="text-[10px] ml-auto">
            {narrative.deterministic ? "deterministic" : "adaptive"}
          </Badge>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{narrative.dashboardSummary}</p>
        </div>
      </Card>

      {/* Group CFO Brief */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Briefcase className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold">Group CFO Brief</span>
        </div>
        <div className="px-4 py-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{narrative.cfoBrief}</pre>
        </div>
      </Card>

      {/* Delay Explanation */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Why Group Close is Delayed</span>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm leading-relaxed">{narrative.delayExplanation}</p>
        </div>
      </Card>

      {/* Entity Projections (from enhanced critical path) */}
      {criticalPath.entityProjections && criticalPath.entityProjections.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Entity Close Projections</span>
            {criticalPath.projectedGroupCompletionDays != null && (
              <Badge variant="outline" className="text-[10px] ml-auto tabular-nums">
                Group: {criticalPath.projectedGroupCompletionDays}d projected
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-[2fr_80px_80px_80px_80px_80px] gap-1 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Entity</span>
            <span className="text-right">Elapsed</span>
            <span className="text-right">Remaining</span>
            <span className="text-right">Projected</span>
            <span className="text-right">Risk</span>
            <span className="text-right">SLA</span>
          </div>
          <div className="divide-y max-h-72 overflow-auto">
            {criticalPath.entityProjections.map((ep: EntityProjection) => (
              <div key={ep.entityCode} className="grid grid-cols-[2fr_80px_80px_80px_80px_80px] gap-1 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium truncate">{ep.entityName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{ep.entityCode}</p>
                </div>
                <p className="text-right tabular-nums">{ep.elapsedDays ?? "—"}d</p>
                <p className="text-right tabular-nums">{ep.projectedRemainingDays}d</p>
                <p className={cn(
                  "text-right tabular-nums font-medium",
                  ep.projectedTotalDays > 15 ? "text-red-600" :
                  ep.projectedTotalDays > 10 ? "text-amber-600" :
                  "text-foreground",
                )}>
                  {ep.projectedTotalDays}d
                </p>
                <p className={cn(
                  "text-right tabular-nums",
                  ep.riskScore >= 70 ? "text-red-600" :
                  ep.riskScore >= 40 ? "text-amber-600" :
                  "text-foreground",
                )}>
                  {ep.riskScore}
                </p>
                <div className="text-right">
                  {ep.willBreachSla ? (
                    <Badge className="bg-red-100 text-red-700 text-[10px]">BREACH</Badge>
                  ) : ep.hardCloseTarget ? (
                    <Badge variant="outline" className="text-[10px]">OK</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {criticalPath.slaBreachCount != null && criticalPath.slaBreachCount > 0 && (
            <div className="border-t bg-red-50 px-4 py-2 text-xs text-red-700">
              {criticalPath.slaBreachCount} {criticalPath.slaBreachCount === 1 ? "entity is" : "entities are"} projected to breach SLA deadlines.
            </div>
          )}
        </Card>
      )}

      {/* Provenance */}
      <Card className="px-4 py-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>
            {narrative.provider} · {narrative.deterministic ? "deterministic" : "adaptive"}
            {" · "}generated {new Date(narrative.generatedAt).toLocaleString()}
          </span>
        </div>
      </Card>
    </div>
  );
}
