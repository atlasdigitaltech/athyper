"use client";

import { useQuery } from "@tanstack/react-query";
import { Paperclip, FileText, Download } from "lucide-react";
import { Skeleton, Button } from "@athyper/ui/primitives";

interface Attachment {
  id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  created_at: string;
  download_url: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Paperclip className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No attachments on this record</p>
    </div>
  );
}

export interface AttachmentsPanelProps {
  entityCode: string;
  recordId: string;
}

export function AttachmentsPanel({ entityCode, recordId }: AttachmentsPanelProps) {
  const { data: attachments, isLoading } = useQuery<Attachment[]>({
    queryKey: ["attachments", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/attachments`,
        { signal },
      );
      if (!res.ok) return [];
      return res.json() as Promise<Attachment[]>;
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

  if (!attachments || attachments.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {attachments.map((att) => (
        <div key={att.id} className="flex items-center gap-3 py-3">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{att.filename}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(att.size_bytes)}</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(att.created_at).toLocaleDateString()}
          </span>
          <Button variant="ghost" size="icon" asChild>
            <a href={att.download_url} download={att.filename} aria-label="Download">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}
