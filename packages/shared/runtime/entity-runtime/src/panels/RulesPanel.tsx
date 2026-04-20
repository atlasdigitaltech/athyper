"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { Skeleton, Badge } from "@athyper/ui/primitives";

interface RecordRule {
  id: string;
  name: string;
  trigger_event: string;
  action_type: string;
  is_enabled: boolean;
  last_triggered_at?: string;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Zap className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No automation rules</p>
    </div>
  );
}

export interface RulesPanelProps {
  entityCode: string;
  recordId: string;
}

export function RulesPanel({ entityCode, recordId }: RulesPanelProps) {
  const { data, isLoading } = useQuery<{ data: RecordRule[] }>({
    queryKey: ["record-rules", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/rules`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: RecordRule[] }>;
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

  const rules = data?.data ?? [];
  if (rules.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-start gap-3 py-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{rule.name}</span>
              <Badge variant={rule.is_enabled ? "success" : "outline"} className="text-[10px]">
                {rule.is_enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              On <span className="font-mono">{rule.trigger_event}</span> → {rule.action_type}
            </p>
          </div>
          {rule.last_triggered_at && (
            <span className="text-xs text-muted-foreground shrink-0">
              Last run {new Date(rule.last_triggered_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
