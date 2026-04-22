"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";

interface QualityCheck {
  id: string;
  check_name: string;
  status: "pass" | "fail" | "warning";
  detail?: string;
}

const STATUS_ICON = {
  pass:    <CheckCircle    className="h-4 w-4 text-success"     />,
  fail:    <XCircle        className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle  className="h-4 w-4 text-warning"     />,
} satisfies Record<QualityCheck["status"], ReactNode>;

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No quality checks configured</p>
    </div>
  );
}

export interface QualityPanelProps {
  entityCode: string;
  recordId: string;
}

export function QualityPanel({ entityCode, recordId }: QualityPanelProps) {
  const { data, isLoading } = useQuery<{ data: QualityCheck[] }>({
    queryKey: ["record-quality", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/quality`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: QualityCheck[] }>;
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

  const checks = data?.data ?? [];
  if (checks.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {checks.map((check) => (
        <div key={check.id} className="flex items-start gap-3 py-3">
          <span className="mt-0.5 shrink-0">{STATUS_ICON[check.status]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{check.check_name}</p>
            {check.detail && (
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
