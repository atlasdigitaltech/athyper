"use client";

// components/finance/atlas/EntityReadinessGrid.tsx
//
// Sortable grid showing per-entity close readiness for the Global Close Monitor.
// Columns: entity, status, risk score, anomalies, tasks, reconciliation, release, SLA.

import { useState, useMemo } from "react";
import {
  Badge,
  Card,
} from "@neon/ui";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { GlobalCloseEntity } from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityReadinessGridProps {
  entities: GlobalCloseEntity[];
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = "entity" | "risk" | "status" | "anomalies" | "tasks" | "recon" | "elapsed";
type SortDir = "asc" | "desc";

function getSortValue(entity: GlobalCloseEntity, key: SortKey): number | string {
  switch (key) {
    case "entity": return entity.entityName;
    case "risk": return entity.riskScore.score;
    case "status": return entity.closeStatus ?? "";
    case "anomalies": return entity.anomalies.activeCount;
    case "tasks": return entity.tasks.totalTasks > 0
      ? entity.tasks.completedTasks / entity.tasks.totalTasks
      : 1;
    case "recon": return entity.reconciliation.isComplete ? 1 : 0;
    case "elapsed": return entity.elapsedDays ?? 0;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Risk level styling
// ---------------------------------------------------------------------------

const RISK_LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "bg-red-100", text: "text-red-700" },
  MEDIUM: { bg: "bg-amber-100", text: "text-amber-700" },
  LOW: { bg: "bg-blue-100", text: "text-blue-700" },
  NONE: { bg: "bg-gray-100", text: "text-gray-500" },
};

const CLOSE_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  HARD_CLOSED: { bg: "bg-emerald-100", text: "text-emerald-700" },
  SOFT_CLOSED: { bg: "bg-teal-100", text: "text-teal-700" },
  IN_PROGRESS: { bg: "bg-blue-100", text: "text-blue-700" },
  OPEN: { bg: "bg-amber-100", text: "text-amber-700" },
  CANCELLED: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityReadinessGrid({ entities }: EntityReadinessGridProps) {
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...entities].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entities, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "entity" ? "asc" : "desc");
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 border-b bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <SortHeader label="Entity" sortKey="entity" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Risk" sortKey="risk" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Anomalies" sortKey="anomalies" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Tasks" sortKey="tasks" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Recon" sortKey="recon" current={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Elapsed" sortKey="elapsed" current={sortKey} dir={sortDir} onSort={toggleSort} />
      </div>

      {/* Entity rows */}
      <div className="divide-y">
        {sorted.map((entity) => {
          const isExpanded = expandedEntity === entity.entityCode;
          const riskStyle = RISK_LEVEL_STYLE[entity.riskScore.level] ?? RISK_LEVEL_STYLE.NONE;
          const statusStyle = CLOSE_STATUS_STYLE[entity.closeStatus ?? ""] ?? { bg: "bg-gray-100", text: "text-gray-500" };
          const taskPct = entity.tasks.totalTasks > 0
            ? Math.round((entity.tasks.completedTasks / entity.tasks.totalTasks) * 100)
            : null;

          return (
            <div key={entity.entityCode}>
              <button
                onClick={() => setExpandedEntity(isExpanded ? null : entity.entityCode)}
                className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 px-3 py-2 text-left text-sm hover:bg-accent/30 transition-colors"
              >
                {/* Entity */}
                <div className="flex items-center gap-2 min-w-0">
                  {entity.depth > 0 && (
                    <span className="text-muted-foreground" style={{ width: entity.depth * 12 }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entity.entityName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {entity.entityCode} · {entity.countryCode} · {entity.functionalCurrency}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>

                {/* Risk Score */}
                <div className="flex items-center">
                  <Badge className={cn("text-xs tabular-nums", riskStyle.bg, riskStyle.text)}>
                    {entity.riskScore.score}
                  </Badge>
                </div>

                {/* Close Status */}
                <div className="flex items-center">
                  <Badge className={cn("text-[10px]", statusStyle.bg, statusStyle.text)}>
                    {entity.closeStatus ?? "—"}
                  </Badge>
                </div>

                {/* Anomalies */}
                <div className="flex items-center gap-1 tabular-nums text-xs">
                  {entity.anomalies.criticalCount > 0 && (
                    <span className="flex items-center gap-0.5 text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {entity.anomalies.criticalCount}
                    </span>
                  )}
                  {entity.anomalies.warningCount > 0 && (
                    <span className="text-amber-600">{entity.anomalies.warningCount}w</span>
                  )}
                  {entity.anomalies.activeCount === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Tasks */}
                <div className="flex items-center text-xs tabular-nums">
                  {taskPct !== null ? (
                    <span className={cn(
                      taskPct === 100 ? "text-emerald-600" :
                      entity.tasks.failedTasks > 0 ? "text-red-600" :
                      entity.tasks.blockedTasks > 0 ? "text-amber-600" :
                      "text-foreground",
                    )}>
                      {entity.tasks.completedTasks}/{entity.tasks.totalTasks}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Reconciliation */}
                <div className="flex items-center">
                  {entity.reconciliation.totalSessions === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : entity.reconciliation.isComplete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <span className="text-xs tabular-nums text-amber-600">
                      {entity.reconciliation.completedSessions}/{entity.reconciliation.totalSessions}
                    </span>
                  )}
                </div>

                {/* Elapsed Days */}
                <div className="flex items-center text-xs tabular-nums">
                  {entity.elapsedDays != null ? (
                    <span className={cn(
                      entity.elapsedDays > 10 ? "text-red-600" :
                      entity.elapsedDays > 5 ? "text-amber-600" :
                      "text-foreground",
                    )}>
                      {entity.elapsedDays}d
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <EntityDetailPanel entity={entity} />
              )}
            </div>
          );
        })}

        {entities.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No subsidiary entities found for this parent.
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-0.5 hover:text-foreground transition-colors",
        isActive && "text-foreground",
      )}
    >
      {label}
      {isActive ? (
        dir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
      )}
    </button>
  );
}

function EntityDetailPanel({ entity }: { entity: GlobalCloseEntity }) {
  return (
    <div className="border-t bg-muted/30 px-4 py-3 text-xs">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Risk Drivers */}
        <div>
          <p className="font-semibold text-muted-foreground mb-1">Risk Drivers</p>
          {entity.riskScore.drivers.length > 0 ? (
            entity.riskScore.drivers.map((d, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span>{d.label}</span>
                <span className="tabular-nums font-medium">{d.points}pts ({d.count})</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">No active drivers</span>
          )}
        </div>

        {/* Exceptions */}
        <div>
          <p className="font-semibold text-muted-foreground mb-1">Exceptions</p>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Open</span>
              <span className="tabular-nums">{entity.exceptions.openCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Critical</span>
              <span className="tabular-nums text-red-600">{entity.exceptions.criticalCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Gate Blockers</span>
              <span className="tabular-nums text-red-600 font-medium">{entity.exceptions.gateBlockerCount}</span>
            </div>
          </div>
        </div>

        {/* Release */}
        <div>
          <p className="font-semibold text-muted-foreground mb-1">Release</p>
          {entity.release ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Code</span>
                <span className="font-mono">{entity.release.releaseCode}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <Badge variant="outline" className="text-[10px]">{entity.release.status}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Clean Close</span>
                {entity.release.isCleanClose ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-amber-500" />
                )}
              </div>
              {entity.release.overrideCount > 0 && (
                <div className="flex justify-between">
                  <span>Overrides</span>
                  <span className="tabular-nums text-amber-600">{entity.release.overrideCount}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">No release created</span>
          )}
        </div>

        {/* Calendar / SLA */}
        <div>
          <p className="font-semibold text-muted-foreground mb-1">SLA Targets</p>
          {entity.calendar ? (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Soft Close</span>
                <span className="tabular-nums">{new Date(entity.calendar.softCloseTarget).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Hard Close</span>
                <span className="tabular-nums">{new Date(entity.calendar.hardCloseTarget).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Type</span>
                <Badge variant="outline" className="text-[10px]">{entity.calendar.closeType}</Badge>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">No calendar configured</span>
          )}
        </div>
      </div>
    </div>
  );
}
