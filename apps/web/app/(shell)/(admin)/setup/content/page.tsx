"use client";

/**
 * CMS Quarantine — /setup/content
 *
 * Admin console for attachments flagged as infected by ClamAV.
 * Shows the quarantine queue with scan result detail.
 * Admin actions: release (override → active) or permanently delete.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, RefreshCw, CheckCircle2, Trash2, AlertTriangle,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanMeta {
  scanner:    string;
  scannedAt:  string;
  result:     string;
  threat?:    string;
}

interface QuarantinedAttachment {
  id:             string;
  fileName:       string;
  contentType:    string;
  sizeBytes:      number | null;
  status:         string;
  quarantinedAt:  string;
  scanResult:     ScanMeta | null;
  entityType:     string | null;
  entityId:       string | null;
  uploadedByName: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// ── Confirm Delete Dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: QuarantinedAttachment;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/relay/content/admin/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Delete failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quarantine"] });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete quarantined file?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{attachment.fileName}</span> will be removed from storage
            and all entity links will be deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {del.error && (
          <p className="text-xs text-destructive px-1">{del.error.message}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); del.mutate(); }}
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Quarantine Row ─────────────────────────────────────────────────────────────

function QuarantineRow({ item }: { item: QuarantinedAttachment }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const release = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/relay/content/admin/attachments/${item.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Release failed");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarantine"] }),
  });

  const threat = item.scanResult?.threat ?? "Unknown threat";

  return (
    <>
      <RowCard
        badge={
          <Badge variant="destructive" className="text-doc-support gap-1">
            <ShieldAlert className="h-2.5 w-2.5" />
            QUARANTINED
          </Badge>
        }
        title={item.fileName}
        metadata={
          <>
            <span className="font-mono text-doc-support text-destructive">
              {threat}
            </span>
            <span className="text-doc-support text-muted-foreground">
              {item.contentType} · {fmtBytes(item.sizeBytes)}
            </span>
            {item.entityType && (
              <span className="font-mono text-doc-support text-muted-foreground">
                {item.entityType}
                {item.entityId ? ` / ${item.entityId.slice(0, 8)}…` : ""}
              </span>
            )}
            {item.uploadedByName && (
              <span className="text-doc-support text-muted-foreground">
                Uploaded by {item.uploadedByName}
              </span>
            )}
            <span className="text-doc-support text-muted-foreground">
              Quarantined {fmtDateTime(item.quarantinedAt)}
            </span>
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => release.mutate()}
              disabled={release.isPending}
              title="Override scan result and restore to active"
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" />
              {release.isPending ? "Releasing…" : "Release"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              title="Permanently delete this file"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        }
      />
      <DeleteDialog
        attachment={item}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentQuarantinePage() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<{
    data: QuarantinedAttachment[];
    hasMore: boolean;
  }>({
    queryKey: ["quarantine"],
    queryFn: async () => {
      const res = await fetch("/api/relay/content/admin/quarantined?limit=50");
      if (!res.ok) throw new Error("Failed to load quarantine list");
      return res.json();
    },
    staleTime: 30_000,
  });

  const items = data?.data ?? [];

  return (
    <PageFrame
      title="CMS Quarantine"
      description="Attachments flagged by ClamAV virus scanning. Release to restore or delete permanently."
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["quarantine"] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load quarantine list. Check your connection and try again.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8 text-muted-foreground/30" />}
          title="No quarantined files."
          description="ClamAV has not flagged any attachments in this tenant."
          className="py-20"
        />
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <QuarantineRow key={item.id} item={item} />
          ))}
          {data?.hasMore && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Showing first 50 results — refine your search to narrow results.
            </p>
          )}
        </div>
      )}
    </PageFrame>
  );
}
