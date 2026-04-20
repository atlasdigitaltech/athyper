"use client";

import { useQuery } from "@tanstack/react-query";
import { GitBranch, Clock, User } from "lucide-react";
import { Skeleton, Badge } from "@athyper/ui/primitives";

interface WorkflowStage {
  stage_name: string;
  status: "pending" | "approved" | "rejected" | "skipped";
  actor_name?: string;
  completed_at?: string;
  comment?: string;
}

interface WorkflowContext {
  request_id: string;
  current_stage?: string;
  overall_status: string;
  stages: WorkflowStage[];
}

const STATUS_VARIANT: Record<
  WorkflowStage["status"],
  "outline" | "success" | "destructive" | "secondary"
> = {
  pending:  "outline",
  approved: "success",
  rejected: "destructive",
  skipped:  "secondary",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <GitBranch className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No active workflow for this record</p>
    </div>
  );
}

export interface WorkflowSummaryPanelProps {
  entityCode: string;
  recordId: string;
}

export function WorkflowSummaryPanel({ entityCode, recordId }: WorkflowSummaryPanelProps) {
  const { data, isLoading } = useQuery<{ context?: WorkflowContext }>({
    queryKey: ["record-workflow", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/workflow`,
        { signal },
      );
      if (!res.ok) return {};
      return res.json() as Promise<{ context?: WorkflowContext }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const ctx = data?.context;
  if (!ctx) return <EmptyState />;

  return (
    <div className="space-y-1">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Overall status</span>
        <Badge variant="outline">{ctx.overall_status}</Badge>
      </div>
      <div className="divide-y">
        {ctx.stages.map((stage, idx) => (
          <div key={idx} className="flex items-start gap-3 py-3">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-medium">{stage.stage_name}</p>
              {stage.comment && (
                <p className="text-xs text-muted-foreground">{stage.comment}</p>
              )}
              {stage.actor_name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  {stage.actor_name}
                </span>
              )}
            </div>
            {stage.completed_at && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(stage.completed_at).toLocaleDateString()}
              </span>
            )}
            <Badge variant={STATUS_VARIANT[stage.status]} className="text-[10px]">
              {stage.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
