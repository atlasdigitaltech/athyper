"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@athyper/ui/primitives";
import { ActivityTimeline } from "@athyper/collaboration-ui/activity";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";

export interface EventsPanelProps {
  entityCode: string;
  recordId: string;
  /** UUID of the record — required by the activity API (/api/activity/:entity/:id validates UUID).
   *  When omitted, recordId is used as-is (only safe if recordId already is a UUID). */
  recordUuid?: string;
}

export function EventsPanel({ entityCode, recordId, recordUuid }: EventsPanelProps) {
  const apiId = recordUuid ?? recordId;
  const { data, isLoading } = useQuery<{ data: ActivityEntry[] }>({
    queryKey: ["activity", entityCode, apiId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/relay/api/activity/${entityCode}/${apiId}`, { signal });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ActivityEntry[] }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return <ActivityTimeline entries={data?.data ?? []} />;
}
