"use client";

// components/finance/admin/CarryForwardRisksPanel.tsx
//
// Cross-period carry-forward risks panel for CFO workspace.
// Shows items carried from previous periods that need attention.

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { FollowupLinkDTO } from "@/lib/finance/use-cfo-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CarryForwardRisksPanelProps {
  items: FollowupLinkDTO[];
  loading?: boolean;
  resolving?: boolean;
  onResolve: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Reason styling
// ---------------------------------------------------------------------------

const REASON_CONFIG: Record<string, { color: string; bg: string }> = {
  unresolved: { color: "text-red-700", bg: "bg-red-50" },
  recurring: { color: "text-amber-700", bg: "bg-amber-50" },
  deferred: { color: "text-blue-700", bg: "bg-blue-50" },
  escalated: { color: "text-orange-700", bg: "bg-orange-50" },
};

const SEVERITY_BADGE: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
  info: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CarryForwardRisksPanel({
  items,
  loading,
  resolving,
  onResolve,
}: CarryForwardRisksPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Carry-Forward Risks
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading carry-forward items...</span>
        </CardContent>
      </Card>
    );
  }

  const openItems = items.filter((i) => !i.resolved);
  const resolvedItems = items.filter((i) => i.resolved);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" />
              Carry-Forward Risks
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {openItems.length} open from prior period{openItems.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          {openItems.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {openItems.length} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {openItems.map((item) => {
          const reasonConfig = REASON_CONFIG[item.reason] ?? REASON_CONFIG.unresolved;

          return (
            <div
              key={item.id}
              className={`p-2 border rounded-md ${reasonConfig.bg} space-y-1.5`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.source_severity && (
                      <Badge
                        variant={SEVERITY_BADGE[item.source_severity] ?? "outline"}
                        className="text-[9px]"
                      >
                        {item.source_severity}
                      </Badge>
                    )}
                    <span className={`text-xs font-medium ${reasonConfig.color}`}>
                      {item.source_title ?? `${item.source_kind} item`}
                    </span>
                  </div>
                  {item.source_detail && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {item.source_detail}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] flex-shrink-0"
                  disabled={resolving}
                  onClick={() => onResolve(item.id)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                  Resolve
                </Button>
              </div>

              {/* Origin badge */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[9px]">
                  {item.reason}
                </Badge>
                <span className="flex items-center gap-1">
                  P{item.source_period} FY{item.source_fy}
                  <ArrowRight className="h-2.5 w-2.5" />
                  P{item.target_period} FY{item.target_fy}
                </span>
                {item.carry_note && <span>· {item.carry_note}</span>}
              </div>
            </div>
          );
        })}

        {/* Resolved summary */}
        {resolvedItems.length > 0 && (
          <div className="pt-2 border-t flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[10px] text-emerald-700">
              {resolvedItems.length} carry-forward item{resolvedItems.length !== 1 ? "s" : ""} resolved this period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
