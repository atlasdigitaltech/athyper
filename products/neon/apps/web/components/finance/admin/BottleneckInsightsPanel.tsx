"use client";

// components/finance/admin/BottleneckInsightsPanel.tsx
//
// Shows recurring bottleneck patterns detected across past close cycles.
// Highlights chronic vs occasional bottlenecks with visual indicators.

import { AlertCircle, BarChart3, Clock, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { CloseBottleneckDTO } from "@/lib/finance/use-close-recommendations";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BottleneckInsightsPanelProps {
  patterns: CloseBottleneckDTO[];
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Classification styling
// ---------------------------------------------------------------------------

const CLASSIFICATION_BADGE: Record<string, { variant: "destructive" | "default" | "secondary" | "outline"; label: string }> = {
  chronic: { variant: "destructive", label: "Chronic" },
  frequent: { variant: "default", label: "Frequent" },
  recurring: { variant: "secondary", label: "Recurring" },
  occasional: { variant: "outline", label: "Occasional" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BottleneckInsightsPanel({ patterns, loading }: BottleneckInsightsPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" />
            Recurring Bottlenecks
          </CardTitle>
          <CardDescription>Loading bottleneck analysis...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!patterns || patterns.length === 0) {
    return null; // Don't render if no patterns
  }

  const chronicCount = patterns.filter((p) => p.pattern_classification === "chronic").length;
  const frequentCount = patterns.filter((p) => p.pattern_classification === "frequent").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-4 w-4 text-red-500" />
          Recurring Bottlenecks
          {chronicCount > 0 && (
            <Badge variant="destructive" className="ml-1">{chronicCount} chronic</Badge>
          )}
          {frequentCount > 0 && (
            <Badge variant="default" className="ml-1">{frequentCount} frequent</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Tasks that chronically delay closes based on {patterns[0]?.total_closes ?? 0} historical close cycles
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead className="text-center">Pattern</TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger>Freq%</TooltipTrigger>
                  <TooltipContent>% of closes where this task was the longest</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger>Avg</TooltipTrigger>
                  <TooltipContent>Average duration in minutes</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger>P95</TooltipTrigger>
                  <TooltipContent>95th percentile duration</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger>Blocked</TooltipTrigger>
                  <TooltipContent>Times this task was blocked during close</TooltipContent>
                </Tooltip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patterns.map((p) => {
              const badge = CLASSIFICATION_BADGE[p.pattern_classification] ?? CLASSIFICATION_BADGE.occasional;
              return (
                <TableRow key={p.task_code}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {p.pattern_classification === "chronic" && (
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-sm">{p.task_code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm ${p.bottleneck_frequency_pct >= 70 ? "text-red-600 font-semibold" : ""}`}>
                      {p.bottleneck_frequency_pct}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{formatDuration(p.avg_duration_minutes)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm text-muted-foreground">{formatDuration(p.p95_duration_minutes)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.times_blocked > 0 ? (
                      <span className="text-sm text-amber-600">{p.times_blocked}x</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Insight summary */}
        {chronicCount > 0 && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <BarChart3 className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-800">
                <span className="font-medium">Insight: </span>
                {patterns
                  .filter((p) => p.pattern_classification === "chronic")
                  .map((p) =>
                    `${p.task_code} is the longest task in ${p.bottleneck_frequency_pct}% of closes (avg ${formatDuration(p.avg_duration_minutes)})`,
                  )
                  .join(". ")}
                . Consider process improvements, additional resources, or earlier start times for these tasks.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
