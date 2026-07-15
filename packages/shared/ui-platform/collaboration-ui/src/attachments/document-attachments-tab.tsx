"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Download, Trash2, FileText, Image as ImageIcon, FileSpreadsheet,
  File, FileCode, Search, Loader2, UploadCloud, AlertCircle,
  RotateCcw, Eye, Info, Lock, Globe, EyeOff, ShieldX, ArrowLeft,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import { formatBytes } from "@athyper/runtime-shared/core";
import { getCsrfToken } from "@athyper/runtime-shared/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentAttachmentItem {
  attachmentId:      string;
  fileName:          string;
  contentType:       string;
  sizeBytes:         number;
  linkedAt:          string;
  downloadUrl:       string;
  uploadedByName?:   string | null;
  visibility?:       "internal" | "shared" | "private";
  scanStatus?:       "pending" | "clean" | "quarantined";
  previewStatus?:    "pending" | "ready" | "failed" | "none";
  previewKind?:      "image" | "pdf" | "text" | "none";
  extractionStatus?: string | null;
  versionNo?:        number;
  isCurrent?:        boolean;
  kind?:             string;
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

type SortOption    = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "size-desc" | "size-asc";
type FileCategory  = "all" | "images" | "pdf" | "docs" | "sheets" | "other";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, includeTime = false): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const base: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) return d.toLocaleString("en-US", { ...base, hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", base);
}

function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot >= 0) return fileName.slice(dot + 1).toUpperCase().slice(0, 8);
  return "FILE";
}

function categorize(item: DocumentAttachmentItem): Exclude<FileCategory, "all"> {
  const ct = item.contentType;
  if (ct.startsWith("image/"))                                                              return "images";
  if (ct === "application/pdf")                                                             return "pdf";
  if (ct.includes("spreadsheet") || ct.includes("excel") || ct === "text/csv")             return "sheets";
  if (ct.includes("word") || ct.includes("document") || ct.startsWith("text/") || ct === "application/json") return "docs";
  return "other";
}

function derivePreviewKind(contentType: string): "image" | "pdf" | "text" | "none" {
  if (contentType.startsWith("image/"))                                                          return "image";
  if (contentType === "application/pdf")                                                         return "pdf";
  if (contentType.startsWith("text/") || contentType === "application/json" || contentType === "application/xml") return "text";
  return "none";
}

function DocIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith("image/"))                                                return <ImageIcon      className={cn("shrink-0 text-primary",           className)} />;
  if (contentType === "application/pdf")                                               return <FileText       className={cn("shrink-0 text-destructive",        className)} />;
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType === "text/csv")
                                                                                       return <FileSpreadsheet className={cn("shrink-0 text-success",           className)} />;
  if (contentType.includes("word") || contentType.includes("document"))                return <FileText       className={cn("shrink-0 text-foreground",         className)} />;
  if (contentType.startsWith("text/") || contentType === "application/json")          return <FileCode       className={cn("shrink-0 text-muted-foreground",    className)} />;
  return                                                                                       <File          className={cn("shrink-0 text-muted-foreground",    className)} />;
}

// ── Badges ────────────────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility?: "internal" | "shared" | "private" }) {
  const v = visibility ?? "internal";
  if (v === "shared")   return <span className="inline-flex items-center gap-0.5 rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning"><Globe   className="size-2.5" />Shared</span>;
  if (v === "private")  return <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted      px-1.5 py-0.5 text-xs font-medium text-muted-foreground"><EyeOff  className="size-2.5" />Private</span>;
  return                       <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted      px-1.5 py-0.5 text-xs font-medium text-muted-foreground"><Lock    className="size-2.5" />Internal</span>;
}

function ScanBadge({ scanStatus }: { scanStatus?: "pending" | "clean" | "quarantined" }) {
  if (scanStatus === "quarantined") {
    return <span className="inline-flex items-center gap-0.5 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"><ShieldX className="size-2.5" />Quarantined</span>;
  }
  return null;
}

function PreviewBadge({ previewStatus, previewKind }: { previewStatus?: string; previewKind?: string }) {
  if (!previewKind || previewKind === "none" || !previewStatus) return null;
  if (previewStatus === "failed") {
    return <span className="inline-flex items-center gap-0.5 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Preview failed</span>;
  }
  return null;
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
        await uploadRes.json() as { attachment_id: string; file_name: string; content_type: string; size_bytes: number };

      setStaged((prev) => prev.map((s) => s.key === entry.key ? { ...s, progress: 70 } : s));

      const linkRes = await fetch(`/api/collab/attachments/${attachment_id}/link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      });

      if (!linkRes.ok) throw new Error(`Link failed (${linkRes.status})`);

      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key ? { ...s, status: "done" as StagedStatus, progress: 100, attachmentId: attachment_id } : s,
        ),
      );

      onLinked({
        attachmentId:    attachment_id,
        fileName:        file_name,
        contentType:     content_type,
        sizeBytes:       size_bytes,
        linkedAt:        new Date().toISOString(),
        downloadUrl:     `/api/collab/attachments/${attachment_id}/download`,
        uploadedByName:  null,
        visibility:      "internal",
        scanStatus:      "pending",
        previewStatus:   derivePreviewKind(content_type) !== "none" ? "pending" : "none",
        previewKind:     derivePreviewKind(content_type),
        versionNo:       1,
        isCurrent:       true,
        kind:            "attachment",
        extractionStatus: null,
      });

      setTimeout(() => {
        setStaged((prev) => prev.filter((s) => s.key !== entry.key));
      }, 1500);
    } catch (err) {
      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key ? { ...s, status: "error" as StagedStatus, progress: 0, errorMessage: String(err) } : s,
        ),
      );
    }
  }, [entityType, entityId, onLinked]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr     = Array.from(files);
    const entries = arr.map<StagedDoc>((file) => ({
      key:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress:     0,
      status:       "uploading",
      attachmentId: null,
      errorMessage: null,
    }));
    setStaged((prev) => [...prev, ...entries]);
    setTimeout(() => { entries.forEach((e) => void uploadAndLink(e)); }, 0);
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

  return { staged, addFiles, retry, dismiss, isUploading: staged.some((s) => s.status === "uploading") };
}

// ── Drop zones ────────────────────────────────────────────────────────────────

function FullDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40",
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <UploadCloud className={cn("size-9", isDragging ? "text-primary" : "text-muted-foreground")} />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Click or drag files to upload</p>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF, images, Office, text — up to 100 MB each</p>
      </div>
      <input type="file" multiple className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.html,.json,.zip" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); }} />
    </label>
  );
}

function CompactDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/30",
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <UploadCloud className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Drop files here or</span>
      <span className="text-primary">browse</span>
      <input type="file" multiple className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.html,.json,.zip" onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); }} />
    </label>
  );
}

// ── Staged upload row ─────────────────────────────────────────────────────────

function StagedRow({ item, onRetry, onDismiss }: { item: StagedDoc; onRetry: (k: string) => void; onDismiss: (k: string) => void }) {
  const isError = item.status === "error";
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm", isError ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20")}>
      {isError ? <AlertCircle className="size-4 shrink-0 text-destructive" /> : <DocIcon contentType={item.file.type} className="size-4" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{item.file.name}</p>
        {item.status === "uploading" && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {isError   && <p className="mt-0.5 text-xs text-destructive/80">{item.errorMessage ?? "Upload failed"}</p>}
        {item.status === "done" && <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>}
      </div>
      <div className="flex items-center gap-1">
        {item.status === "uploading" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {isError && (
          <button type="button" onClick={() => onRetry(item.key)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Retry">
            <RotateCcw className="size-3.5" />
          </button>
        )}
        {(isError || item.status === "done") && (
          <button type="button" onClick={() => onDismiss(item.key)} className="rounded p-1 text-muted-foreground hover:bg-accent" title="Dismiss">
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── File card ─────────────────────────────────────────────────────────────────

function FileCard({
  item,
  onDelete,
  onProperties,
}: {
  item:          DocumentAttachmentItem;
  onDelete:      (id: string) => void;
  onProperties:  (item: DocumentAttachmentItem) => void;
}) {
  const isImage      = item.contentType.startsWith("image/");
  const canPreview   = (item.previewKind ?? derivePreviewKind(item.contentType)) !== "none";
  const isQuarantined = item.scanStatus === "quarantined";

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-2xs",
      isQuarantined && "border-destructive/30 bg-destructive/5",
    )}>
      {/* Icon / thumbnail */}
      <div className="mt-0.5 shrink-0">
        {isImage ? (
          <div className="size-9 overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.downloadUrl} alt={item.fileName} className="size-full object-cover" loading="lazy" />
          </div>
        ) : (
          <DocIcon contentType={item.contentType} className="size-5" />
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.fileName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fileExt(item.fileName)} · {formatBytes(item.sizeBytes)}
          {item.uploadedByName ? ` · ${item.uploadedByName}` : ""}
          {" · "}{formatDate(item.linkedAt)}
        </p>
        {/* Intelligence badges */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <VisibilityBadge visibility={item.visibility} />
          <ScanBadge       scanStatus={item.scanStatus} />
          <PreviewBadge    previewStatus={item.previewStatus} previewKind={item.previewKind} />
          {item.extractionStatus === "extracted" && (
            <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Text extracted</span>
          )}
          {item.isCurrent === false && (
            <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Older version</span>
          )}
        </div>
      </div>

      {/* Actions — always visible */}
      <div className="flex shrink-0 items-center gap-0.5">
        {canPreview && !isQuarantined && (
          <a
            href={item.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Preview"
          >
            <Eye className="size-3.5" />
          </a>
        )}
        <a
          href={item.downloadUrl}
          download={item.fileName}
          className={cn("rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground", isQuarantined && "pointer-events-none opacity-40")}
          title="Download"
        >
          <Download className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={() => onProperties(item)}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Properties"
        >
          <Info className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.attachmentId)}
          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Properties panel ──────────────────────────────────────────────────────────

function PropertiesPanel({
  item,
  onClose,
  onRename,
}: {
  item:     DocumentAttachmentItem;
  onClose:  () => void;
  onRename: (id: string, newName: string) => void;
}) {
  const [editName, setEditName]   = useState(item.fileName);
  const [isSaving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === item.fileName) { onRename(item.attachmentId, trimmed || item.fileName); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/collab/attachments/${item.attachmentId}/properties`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ file_name: trimmed }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((b.message as string) ?? `Save failed (${res.status})`);
      }
      onRename(item.attachmentId, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const infoRow = (label: string, value: string | null | undefined) => value
    ? <div className="flex items-start gap-3 py-1.5"><span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span><span className="text-xs text-foreground">{value}</span></div>
    : null;

  const scanLabel = item.scanStatus === "quarantined" ? "Quarantined" : item.scanStatus === "clean" ? "Clean" : "Not scanned";
  const previewLabel =
    !item.previewKind || item.previewKind === "none" ? "Not supported" :
    item.previewStatus === "ready"   ? "Ready" :
    item.previewStatus === "failed"  ? "Failed" : "Pending";
  const extractLabel =
    item.extractionStatus === "extracted" ? "Extracted" :
    item.extractionStatus === "skipped"   ? "Skipped"   :
    item.extractionStatus === "failed"    ? "Failed"    : "Not processed";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Back">
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-sm font-medium text-foreground">File properties</span>
      </div>

      {/* Identity */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <DocIcon contentType={item.contentType} className="size-8 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{item.fileName}</p>
          <p className="text-xs text-muted-foreground">{fileExt(item.fileName)} · {formatBytes(item.sizeBytes)}</p>
        </div>
      </div>

      {/* Rename */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Display name</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => { setEditName(e.target.value); setSaved(false); }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="File name"
          />
          <Button size="sm" variant="outline" onClick={() => void handleSave()} disabled={isSaving} className="h-8 text-xs">
            {isSaving ? <Loader2 className="size-3 animate-spin" /> : saved ? "Saved" : "Save"}
          </Button>
        </div>
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </div>

      {/* Access */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Access</p>
        <div className="rounded-lg border border-border p-3 space-y-0">
          {infoRow("Visibility", item.visibility === "shared" ? "Shared externally" : item.visibility === "private" ? "Private" : "Internal only")}
        </div>
      </div>

      {/* Processing */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Processing</p>
        <div className="rounded-lg border border-border p-3 space-y-0">
          {infoRow("Virus scan",       scanLabel)}
          {infoRow("Preview",          previewLabel)}
          {infoRow("Text extraction",  extractLabel)}
        </div>
      </div>

      {/* Version */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Version</p>
        <div className="rounded-lg border border-border p-3 space-y-0">
          {infoRow("Version",  String(item.versionNo ?? 1))}
          {infoRow("Status",   item.isCurrent !== false ? "Current" : "Older version")}
        </div>
      </div>

      {/* Audit */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Audit</p>
        <div className="rounded-lg border border-border p-3 space-y-0">
          {infoRow("Uploaded by", item.uploadedByName ?? "—")}
          {infoRow("Uploaded on", formatDate(item.linkedAt, true))}
          {infoRow("Kind",        item.kind ?? "attachment")}
        </div>
      </div>
    </div>
  );
}

// ── Summary header ────────────────────────────────────────────────────────────

function SummaryHeader({ items }: { items: DocumentAttachmentItem[] }) {
  const total      = items.length;
  const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
  const shared     = items.filter((i) => i.visibility === "shared").length;
  const quarantined = items.filter((i) => i.scanStatus === "quarantined").length;

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="text-xs font-medium text-foreground">{total} {total === 1 ? "file" : "files"}</span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">{formatBytes(totalBytes)}</span>
      {shared > 0 && (
        <>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-0.5 text-xs text-warning"><Globe className="size-3" />{shared} shared</span>
        </>
      )}
      {quarantined > 0 && (
        <>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-0.5 text-xs text-destructive"><ShieldX className="size-3" />{quarantined} quarantined</span>
        </>
      )}
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
  const [items,    setItems]    = useState<DocumentAttachmentItem[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [query,    setQuery]    = useState("");
  const [sort,     setSort]     = useState<SortOption>("date-desc");
  const [category, setCategory] = useState<FileCategory>("all");
  const [propertiesItem, setPropertiesItem] = useState<DocumentAttachmentItem | null>(null);

  const handleLinked = useCallback((item: DocumentAttachmentItem) => {
    setItems((prev) => [item, ...prev]);
  }, []);

  const { staged, addFiles, retry, dismiss, isUploading } = useDocUpload(entityType, entityId, handleLinked);

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/collab/entity-attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body: { data?: DocumentAttachmentItem[] }) => { setItems(body.data ?? []); })
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
      if (propertiesItem?.attachmentId === attachmentId) setPropertiesItem(null);
    } catch { /* best-effort */ }
  }, [entityType, entityId, propertiesItem]);

  const handleRename = useCallback((attachmentId: string, newName: string) => {
    setItems((prev) => prev.map((i) => i.attachmentId === attachmentId ? { ...i, fileName: newName } : i));
    setPropertiesItem((prev) => prev && prev.attachmentId === attachmentId ? { ...prev, fileName: newName } : prev);
  }, []);

  // Sorting
  const sorted = [...items].sort((a, b) => {
    switch (sort) {
      case "name-asc":   return a.fileName.localeCompare(b.fileName);
      case "name-desc":  return b.fileName.localeCompare(a.fileName);
      case "size-asc":   return a.sizeBytes - b.sizeBytes;
      case "size-desc":  return b.sizeBytes - a.sizeBytes;
      case "date-asc":   return new Date(a.linkedAt).getTime() - new Date(b.linkedAt).getTime();
      default:           return new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime();
    }
  });

  // Category counts for filter tabs
  const counts: Record<FileCategory, number> = {
    all: items.length, images: 0, pdf: 0, docs: 0, sheets: 0, other: 0,
  };
  for (const item of items) counts[categorize(item)]++;

  // Apply category + search filter
  const filtered = sorted
    .filter((i) => category === "all" || categorize(i) === category)
    .filter((i) => i.fileName.toLowerCase().includes(query.toLowerCase()));

  // ── Properties view ──────────────────────────────────────────────────────────
  if (propertiesItem) {
    return (
      <div className={cn("space-y-4", className)}>
        <PropertiesPanel
          item={propertiesItem}
          onClose={() => setPropertiesItem(null)}
          onRename={handleRename}
        />
      </div>
    );
  }

  // ── Main list view ───────────────────────────────────────────────────────────
  const tabs: { key: FileCategory; label: string }[] = [
    { key: "all",    label: "All" },
    { key: "images", label: "Images" },
    { key: "pdf",    label: "PDFs" },
    { key: "docs",   label: "Docs" },
    { key: "sheets", label: "Sheets" },
    { key: "other",  label: "Other" },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary */}
      <SummaryHeader items={items} />

      {/* Upload area */}
      {items.length === 0 && staged.length === 0 && !isLoading
        ? <FullDropZone onFiles={addFiles} />
        : <CompactDropZone onFiles={addFiles} />
      }

      {/* Staged upload queue */}
      {staged.length > 0 && (
        <div className="space-y-1.5">
          {staged.map((s) => <StagedRow key={s.key} item={s} onRetry={retry} onDismiss={dismiss} />)}
        </div>
      )}

      {/* Controls — only render when files exist */}
      {items.length > 0 && (
        <>
          {/* File type filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  category === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab.label}
                <span className={cn("text-xs opacity-60", category === tab.key && "opacity-80")}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search + sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search files…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="size-desc">Largest first</option>
              <option value="size-asc">Smallest first</option>
            </select>
          </div>
        </>
      )}

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
      ) : filtered.length === 0 && items.length === 0 ? null : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {query ? "No files match your search." : `No ${category === "all" ? "" : category + " "}files.`}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item) => (
            <FileCard
              key={item.attachmentId}
              item={item}
              onDelete={handleDelete}
              onProperties={setPropertiesItem}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && items.length === 0 && staged.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Use attachments for certificates, invoices, contracts, screenshots, and supporting evidence.
        </p>
      )}
    </div>
  );
}
