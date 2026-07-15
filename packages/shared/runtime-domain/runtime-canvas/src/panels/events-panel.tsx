"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@athyper/ui/primitives";
import { ActivityFeed } from "@athyper/collaboration-ui";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";

export interface EventsPanelProps {
  entityCode: string;
  recordId: string;
  recordUuid?: string;
}

export function EventsPanel({ entityCode, recordId, recordUuid }: EventsPanelProps) {
  const apiId = recordUuid ?? recordId;
  const { data, error, isLoading } = useQuery<{ data: ActivityEntry[] }>({
    queryKey: ["activity", entityCode, apiId],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/relay/api/activity/${entityCode}/${apiId}`, { signal });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Activity request failed with ${response.status}`);
      }
      return response.json() as Promise<{ data: ActivityEntry[] }>;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Activity could not be loaded.
      </div>
    );
  }

  return (
    <ActivityFeed
      entries={data?.data ?? []}
      onOpenAuditLog={(eventId: string) => {
        window.open(`/audit/events?entityType=${encodeURIComponent(entityCode)}&eventId=${encodeURIComponent(eventId)}`, "_blank");
      }}
    />
  );
}
