"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart2, FileDown } from "lucide-react";
import { Skeleton, Button } from "@athyper/ui/primitives";

interface RecordReport {
  id: string;
  name: string;
  description?: string;
  report_type: string;
  template_url?: string;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No reports available</p>
    </div>
  );
}

export interface ReportsPanelProps {
  entityCode: string;
  recordId: string;
}

export function ReportsPanel({ entityCode, recordId }: ReportsPanelProps) {
  const { data, isLoading } = useQuery<{ data: RecordReport[] }>({
    queryKey: ["record-reports", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/reports`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: RecordReport[] }>;
    },
    staleTime: 120 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  const reports = data?.data ?? [];
  if (reports.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      {reports.map((report) => (
        <div key={report.id} className="flex items-center gap-4 rounded-lg border px-4 py-3">
          <FileDown className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{report.name}</p>
            {report.description && (
              <p className="text-xs text-muted-foreground truncate">{report.description}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground uppercase shrink-0">{report.report_type}</span>
          {report.template_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={report.template_url} target="_blank" rel="noopener noreferrer">Run</a>
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
