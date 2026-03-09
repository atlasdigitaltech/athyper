"use client";

// components/finance/ReleaseTimeline.tsx
//
// Unified chronological timeline combining lifecycle changes, decision log,
// notifications, override activity, and signoff events for a release.

import { useState, useMemo } from "react";
import {
  Badge,
  Card,
} from "@neon/ui";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Bell,
  History,
  Shield,
  FileText,
  Loader2,
  RefreshCw,
  Filter,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  ReleaseTimelineEventDTO,
  TimelineEventSource,
  NotificationSeverity,
} from "@/lib/finance/release-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReleaseTimelineProps {
  events: ReleaseTimelineEventDTO[];
  loading?: boolean;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<TimelineEventSource, {
  icon: typeof History;
  color: string;
  label: string;
}> = {
  lifecycle: { icon: Clock, color: "text-blue-600", label: "Lifecycle" },
  decision: { icon: History, color: "text-purple-600", label: "Decision" },
  notification: { icon: Bell, color: "text-amber-600", label: "Alert" },
  override: { icon: Shield, color: "text-orange-600", label: "Override" },
  signoff: { icon: FileText, color: "text-emerald-600", label: "Signoff" },
};

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  INFO: "bg-blue-400",
  WARNING: "bg-amber-400",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SOURCE_OPTIONS: TimelineEventSource[] = ["lifecycle", "decision", "notification", "override", "signoff"];
const SEVERITY_OPTIONS: NotificationSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];

export function ReleaseTimeline({
  events,
  loading = false,
  onRefresh,
}: ReleaseTimelineProps) {
  const [sourceFilter, setSourceFilter] = useState<TimelineEventSource | "ALL">("ALL");
  const [severityFilter, setSeverityFilter] = useState<NotificationSeverity | "ALL">("ALL");
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = events;
    if (sourceFilter !== "ALL") {
      result = result.filter((e) => e.source === sourceFilter);
    }
    if (severityFilter !== "ALL") {
      result = result.filter((e) => e.severity === severityFilter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.detail?.toLowerCase().includes(q) ?? false) ||
          (e.command?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [events, sourceFilter, severityFilter, searchText]);

  const activeFilterCount =
    (sourceFilter !== "ALL" ? 1 : 0) +
    (severityFilter !== "ALL" ? 1 : 0) +
    (searchText.trim() ? 1 : 0);

  if (loading && events.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No timeline events recorded yet.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Release Timeline</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors",
              showFilters || activeFilterCount > 0
                ? "bg-slate-200 text-slate-900"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Filter className="h-3 w-3" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {onRefresh && (
            <button onClick={onRefresh} className="text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border rounded-md w-44"
            />
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as TimelineEventSource | "ALL")}
            className="text-xs border rounded-md px-2 py-1"
          >
            <option value="ALL">All sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{SOURCE_CONFIG[s].label}</option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as NotificationSeverity | "ALL")}
            className="text-xs border rounded-md px-2 py-1"
          >
            <option value="ALL">All severities</option>
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              onClick={() => { setSourceFilter("ALL"); setSeverityFilter("ALL"); setSearchText(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {events.length} events
          </span>
        </div>
      )}

      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-0">
          {filtered.map((event, i) => {
            const cfg = SOURCE_CONFIG[event.source];
            const Icon = cfg.icon;
            const isDecision = event.source === "decision";
            const isBlocked = event.decisionResult === "BLOCKED";
            const isCritical = event.severity === "CRITICAL" || event.severity === "HIGH";

            return (
              <div key={event.id} className="relative flex gap-3 py-2.5">
                {/* Timeline dot */}
                <div className={cn(
                  "relative z-10 flex items-center justify-center h-8 w-8 rounded-full border-2 bg-white shrink-0",
                  isBlocked ? "border-red-300" : isCritical ? "border-orange-300" : "border-slate-200",
                )}>
                  {isDecision && isBlocked ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : isDecision && event.decisionResult === "APPROVED" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : isCritical ? (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Icon className={cn("h-4 w-4", cfg.color)} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{event.title}</span>
                    <Badge className={cn("text-[10px] px-1.5 py-0", `bg-slate-100 ${cfg.color}`)}>
                      {cfg.label}
                    </Badge>
                    {event.severity !== "INFO" && (
                      <div className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[event.severity])}
                        title={event.severity} />
                    )}
                  </div>

                  {event.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {event.detail}
                    </p>
                  )}

                  <span className="text-[11px] text-muted-foreground">
                    {event.timestamp ? formatRelativeTime(event.timestamp) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
