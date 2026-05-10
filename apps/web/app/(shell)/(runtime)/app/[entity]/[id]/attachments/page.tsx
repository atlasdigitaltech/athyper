"use client";

/**
 * Runtime entity attachments — /app/[entity]/[id]/attachments
 *
 * File attachment management for any entity type.
 * Generalised from document attachments — uses `entity` and `id` params.
 * API path: /api/relay/documents/{entity}/{id}/attachments
 *
 * [id] = canonical business key (NOT UUID).
 *
 * Examples:
 *   /app/purchase_invoice/INV-10045/attachments
 *   /app/purchase_order/PO-2045/attachments
 *   /app/supplier/SUP-001/attachments
 */

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { DragDropUploadZone } from "@athyper/content-ui";
import { bffFetch, getCsrfToken } from "@/lib/bff-fetch";
import { formatBytes, formatTitle } from "@/lib/format";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  created_by_name: string | null;
  download_url: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mimeIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "📊";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  return "📎";
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAttachments(entityCode: string, entityId: string) {
  return useQuery<Attachment[]>({
    queryKey: ["attachments", entityCode, entityId],
    queryFn: async () => {
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}/attachments`,
      );
      if (!res.ok) throw new Error("Failed to load attachments");
      return res.json() as Promise<Attachment[]>;
    },
    staleTime: 30 * 1000,
  });
}

function useDeleteAttachment(entityCode: string, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      bffFetch(
        `/api/relay/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attachments", entityCode, entityId] });
    },
  });
}

// ── Attachment row ─────────────────────────────────────────────────────────────

function AttachmentRow({
  attachment,
  onDelete,
  isDeleting,
}: {
  attachment: Attachment;
  onDelete(): void;
  isDeleting: boolean;
}) {
  const uploadedAt = new Date(attachment.created_at).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/30 transition-colors">
      <span className="text-xl">{mimeIcon(attachment.content_type)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(attachment.size_bytes)} · {uploadedAt}
          {attachment.created_by_name && ` · by ${attachment.created_by_name}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className="text-doc-support font-mono">
          {attachment.content_type.split("/")[1]?.toUpperCase() ?? attachment.content_type}
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
          <a
            href={attachment.download_url}
            download={attachment.filename}
            target="_blank"
            rel="noreferrer"
            aria-label={`Download ${attachment.filename}`}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
          loading={isDeleting}
          disabled={isDeleting}
          aria-label={`Delete ${attachment.filename}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppEntityAttachmentsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const entity = params["entity"] as string;
  const id     = params["id"]     as string;

  const { data: attachments, isLoading } = useAttachments(entity, id);
  const deleteMutation = useDeleteAttachment(entity, id);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      setUploadError(null);
      const url  = `/api/relay/documents/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/attachments`;
      const csrf = getCsrfToken();
      try {
        await Promise.all(
          files.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(url, {
              method: "POST",
              body: fd,
              headers: { "X-CSRF-Token": csrf },
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "Upload failed" })) as { error?: string };
              throw new Error(err.error ?? "Upload failed");
            }
          }),
        );
        queryClient.invalidateQueries({ queryKey: ["attachments", entity, id] });
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [entity, id, queryClient],
  );

  // Guard — all hooks above; safe to return early from here
  const { guardLoading, denied } = useSubrouteGuard(entity, "hasAttachments");
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entity} entityId={id} />;

  return (
    <PageFrame
      title="Attachments"
      description={`${formatTitle(entity)} — file attachments`}
      width="narrow"
      actions={
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      }
    >
      <div className="space-y-6">

        {/* Upload zone */}
        <div>
          <h2 className="mb-2 text-sm font-medium">Upload files</h2>
          <DragDropUploadZone
            onUpload={handleUpload}
            multiple
            maxSizeMb={25}
            isUploading={isUploading}
          />
          {uploadError && (
            <p className="mt-2 text-xs text-destructive">{uploadError}</p>
          )}
        </div>

        {/* Attachment list */}
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
            Files
            {attachments && attachments.length > 0 && (
              <Badge variant="secondary" className="text-doc-support px-1.5">{attachments.length}</Badge>
            )}
          </h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !attachments || attachments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No files attached yet</p>
              <p className="text-xs text-muted-foreground/70">Upload files using the zone above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <AttachmentRow
                  key={a.id}
                  attachment={a}
                  onDelete={() => deleteMutation.mutate(a.id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === a.id}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </PageFrame>
  );
}
