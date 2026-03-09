"use client";

// components/finance/admin/CloseProgressTrend.tsx
//
// Stacked area chart showing close progress over time using snapshot history.
// Visualises satisfied/ready/in-progress/blocked/failed task counts.

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Clock, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { CloseSnapshotDTO } from "@/lib/finance/use-close-snapshot-trend";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseProgressTrendProps {
  snapshots: CloseSnapshotDTO[];
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const COLORS = {
  satisfied: "#22c55e",   // green-500
  ready: "#3b82f6",       // blue-500
  inProgress: "#f59e0b",  // amber-500
  blocked: "#ef4444",     // red-500
  failed: "#dc2626",      // red-600
  notReady: "#94a3b8",    // slate-400
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CloseProgressTrend({ snapshots, loading }: CloseProgressTrendProps) {
  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    // Reverse to chronological order (API returns newest first)
    return [...snapshots].reverse().map((s) => ({
      time: new Date(s.snapshot_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rawTime: s.snapshot_at,
      satisfied: s.satisfied_count,
      ready: s.ready_count,
      inProgress: s.in_progress_count,
      blocked: s.blocked_count,
      failed: s.failed_count,
      notReady: s.not_ready_count,
      total: s.total_tasks,
      criticalPathMin: s.critical_path_minutes,
      confidence: s.confidence,
    }));
  }, [snapshots]);

  const latestSnapshot = snapshots?.[0] ?? null;
  const completionPct = latestSnapshot
    ? Math.round((latestSnapshot.satisfied_count / Math.max(latestSnapshot.total_tasks, 1)) * 100)
    : 0;

  if (!snapshots || snapshots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Close Progress Trend
          </CardTitle>
          <CardDescription>
            {loading ? "Loading snapshot history..." : "No snapshots captured yet. Snapshots are created automatically or via the snapshot API."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Close Progress Trend
            </CardTitle>
            <CardDescription>
              {snapshots.length} snapshots | Current completion: {completionPct}%
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {latestSnapshot && (
              <>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {latestSnapshot.critical_path_minutes}min critical path
                </Badge>
                <Badge
                  variant={latestSnapshot.confidence === "high" ? "default" : latestSnapshot.confidence === "medium" ? "secondary" : "destructive"}
                >
                  {latestSnapshot.confidence} confidence
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: 12,
                }}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="satisfied"
                name="Satisfied"
                stackId="1"
                stroke={COLORS.satisfied}
                fill={COLORS.satisfied}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="ready"
                name="Ready"
                stackId="1"
                stroke={COLORS.ready}
                fill={COLORS.ready}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="inProgress"
                name="In Progress"
                stackId="1"
                stroke={COLORS.inProgress}
                fill={COLORS.inProgress}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="blocked"
                name="Blocked"
                stackId="1"
                stroke={COLORS.blocked}
                fill={COLORS.blocked}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stackId="1"
                stroke={COLORS.failed}
                fill={COLORS.failed}
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="notReady"
                name="Not Ready"
                stackId="1"
                stroke={COLORS.notReady}
                fill={COLORS.notReady}
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
