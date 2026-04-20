"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";
import { ApprovalPanel } from "@athyper/workflow-ui/approval";
import type { ApprovalContext, WorkflowEvent } from "@athyper/api-contracts/workflow";

interface ApprovalsResponse {
  context: ApprovalContext;
  event_trail?: WorkflowEvent[];
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No approval workflow active</p>
    </div>
  );
}

export interface ApprovalsPanelProps {
  entityCode: string;
  recordId: string;
}

export function ApprovalsPanel({ entityCode, recordId }: ApprovalsPanelProps) {
  const { data, isLoading } = useQuery<ApprovalsResponse | null>({
    queryKey: ["record-approvals", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/approvals`,
        { signal },
      );
      if (!res.ok) return null;
      const json = await res.json() as Record<string, unknown>;
      if (!json.context) return null;
      return json as unknown as ApprovalsResponse;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!data?.context) return <EmptyState />;

  return <ApprovalPanel context={data.context} eventTrail={data.event_trail} />;
}
