"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Download,
  Trash2,
  FileText,
  Image,
  FileSpreadsheet,
  File,
  MoreHorizontal,
  Search,
  ArrowUpDown,
  Loader2,
  UploadCloud,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import { getCsrfToken } from "../utils/csrf";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentAttachmentItem {
  attachmentId: string;
  fileName:     string;
  contentType:  string;
  sizeBytes:    number;
  linkedAt:     string;
  downloadUrl:  string;
}

type StagedStatus = "uploading" | "done" | "error";

interface StagedDoc {
  key:          string;
  file:         File;
  progress:     number;
  status:       StagedStatus;
  attachmentId: string | null;
  errorMessage: string | null;
}

type SortKey = "name" | "size" | "date";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

function DocIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith("image/")) return <Image className={cn("shrink-0", className)} />;
  if (contentType === "application/pdf") return <FileText className={cn("shrink-0 text-destructive", className)} />;
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("csv"))
    return <FileSpreadsheet className={cn("shrink-0 text-success", className)} />;
  return <File className={cn("shrink-0", className)} />;
}

// ── Upload hook ───────────────────────────────────────────────────────────────

function useDocUpload(entityType: string, entityId: string, onLinked: (item: DocumentAttachmentItem) => void) {
  const [staged, setStaged] = useState<StagedDoc[]>([]);

  const uploadAndLink = useCallback(async (entry: StagedDoc) => {
    setStaged((prev) =>
      prev.map((s) => s.key === entry.key ? { ...s, status: "uploading" as StagedStatus, progress: 10, errorMessage: null } : s),
    );

    try {
      const form = new FormData();
      form.append("file", entry.file);

      const uploadRes = await fetch("/api/collab/attachments", {
        method:  "POST",
        headers: { "X-CSRF-Token": getCsrfToken() },
        body:    form,
      });

      if (!uploadRes.ok) {
        const b = await uploadRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((b.message as string) ?? `Upload failed (${uploadRes.status})`);
      }

      const { attachment_id, file_name, content_type, size_bytes } =
        await uploadRes.json() as {
          attachment_id: string;
          file_name:     string;
          content_type:  string;
          size_bytes:    number;
        };

      setStaged((prev) =>
        prev.map((s) => s.key === entry.key ? { ...s, progress: 70 } : s),
      );

      // Link to entity
      const linkRes = await fetch(`/api/collab/attachments/${attachment_id}/link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      });

      if (!linkRes.ok) throw new Error(`Link failed (${linkRes.status})`);

      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key
            ? { ...s, status: "done" as StagedStatus, progress: 100, attachmentId: attachment_id }
            : s,
        ),
      );

      onLinked({
        attachmentId: attachment_id,
        fileName:     file_name,
        contentType:  content_type,
        sizeBytes:    size_bytes,
        linkedAt:     new Date().toISOString(),
        downloadUrl:  `/api/collab/attachments/${attachment_id}/download`,
      });

      // Remove from staged after brief show
      setTimeout(() => {
        setStaged((prev) => prev.filter((s) => s.key !== entry.key));
      }, 1500);
    } catch (err) {
      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key
            ? { ...s, status: "error" as StagedStatus, progress: 0, errorMessage: String(err) }
            : s,
        ),
      );
    }
  }, [entityType, entityId, onLinked]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const entries: StagedDoc[] = arr.map((file) => ({
      key:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress:     0,
      status:       "uploading" as StagedStatus,
      attachmentId: null,
      errorMessage: null,
    }));
    setStaged((prev) => [...prev, ...entries]);
    setTimeout(() => {
      entries.forEach((e) => void uploadAndLink(e));
    }, 0);
  }, [uploadAndLink]);

  const retry = useCallback((key: string) => {
    setStaged((prev) => {
      const entry = prev.find((s) => s.key === key);
      if (!entry || entry.status !== "error") return prev;
      void uploadAndLink(entry);
      return prev.map((s) =>
        s.key === key ? { ...s, status: "uploading" as StagedStatus, progress: 10, errorMessage: null } : s,
      );
    });
  }, [uploadAndLink]);

  const dismiss = useCallback((key: string) => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const isUploading = staged.some((s) => s.status === "uploading");

  return { staged, addFiles, retry, dismiss, isUploading };
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFiles: (files: File[]) => void;
}

function InlineDropZone({ onFiles }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.value = "";
  }, []);

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-border/80 hover:bg-muted/50",
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <UploadCloud className={cn("size-8", isDragging ? "text-primary" : "text-muted-foreground")} />
      <div className="text-center">
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          PDF, images, spreadsheets, documents — up to 100 MB each
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
        }}
      />
    </label>
  );
}

// ── Staged upload row ─────────────────────────────────────────────────────────

function StagedRow({ item, onRetry, onDismiss }: {
  item:      StagedDoc;
  onRetry:   (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const isError = item.status === "error";

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
      isError ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30",
    )}>
      {isError
        ? <AlertCircle className="size-4 shrink-0 text-destructive" />
        : <DocIcon contentType={item.file.type} className="size-4 text-muted-foreground" />}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.file.name}</p>
        {item.status === "uploading" && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {isError && (
          <p className="mt-0.5 text-xs text-destructive/80">{item.errorMessage ?? "Upload failed"}</p>
        )}
        {item.status === "done" && (
          <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {item.status === "uploading" && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        {isError && (
          <button
            type="button"
            onClick={() => onRetry(item.key)}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Retry"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
        {(isError || item.status === "done") && (
          <button
            type="button"
            onClick={() => onDismiss(item.key)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            title="Dismiss"
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── File card (linked) ────────────────────────────────────────────────────────

function FileCard({ item, onDelete }: { item: DocumentAttachmentItem; onDelete: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isImage = item.contentType.startsWith("image/");

  return (
    <div className="group relative flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-2xs transition-colors hover:bg-muted/30">
      {isImage ? (
        <div className="size-9 shrink-0 overflow-hidden rounded-md border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.downloadUrl}
            alt={item.fileName}
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <DocIcon contentType={item.contentType} className="size-5 text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.sizeBytes)} · {item.contentType.split("/")[1]?.toUpperCase() ?? "FILE"} · {timeAgo(item.linkedAt)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <a
          href={item.downloadUrl}
          download={item.fileName}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Download"
        >
          <Download className="size-3.5" />
        </a>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="More options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/5"
                  onClick={() => { setMenuOpen(false); onDelete(item.attachmentId); }}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface DocumentAttachmentsTabProps {
  entityType: string;
  entityId:   string;
  className?: string;
}

export function DocumentAttachmentsTab({ entityType, entityId, className }: DocumentAttachmentsTabProps) {
  const [items, setItems]       = useState<DocumentAttachmentItem[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [query, setQuery]       = useState("");
  const [sortKey, setSortKey]   = useState<SortKey>("date");
  const [sortAsc, setSortAsc]   = useState(false);

  const handleLinked = useCallback((item: DocumentAttachmentItem) => {
    setItems((prev) => [item, ...prev]);
  }, []);

  const { staged, addFiles, retry, dismiss, isUploading } = useDocUpload(
    entityType, entityId, handleLinked,
  );

  // Initial fetch
  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/collab/entity-attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body: { data?: DocumentAttachmentItem[] }) => {
        setItems(body.data ?? []);
      })
      .catch(() => setError("Failed to load attachments."))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const handleDelete = useCallback(async (attachmentId: string) => {
    try {
      await fetch(`/api/collab/attachments/${attachmentId}/link`, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      });
      setItems((prev) => prev.filter((i) => i.attachmentId !== attachmentId));
    } catch {
      // best-effort
    }
  }, [entityType, entityId]);

  const handleDownloadAll = useCallback(() => {
    items.forEach((item) => {
      const a = document.createElement("a");
      a.href = item.downloadUrl;
      a.download = item.fileName;
      a.click();
    });
  }, [items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = items
    .filter((i) => i.fileName.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.fileName.localeCompare(b.fileName);
      else if (sortKey === "size") cmp = a.sizeBytes - b.sizeBytes;
      else cmp = new Date(a.linkedAt).getTime() - new Date(b.linkedAt).getTime();
      return sortAsc ? cmp : -cmp;
    });

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload zone */}
      <InlineDropZone onFiles={addFiles} />

      {/* Staged uploads */}
      {staged.length > 0 && (
        <div className="space-y-2">
          {staged.map((s) => (
            <StagedRow key={s.key} item={s} onRetry={retry} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={() => toggleSort("name")} className="h-8 gap-1 text-xs">
          <ArrowUpDown className="size-3" /> Name
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleSort("size")} className="h-8 gap-1 text-xs">
          <ArrowUpDown className="size-3" /> Size
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleSort("date")} className="h-8 gap-1 text-xs">
          <ArrowUpDown className="size-3" /> Date
        </Button>

        {items.length > 1 && (
          <Button variant="outline" size="sm" onClick={handleDownloadAll} className="h-8 gap-1 text-xs" disabled={isUploading}>
            <Download className="size-3" />
            Download all
          </Button>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {query ? "No files match your search." : "No attachments yet. Upload files above."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <FileCard key={item.attachmentId} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {items.length} {items.length === 1 ? "file" : "files"} · Max 100 MB per file
      </p>
    </div>
  );
}
