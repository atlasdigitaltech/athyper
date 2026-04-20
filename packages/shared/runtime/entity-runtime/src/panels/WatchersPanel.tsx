"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";

interface RecordWatcher {
  id: string;
  user_id: string;
  display_name: string;
  email?: string;
  added_at: string;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Eye className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No watchers</p>
    </div>
  );
}

export interface WatchersPanelProps {
  entityCode: string;
  recordId: string;
}

export function WatchersPanel({ entityCode, recordId }: WatchersPanelProps) {
  const { data, isLoading } = useQuery<{ data: RecordWatcher[] }>({
    queryKey: ["record-watchers", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/watchers`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: RecordWatcher[] }>;
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const watchers = data?.data ?? [];
  if (watchers.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {watchers.map((w) => (
        <div key={w.id} className="flex items-center gap-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
            {w.display_name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{w.display_name}</p>
            {w.email && <p className="text-xs text-muted-foreground truncate">{w.email}</p>}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(w.added_at).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}
