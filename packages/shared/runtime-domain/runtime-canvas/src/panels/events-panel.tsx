"use client";

import { Skeleton } from "@athyper/platform-ui/primitives";
import { ActivityFeed } from "@athyper/platform-communications-collaboration-ui";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { useRecordWorkspaceActivity } from "../record-query";

export interface EventsPanelProps {
  entityCode: string;
  recordId: string;
  recordUuid?: string;
  fields?: MetaEntityField[];
  recordData?: Record<string, unknown>;
}

export function EventsPanel({ entityCode, fields, recordData }: EventsPanelProps) {
  const { data, error, isLoading } = useRecordWorkspaceActivity<{ data: ActivityEntry[] }>();

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
      fields={fields}
      recordData={recordData}
      onOpenAuditLog={(eventId: string) => {
        window.open(`/audit/events?entityType=${encodeURIComponent(entityCode)}&eventId=${encodeURIComponent(eventId)}`, "_blank");
      }}
    />
  );
}
