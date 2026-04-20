"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { Skeleton, Badge } from "@athyper/ui/primitives";

interface IntegrationEvent {
  id: string;
  event_type: string;
  provider_name: string;
  status: "success" | "failed" | "pending";
  created_at: string;
  error_message?: string;
}

const STATUS_VARIANT: Record<IntegrationEvent["status"], "success" | "destructive" | "outline"> = {
  success: "success",
  failed: "destructive",
  pending: "outline",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Link2 className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No integration events</p>
    </div>
  );
}

export interface IntegrationsPanelProps {
  entityCode: string;
  recordId: string;
}

export function IntegrationsPanel({ entityCode, recordId }: IntegrationsPanelProps) {
  const { data, isLoading } = useQuery<{ data: IntegrationEvent[] }>({
    queryKey: ["record-integration-events", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/integration-events`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: IntegrationEvent[] }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const events = data?.data ?? [];
  if (events.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {events.map((evt) => (
        <div key={evt.id} className="flex items-start gap-3 py-3">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{evt.provider_name}</span>
              <Badge variant={STATUS_VARIANT[evt.status]} className="text-[10px]">
                {evt.status}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{evt.event_type}</span>
            </div>
            {evt.error_message && (
              <p className="mt-0.5 text-xs text-destructive truncate">{evt.error_message}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(evt.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
