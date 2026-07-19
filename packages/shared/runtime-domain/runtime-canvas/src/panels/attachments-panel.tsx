"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, Pencil, X, FolderPlus, Folder, FolderOpen,
  ChevronRight, ChevronDown, FileText, Image as ImageIcon,
  FileSpreadsheet, FileCode, File, Download, Eye, Lock, Globe, MoveRight,
  ShieldCheck, ShieldX, Search, Shield, Clock, AlertTriangle, ExternalLink,
  CheckCircle, Check, MoreHorizontal, Trash2, Link2, Info,
} from "lucide-react";
import { Skeleton, Button } from "@athyper/ui/primitives";
import { DRAWER_CONTROL, DRAWER_DETAIL_SURFACE, DRAWER_ITEM_TITLE, DRAWER_LABEL, DRAWER_META, DRAWER_SECTION_HEADING, DRAWER_VALUE } from "@athyper/ui/typography";
import { cn } from "@athyper/theme/utils";
import { formatBytes } from "@athyper/runtime-shared/core";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import {
  useRecordWorkspaceAttachmentWorkspace,
  useRecordWorkspaceQueryContext,
} from "../record-query";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentFolder {
  id:            string;
  name:          string;
  parent_id:     string | null;
  display_order: number;
  created_at:    string;
}

export interface Attachment {
  id:              string;
  filename:        string;
  size_bytes:      number;
  content_type:    string;
  created_at:      string;
  created_by_name: string | null;
  folder_id:       string | null;
  download_url:    string;
  kind?:              "attachment" | "evidence" | "inline_comment_image" | "avatar" | "template_asset";
  visibility?:        "internal" | "shared_with_supplier" | "private" | "restricted";
  scan_status?:       "pending" | "clean" | "failed" | "quarantined";
  preview_status?:    "pending" | "ready" | "failed" | "unsupported";
  preview_kind?:      "image" | "pdf" | "text" | "html" | "none";
  thumbnail_url?:     string;
  preview_url?:       string;
  extraction_status?: "pending" | "extracted" | "skipped" | "failed";
  version_no?:        number;
  is_current?:        boolean;
  status?:            string;
  link_kind?:         string;
}

interface QueuedFile {
  id:       string;
  file:     File;
  state:    "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?:   string;
}

interface DragInfo {
  count:  number;
  images: number;
  pdfs:   number;
  docs:   number;
  sheets: number;
  others: number;
}

interface FailedUpload {
  name:  string;
  error: string;
}

type SortOption   = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "size-desc" | "size-asc";
type FileCategory = "all" | "images" | "pdf" | "docs" | "sheets" | "other";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string, includeTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const base: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  if (includeTime) return d.toLocaleString("en-US", { ...base, hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", base);
}

function formatRelativeTime(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)         return "just now";
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / (7 * 86_400_000))}w ago`;
  return formatDate(iso);
}

// ── Visibility config — tokens only, no hardcoded colors ─────────────────────

const VISIBILITY_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  pillCls: string;
  optionActiveCls: string;
}> = {
  internal: {
    label:           "Internal",
    description:     "Visible to internal users only",
    icon:            ShieldCheck,
    pillCls:         "border-border/60 bg-muted/70 text-muted-foreground hover:bg-muted",
    optionActiveCls: "border-primary/20 bg-primary/5",
  },
  shared_with_supplier: {
    label:           "Public",
    description:     "Visible to external users",
    icon:            Globe,
    pillCls:         "border-success/30 bg-success/10 text-success hover:bg-success/15",
    optionActiveCls: "border-success/20 bg-success/5",
  },
  private: {
    label:           "Private",
    description:     "Visible only to me",
    icon:            Lock,
    pillCls:         "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
    optionActiveCls: "border-warning/20 bg-warning/5",
  },
};

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase().slice(0, 8) : "FILE";
}

function splitFilename(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot < 1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function categorize(att: Attachment): Exclude<FileCategory, "all"> {
  const ct = att.content_type;
  if (ct.startsWith("image/"))                                                          return "images";
  if (ct === "application/pdf")                                                         return "pdf";
  if (ct.includes("spreadsheet") || ct.includes("excel") || ct === "text/csv")         return "sheets";
  if (ct.includes("word") || ct.includes("document") || ct.startsWith("text/") || ct === "application/json") return "docs";
  return "other";
}

function detectPreviewKind(att: Attachment): "image" | "pdf" | "text" | "none" {
  if (att.preview_kind && att.preview_kind !== "none" && att.preview_kind !== "html") {
    return att.preview_kind as "image" | "pdf" | "text";
  }
  const ct = att.content_type;
  if (ct.startsWith("image/"))                              return "image";
  if (ct === "application/pdf")                             return "pdf";
  if (ct.startsWith("text/") || ct === "application/json") return "text";
  return "none";
}

function normalizeUploadedAttachment(body: unknown, file: File, apiBase: string): Attachment | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Partial<Attachment>;
  const id   = typeof data.id === "string" ? data.id : null;
  if (!id) return null;

  const contentType = typeof data.content_type === "string" && data.content_type
    ? data.content_type
    : file.type || "application/octet-stream";
  const status = typeof data.status === "string" && data.status ? data.status : "active";

  return {
    id,
    filename:        typeof data.filename === "string" && data.filename ? data.filename : file.name,
    size_bytes:      typeof data.size_bytes === "number" ? data.size_bytes : file.size,
    content_type:    contentType,
    created_at:      typeof data.created_at === "string" && data.created_at ? data.created_at : new Date().toISOString(),
    created_by_name: data.created_by_name ?? null,
    folder_id:       data.folder_id ?? null,
    download_url:    typeof data.download_url === "string" && data.download_url
      ? data.download_url
      : `${apiBase}/${encodeURIComponent(id)}/download`,
    kind:              data.kind ?? "attachment",
    visibility:        data.visibility ?? "internal",
    scan_status:       data.scan_status ?? (status === "quarantined" ? "quarantined" : "pending"),
    preview_status:    data.preview_status,
    preview_kind:      data.preview_kind,
    thumbnail_url:     data.thumbnail_url,
    preview_url:       data.preview_url,
    extraction_status: data.extraction_status,
    version_no:        typeof data.version_no === "number" ? data.version_no : 1,
    is_current:        data.is_current ?? true,
    status,
    link_kind:         data.link_kind ?? "related",
  };
}

function prependAttachments(current: Attachment[] | undefined, incoming: Attachment[]): Attachment[] {
  if (incoming.length === 0) return current ?? [];
  const incomingIds = new Set(incoming.map((att) => att.id));
  return [...incoming, ...(current ?? []).filter((att) => !incomingIds.has(att.id))];
}

function mergeWithOptimistic(serverItems: Attachment[], optimisticItems: Attachment[]): Attachment[] {
  if (optimisticItems.length === 0) return serverItems;
  const serverIds = new Set(serverItems.map((att) => att.id));
  return [...optimisticItems.filter((att) => !serverIds.has(att.id)), ...serverItems];
}

function parseDragItems(items: DataTransferItemList): DragInfo {
  const files = Array.from(items).filter((i) => i.kind === "file");
  const types = files.map((i) => i.type ?? "");
  const images = types.filter((t) => t.startsWith("image/")).length;
  const pdfs   = types.filter((t) => t === "application/pdf").length;
  const sheets = types.filter((t) => t.includes("spreadsheet") || t.includes("excel") || t === "text/csv").length;
  const docs   = types.filter((t) => t.includes("word") || t.includes("document") || (t.startsWith("text/") && t !== "text/csv")).length;
  const others = files.length - images - pdfs - sheets - docs;
  return { count: files.length, images, pdfs, docs, sheets, others: Math.max(0, others) };
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function DocIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith("image/"))                                                     return <ImageIcon       className={cn("shrink-0 text-primary",         className)} />;
  if (contentType === "application/pdf")                                                    return <FileText        className={cn("shrink-0 text-destructive",      className)} />;
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType === "text/csv")
                                                                                            return <FileSpreadsheet className={cn("shrink-0 text-success",          className)} />;
  if (contentType.includes("word") || contentType.includes("document"))                    return <FileText        className={cn("shrink-0 text-foreground",       className)} />;
  if (contentType.startsWith("text/") || contentType === "application/json")               return <FileCode        className={cn("shrink-0 text-muted-foreground", className)} />;
  return                                                                                           <File            className={cn("shrink-0 text-muted-foreground", className)} />;
}

// ── Visibility pill — inline clickable control in the meta row ────────────────

function VisibilityPill({
  att,
  apiBase,
  onUpdated,
  disabled,
}: {
  att:       Attachment;
  apiBase:   string;
  onUpdated(): void;
  disabled?: boolean;
}) {
  const [open,    setOpen]    = useState(false);
  const [pending, setPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const v       = att.visibility ?? "internal";
  const cfg     = VISIBILITY_CONFIG[v] ?? VISIBILITY_CONFIG.internal!;
  const Icon    = cfg.icon;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = async (next: string) => {
    if (next === v) { setOpen(false); return; }
    setPending(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ visibility: next }),
      });
      onUpdated();
    } finally { setPending(false); setOpen(false); }
  };

  return (
    <div className="relative inline-flex shrink-0" ref={menuRef}>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={(e) => { e.stopPropagation(); setOpen((x) => !x); }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-60",
          cfg.pillCls,
        )}
      >
        {pending
          ? <Loader2 className="size-2.5 animate-spin" />
          : <Icon className="size-2.5 shrink-0" />}
        {cfg.label}
        <ChevronDown className="size-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-popover py-1 shadow-lg">
          {Object.entries(VISIBILITY_CONFIG).map(([key, opt]) => {
            const OptionIcon = opt.icon;
            const isActive   = key === v;
            return (
              <button
                key={key}
                type="button"
                onClick={(e) => { e.stopPropagation(); void handleSelect(key); }}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted",
                  isActive && opt.optionActiveCls,
                )}
              >
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {isActive
                    ? <Check className="size-3.5 text-primary" />
                    : <OptionIcon className="size-3.5 text-muted-foreground" />}
                </span>
                <span>
                  <span className="block text-xs font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function ProcessingBadge({ scanStatus, previewStatus }: { scanStatus?: string; previewStatus?: string }) {
  if (scanStatus === "pending") return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Shield className="size-2.5 animate-pulse" />Scanning
    </span>
  );
  if (previewStatus === "pending") return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock className="size-2.5" />Preview pending
    </span>
  );
  if (previewStatus === "failed") return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
      <AlertTriangle className="size-2.5" />Preview failed
    </span>
  );
  return null;
}

function QuarantinedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
      <ShieldX className="size-2.5" />Quarantined
    </span>
  );
}

function JustAddedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground leading-none">
      just now
    </span>
  );
}

// ── Drag overlay ──────────────────────────────────────────────────────────────

function DragOverlay({ info }: { info: DragInfo | null }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-primary bg-background/96 backdrop-blur-[2px]">
      <Upload className="size-8 text-primary" />
      <div className="text-center">
        <p className="text-base font-medium text-foreground">Drop to upload</p>
        {info && info.count > 0 && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {info.count} {info.count === 1 ? "file" : "files"}
          </p>
        )}
      </div>
      {info && (info.images > 0 || info.pdfs > 0 || info.docs > 0 || info.sheets > 0 || info.others > 0) && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {info.images > 0 && <TypeChip label={`${info.images} image${info.images !== 1 ? "s" : ""}`} />}
          {info.pdfs   > 0 && <TypeChip label={`${info.pdfs} PDF${info.pdfs !== 1 ? "s" : ""}`} />}
          {info.docs   > 0 && <TypeChip label={`${info.docs} doc${info.docs !== 1 ? "s" : ""}`} />}
          {info.sheets > 0 && <TypeChip label={`${info.sheets} sheet${info.sheets !== 1 ? "s" : ""}`} />}
          {info.others > 0 && <TypeChip label={`${info.others} other${info.others !== 1 ? "s" : ""}`} />}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3 shrink-0" />
        <span>Will be set to Internal · change visibility per file after upload</span>
      </div>
    </div>
  );
}

function TypeChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-foreground">
      {label}
    </span>
  );
}

// ── Upload in-progress tray ────────────────────────────────────────────────────

function UploadQueueTray({ files }: { files: QueuedFile[] }) {
  const done  = files.filter((f) => f.state === "uploaded").length;
  const total = files.length;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <span className={DRAWER_ITEM_TITLE}>
          Uploading {done + 1} of {total} {total === 1 ? "file" : "files"}…
        </span>
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      </div>
      <div className="max-h-40 divide-y divide-border overflow-y-auto">
        {files.map((qf) => (
          <div key={qf.id} className="flex items-center gap-3 px-3 py-2">
            <DocIcon contentType={qf.file.type ?? ""} className="size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate", DRAWER_ITEM_TITLE)}>{qf.file.name}</p>
              <div className="mt-0.5">
                {qf.state === "uploading" && (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-150"
                        style={{ width: `${qf.progress}%` }}
                      />
                    </div>
                    <span className={cn("shrink-0 tabular-nums", DRAWER_META)}>{qf.progress}%</span>
                  </div>
                )}
                {qf.state === "queued"   && <span className={DRAWER_META}>Waiting…</span>}
                {qf.state === "uploaded" && <span className={DRAWER_META}>Uploaded</span>}
                {qf.state === "failed"   && <span className={cn(DRAWER_META, "text-destructive")}>{qf.error ?? "Upload failed"}</span>}
              </div>
            </div>
            <div className="shrink-0">
              {qf.state === "queued"    && <Clock         className="size-3.5 text-muted-foreground" />}
              {qf.state === "uploading" && <Loader2       className="size-3.5 animate-spin text-primary" />}
              {qf.state === "uploaded"  && <CheckCircle   className="size-3.5 text-success" />}
              {qf.state === "failed"    && <AlertTriangle className="size-3.5 text-destructive" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Success strip — auto-dismisses after 4 s ──────────────────────────────────

function SuccessStrip({ count, onDismiss }: { count: number; onDismiss(): void }) {
  const [remaining, setRemaining] = useState(4);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Tick down every second
  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Dismiss after the countdown reaches zero — after render, not during
  useEffect(() => {
    if (remaining === 0) onDismissRef.current();
  }, [remaining]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
      <CheckCircle className="size-3.5 shrink-0 text-success" />
      <span className="flex-1 text-xs font-medium text-success">
        {count} {count === 1 ? "file" : "files"} uploaded · scanning in progress
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">auto-dismiss in {remaining}s</span>
    </div>
  );
}

// ── Failure strip — persists until dismissed ──────────────────────────────────

function FailureStrip({ files, onDismiss }: { files: FailedUpload[]; onDismiss(): void }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <span className={cn(DRAWER_ITEM_TITLE, "text-destructive")}>
            {files.length} {files.length === 1 ? "file" : "files"} failed to upload
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          aria-label="Dismiss"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-3" /><span>Dismiss</span>
        </button>
      </div>
      <div className="space-y-1 pl-5">
        {files.map((f, i) => (
          <p key={i} className="text-xs text-destructive/80">
            <span className="font-medium">{f.name}</span>
            {" · "}{f.error}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Bulk action bar ────────────────────────────────────────────────────────────

interface BulkActionBarProps {
  selectedCount: number;
  visibleCount:  number;
  allVisible:    boolean;
  onSelectAll(): void;
  onDeselectAll(): void;
  onDownload(): void;
  onMove(): void;
  onDelete(): void;
  onCancel(): void;
  moreMenu: React.ReactNode;
}

function BulkActionBar({
  selectedCount, visibleCount, allVisible,
  onSelectAll, onDeselectAll, onDownload, onMove, onDelete, onCancel,
  moreMenu,
}: BulkActionBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground leading-none tabular-nums">
        {selectedCount} selected
      </span>
      <button
        type="button"
        onClick={allVisible ? onDeselectAll : onSelectAll}
        className="shrink-0 rounded border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        {allVisible ? "Deselect all" : `Select all ${visibleCount}`}
      </button>
      <div className="flex flex-1 items-center justify-end gap-1">
        <button
          type="button"
          onClick={onDownload}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Download</span>
        </button>
        <button
          type="button"
          onClick={onMove}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
        >
          <MoveRight className="size-3.5" />
          <span className="hidden sm:inline">Move</span>
        </button>
        {moreMenu}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Exit selection"
          title="Exit selection (Esc)"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Delete confirm bar (inline, replaces bulk action bar) ─────────────────────

function DeleteConfirmBar({
  count,
  typed,
  onTyped,
  onConfirm,
  onCancel,
  pending,
}: {
  count:    number;
  typed:    string;
  onTyped(v: string): void;
  onConfirm(): void;
  onCancel(): void;
  pending:  boolean;
}) {
  const needsTyped = count > 10;
  const canConfirm = !needsTyped || typed === "DELETE";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
      <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
      <span className="flex-1 text-xs font-medium text-destructive">
        Delete {count} {count === 1 ? "file" : "files"}? This cannot be undone.
      </span>
      {needsTyped && (
        <input
          autoFocus
          placeholder='Type "DELETE" to confirm'
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) onConfirm(); }}
          className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-destructive w-44"
        />
      )}
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={onConfirm}
          disabled={!canConfirm || pending}
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : `Delete ${count}`}
        </Button>
      </div>
    </div>
  );
}

// ── Bulk move overlay ─────────────────────────────────────────────────────────

function BulkMoveOverlay({
  folders,
  currentFolderId,
  pending,
  onMove,
  onCancel,
}: {
  folders:         AttachmentFolder[];
  currentFolderId: string | null;
  pending:         boolean;
  onMove(folderId: string | null): void;
  onCancel(): void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <p className="mb-2 text-xs font-medium text-foreground">Move selected files to:</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onMove(null)}
          disabled={pending || currentFolderId === null}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40 transition-colors"
        >
          Uncategorized
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onMove(f.id)}
            disabled={pending}
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <Folder className="size-3 text-primary" />
            {f.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── More menu ─────────────────────────────────────────────────────────────────

function MoreMenu({
  selectedIds,
  attachments,
  apiBase,
  onVisibilitySet,
}: {
  selectedIds:       Set<string>;
  attachments:       Attachment[];
  apiBase:           string;
  onVisibilitySet(): void;
}) {
  const [open,         setOpen]         = useState(false);
  const [visMenu,      setVisMenu]      = useState(false);
  const [visPending,   setVisPending]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopyLinks = async () => {
    const selected = attachments.filter((a) => selectedIds.has(a.id));
    const lines = selected.map((a) => `${a.filename}: ${a.download_url}`).join("\n");
    await navigator.clipboard.writeText(lines).catch(() => {});
    setOpen(false);
  };

  const handleSetVisibility = async (visibility: string) => {
    setVisPending(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          fetch(`${apiBase}/${encodeURIComponent(id)}`, {
            method:  "PATCH",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
            body:    JSON.stringify({ visibility }),
          }),
        ),
      );
      onVisibilitySet();
    } finally {
      setVisPending(false);
      setVisMenu(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg">
          {/* Set visibility sub-menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setVisMenu((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted text-foreground"
            >
              <span className="flex items-center gap-2"><Globe className="size-3.5" />Set visibility</span>
              <ChevronRight className="size-3 text-muted-foreground" />
            </button>
            {visMenu && (
              <div className="absolute left-full top-0 ml-1 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg">
                {(["internal", "shared_with_supplier", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={visPending}
                    onClick={() => void handleSetVisibility(v)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-foreground disabled:opacity-50"
                  >
                    {visPending ? <Loader2 className="size-3 animate-spin" /> : null}
                    {VISIBILITY_CONFIG[v]?.label ?? v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <hr className="my-1 border-border" />

          <button
            type="button"
            onClick={() => void handleCopyLinks()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-foreground"
          >
            <ExternalLink className="size-3.5" />Copy download links
          </button>
        </div>
      )}
    </div>
  );
}

// ── Per-card more menu — secondary actions only ───────────────────────────────

function PerCardMoreMenu({
  att,
  onRename,
  onViewDetails,
  onDeleted,
}: {
  att:           Attachment;
  onRename():    void;
  onViewDetails(): void;
  onDeleted():   void;
}) {
  const [open,      setOpen]      = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(att.download_url).catch(() => {});
    setOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setOpen(false);
    try {
      // deletion is handled by the parent FileRow's onDeleted callback chain
      onDeleted();
    } finally { setIsDeleting(false); }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {isDeleting
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <MoreHorizontal className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg">
          <button type="button" onClick={() => { onRename(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted">
            <Pencil className="size-3.5" />Rename
          </button>
          <button type="button" onClick={() => void handleCopyLink()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted">
            <Link2 className="size-3.5" />Copy link
          </button>
          <button type="button" disabled
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground opacity-40 cursor-not-allowed">
            <Upload className="size-3.5" />Replace file
          </button>
          <button type="button" onClick={() => { onViewDetails(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted">
            <Info className="size-3.5" />View details
          </button>
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => void handleDelete()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
            <Trash2 className="size-3.5" />Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ att, onClose }: { att: Attachment; onClose: () => void }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError,   setTextError]   = useState(false);
  const kind = detectPreviewKind(att);

  useEffect(() => {
    if (kind !== "text") return;
    setTextLoading(true);
    fetch(att.download_url)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t)  => { setTextContent(t); setTextLoading(false); })
      .catch(()  => { setTextError(true); setTextLoading(false); });
  }, [att.download_url, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background/98 backdrop-blur-md">
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{att.filename}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fileExt(att.filename)} · {formatBytes(att.size_bytes)}
            {att.created_by_name ? ` · ${att.created_by_name}` : ""}
            {" · "}{formatDate(att.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={att.download_url} download={att.filename}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            <Download className="size-3.5" />Download
          </a>
          <a href={att.download_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            <ExternalLink className="size-3.5" />Open
          </a>
          <button type="button" onClick={onClose} aria-label="Close preview"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-6">
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={att.preview_url ?? att.download_url} alt={att.filename}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg" />
        )}
        {kind === "pdf" && (
          <iframe src={att.download_url} title={att.filename}
            className="h-full w-full max-w-5xl rounded-md border border-border shadow" />
        )}
        {kind === "text" && (
          <div className="w-full max-w-4xl overflow-hidden rounded-md border border-border bg-background shadow">
            {textLoading && <div className="flex items-center justify-center p-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
            {textError   && <p className="p-8 text-center text-sm text-muted-foreground">Could not load file content.</p>}
            {textContent !== null && (
              <pre className="max-h-[70vh] overflow-auto p-5 text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap">{textContent}</pre>
            )}
          </div>
        )}
        {kind === "none" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <File className="size-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
            <a href={att.download_url} download={att.filename}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
              <Download className="size-4" />Download instead
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AttachmentsPanelProps {
  entityCode: string;
  recordId:   string;
  /** UUID of the record — required for master entities whose recordId is a string code. */
  recordUuid?: string;
  onSummaryChange?: (summary: AttachmentWorkspaceResponse["summary"]) => void;
}

export interface AttachmentWorkspaceResponse {
  ok: boolean;
  attachments: Attachment[];
  folders: AttachmentFolder[];
  summary: {
    count: number;
    totalBytes: number;
    internalCount: number;
    sharedCount: number;
    quarantinedCount: number;
  };
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  att,
  folders,
  apiBase,
  onDeleted,
  onMoved,
  onPreview,
  isJustAdded   = false,
  selectionMode = false,
  isSelected    = false,
  onToggle,
}: {
  att:          Attachment;
  folders:      AttachmentFolder[];
  apiBase:      string;
  onDeleted(removedId?: string): void;
  onMoved(folderId: string | null): void;
  onPreview(att: Attachment): void;
  isJustAdded?:   boolean;
  selectionMode?: boolean;
  isSelected?:    boolean;
  onToggle?(e: React.MouseEvent): void;
}) {
  const [isDeleting,          setIsDeleting]          = useState(false);
  const [renamingMode,        setRenamingMode]        = useState(false);
  const [renameValue,         setRenameValue]         = useState("");
  const [isRenaming,          setIsRenaming]          = useState(false);
  const [movingMode,          setMovingMode]          = useState(false);
  const [isMoving,            setIsMoving]            = useState(false);
  const [showInfo,            setShowInfo]            = useState(false);

  const { base, ext } = splitFilename(att.filename);
  const isQuarantined = att.status === "quarantined" || att.scan_status === "quarantined";
  const isScanning    = isJustAdded && (!att.scan_status || att.scan_status === "pending") && !isQuarantined;
  const previewKind   = detectPreviewKind(att);
  const canPreviewFile = previewKind !== "none" && !isQuarantined;
  const isImage       = att.content_type.startsWith("image/");

  // Visibility is now always in the meta line — only show scan/preview/version badges
  const hasBadges =
    isQuarantined ||
    (!isJustAdded && att.scan_status === "pending") ||
    att.preview_status === "pending" ||
    att.preview_status === "failed" ||
    (att.version_no ?? 1) > 1;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}`, {
        method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() },
      });
      onDeleted(att.id);
    } finally { setIsDeleting(false); }
  };

  const startRename  = () => { setRenamingMode(true); setRenameValue(base); setShowInfo(false); };
  const cancelRename = () => { setRenamingMode(false); setRenameValue(""); };
  const confirmRename = async () => {
    const newName = (renameValue.trim() || base) + ext;
    setIsRenaming(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ filename: newName }),
      });
      onDeleted();
    } finally { setIsRenaming(false); setRenamingMode(false); setRenameValue(""); }
  };

  const handleMove = async (folderId: string | null) => {
    setIsMoving(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}/move`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ folder_id: folderId }),
      });
      onMoved(folderId);
    } finally { setIsMoving(false); setMovingMode(false); }
  };

  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-colors",
        isQuarantined                          && "border-destructive/30 bg-destructive/5",
        isJustAdded && !isQuarantined          && "border-primary/20 bg-primary/5",
        selectionMode && isSelected && !isQuarantined && !isJustAdded && "border-primary/30 bg-primary/10",
        selectionMode                          && "cursor-pointer select-none",
      )}
      onClick={selectionMode ? onToggle : undefined}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">

        {/* Icon column — checkbox in selection mode, file icon otherwise */}
        <div
          className={cn("mt-0.5 shrink-0", !selectionMode && "group/iconarea cursor-pointer relative")}
          onClick={!selectionMode ? (e) => { e.stopPropagation(); onToggle?.(e); } : undefined}
        >
          {selectionMode ? (
            <div className={cn(
              "flex size-5 items-center justify-center rounded border-2 transition-colors",
              isSelected
                ? "border-primary bg-primary"
                : "border-muted-foreground/30 bg-background",
            )}>
              {isSelected && <Check className="size-3 text-primary-foreground" />}
            </div>
          ) : isImage ? (
            <div className="relative size-9 overflow-hidden rounded border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={att.thumbnail_url ?? att.download_url} alt={att.filename}
                className="size-full object-cover" loading="lazy" />
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover/iconarea:opacity-100">
                <div className="flex size-4 items-center justify-center rounded border border-primary/60 bg-background/80" />
              </div>
            </div>
          ) : (
            <div className="relative">
              <DocIcon contentType={att.content_type} className="size-5 mt-0.5 transition-opacity group-hover/iconarea:opacity-30" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/iconarea:opacity-100">
                <div className="flex size-4 items-center justify-center rounded border border-primary/60 bg-background/80" />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {renamingMode ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  void confirmRename();
                  if (e.key === "Escape") cancelRename();
                }}
                className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {ext && <span className="shrink-0 text-sm text-muted-foreground">{ext}</span>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className={cn("truncate", DRAWER_ITEM_TITLE)}>{att.filename}</p>
              {isJustAdded && <JustAddedBadge />}
            </div>
          )}

          {/* Meta line: ● visibility · ext · size · uploader · relative time */}
          {isScanning ? (
            <p className={cn("mt-0.5 flex items-center gap-1", DRAWER_META)}>
              <Shield className="size-3 shrink-0 animate-pulse" />
              Security scan in progress
            </p>
          ) : (
            <div className={cn("mt-0.5 flex items-center gap-1", DRAWER_META)}>
              <VisibilityPill att={att} apiBase={apiBase} onUpdated={onDeleted} disabled={selectionMode} />
              <span>·</span>
              <span>{fileExt(att.filename)}</span>
              <span>·</span>
              <span>{formatBytes(att.size_bytes)}</span>
              {att.created_by_name && <><span>·</span><span className="truncate">{att.created_by_name}</span></>}
              <span>·</span>
              <span className="shrink-0">{formatRelativeTime(att.created_at)}</span>
            </div>
          )}

          {/* Processing / quarantine / version badges (visibility is now in meta line) */}
          {hasBadges && !selectionMode && (
            <div className="mt-1 flex flex-wrap gap-1">
              {isQuarantined && <QuarantinedBadge />}
              <ProcessingBadge
                scanStatus={isJustAdded ? undefined : att.scan_status}
                previewStatus={att.preview_status}
              />
              {(att.version_no ?? 1) > 1 && (
                <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  v{att.version_no}
                </span>
              )}
            </div>
          )}

          {/* Move to folder picker */}
          {movingMode && !selectionMode && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={DRAWER_LABEL}>Move to:</span>
              <button onClick={() => void handleMove(null)} disabled={isMoving || att.folder_id === null}
                className="rounded border border-border px-2 py-0.5 text-sm hover:bg-muted disabled:opacity-40">
                Uncategorized
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => void handleMove(f.id)} disabled={isMoving || att.folder_id === f.id}
                  className="rounded border border-border px-2 py-0.5 text-sm hover:bg-muted disabled:opacity-40">
                  {f.name}
                </button>
              ))}
              <button onClick={() => setMovingMode(false)} className={cn("hover:text-foreground", DRAWER_CONTROL)}>Cancel</button>
            </div>
          )}

          {/* Inline info panel */}
          {showInfo && !renamingMode && !selectionMode && (
            <div className={cn("mt-2 space-y-1 px-3 py-2 text-sm", DRAWER_DETAIL_SURFACE)}>
              {att.created_by_name && (
                <div className="flex items-center gap-2">
                  <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Uploaded by</span>
                  <span className={DRAWER_VALUE}>{att.created_by_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Uploaded on</span>
                <span className={DRAWER_VALUE}>{formatDate(att.created_at, true)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Size</span>
                <span className={DRAWER_VALUE}>{formatBytes(att.size_bytes)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Type</span>
                <span className={DRAWER_VALUE}>{att.content_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Visibility</span>
                <span className={cn("capitalize", DRAWER_VALUE)}>{(att.visibility ?? "internal").replace(/_/g, " ")}</span>
              </div>
              {att.scan_status && (
                <div className="flex items-center gap-2">
                  <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Scan</span>
                  <span className={cn("capitalize", DRAWER_VALUE)}>{att.scan_status}</span>
                </div>
              )}
              {att.version_no && (
                <div className="flex items-center gap-2">
                  <span className={cn("w-20 shrink-0", DRAWER_LABEL)}>Version</span>
                  <span className={DRAWER_VALUE}>{att.version_no}</span>
                </div>
              )}
              <button type="button" onClick={startRename} className="mt-1 text-sm font-medium text-primary hover:underline">
                Rename file…
              </button>
            </div>
          )}
        </div>

        {/* Per-card actions — hidden during selection mode */}
        {!selectionMode && (
          <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {renamingMode ? (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary"
                  onClick={() => void confirmRename()} disabled={isRenaming}>
                  {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                  onClick={cancelRename} disabled={isRenaming}>Cancel</Button>
              </>
            ) : (
              <>
                {canPreviewFile && (
                  <button type="button" onClick={() => onPreview(att)} title="Preview"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                <a href={att.download_url} download={att.filename} title="Download"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                    isQuarantined && "pointer-events-none opacity-40",
                  )}>
                  <Download className="h-3.5 w-3.5" />
                </a>
                <PerCardMoreMenu
                  att={att}
                  onRename={startRename}
                  onViewDetails={() => setShowInfo((v) => !v)}
                  onDeleted={() => void handleDelete()}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Warning strip — quarantine / shared ───────────────────────────────────────

function SummaryHeader({ attachments }: { attachments: Attachment[] }) {
  const quarantined = attachments.filter(
    (a) => a.status === "quarantined" || a.scan_status === "quarantined",
  ).length;
  const shared = attachments.filter((a) => a.visibility === "shared_with_supplier").length;

  if (quarantined === 0 && shared === 0) return null;

  return (
    <div className="space-y-1.5">
      {quarantined > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <ShieldX className="size-3.5 shrink-0 text-destructive" />
          <span className={cn(DRAWER_ITEM_TITLE, "text-destructive")}>
            {quarantined} {quarantined === 1 ? "file" : "files"} quarantined — download disabled
          </span>
        </div>
      )}
      {shared > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Globe className="size-3.5 shrink-0 text-primary" />
          <span className={cn(DRAWER_ITEM_TITLE, "text-primary")}>
            {shared} {shared === 1 ? "file" : "files"} shared with supplier
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AttachmentsPanel({ entityCode, recordId, recordUuid, onSummaryChange }: AttachmentsPanelProps) {
  const queryClient    = useQueryClient();
  const workspaceContext = useRecordWorkspaceQueryContext();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const justAddedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectedIdxRef = useRef(-1);
  const visibleOrderedRef  = useRef<string[]>([]);

  // Upload state
  const [queuedFiles,   setQueuedFiles]   = useState<QueuedFile[]>([]);
  const [justAddedIds,  setJustAddedIds]  = useState<Set<string>>(new Set());
  const [optimisticUploads, setOptimisticUploads] = useState<Attachment[]>([]);
  const [successStrip,  setSuccessStrip]  = useState<{ id: number; count: number } | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ typed: string } | null>(null);
  const [bulkMoveOpen,  setBulkMoveOpen]  = useState(false);
  const [bulkOpPending, setBulkOpPending] = useState(false);

  // Drag state
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragInfo,   setDragInfo]   = useState<DragInfo | null>(null);

  // Preview state
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);

  // Folder state
  const [creatingFolder,       setCreatingFolder]       = useState(false);
  const [newFolderName,        setNewFolderName]        = useState("");
  const [isSavingFolder,       setIsSavingFolder]       = useState(false);
  const [renamingFolderId,     setRenamingFolderId]     = useState<string | null>(null);
  const [folderRenameVal,      setFolderRenameVal]      = useState("");
  const [isSavingFolderRename, setIsSavingFolderRename] = useState(false);
  const [expandedFolders,      setExpandedFolders]      = useState<Set<string>>(new Set());

  // Filter / search state
  const [query,    setQuery]    = useState("");
  const [sort,     setSort]     = useState<SortOption>("date-desc");
  const [category, setCategory] = useState<FileCategory>("all");

  const apiId      = recordUuid ?? recordId;
  const apiBase    = `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(apiId)}/attachments`;
  const folderBase = `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(apiId)}/folders`;
  const attachmentQueryKey = useMemo(
    () => queryKeys.recordWorkspace.attachmentWorkspace(workspaceContext.keyInput),
    [workspaceContext.keyInput],
  );

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
  }, []);

  // ── Queries ────────────────────────────────────────────────────────────────

  const attachmentWorkspace = useRecordWorkspaceAttachmentWorkspace<AttachmentWorkspaceResponse>();
  const serverAttachments = attachmentWorkspace.data?.attachments ?? [];
  const folders = attachmentWorkspace.data?.folders ?? [];
  const loadingFiles = attachmentWorkspace.isLoading;
  const loadingFolders = attachmentWorkspace.isLoading;

  useEffect(() => {
    if (attachmentWorkspace.data?.summary) onSummaryChange?.(attachmentWorkspace.data.summary);
  }, [attachmentWorkspace.data?.summary, onSummaryChange]);

  const attachments = useMemo(
    () => mergeWithOptimistic(serverAttachments, optimisticUploads),
    [serverAttachments, optimisticUploads],
  );

  const forgetLocalAttachments = useCallback((ids: Iterable<string>) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;

    setOptimisticUploads((prev) => prev.filter((att) => !idSet.has(att.id)));
    setJustAddedIds((prev) => {
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
    queryClient.setQueryData<AttachmentWorkspaceResponse>(attachmentQueryKey, (current) => current
      ? { ...current, attachments: current.attachments.filter((att) => !idSet.has(att.id)) }
      : current);
  }, [attachmentQueryKey, queryClient]);

  const refresh = useCallback((removedId?: string) => {
    if (removedId) forgetLocalAttachments([removedId]);
    void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
  }, [queryClient, attachmentQueryKey, forgetLocalAttachments]);

  // ── Selection helpers ──────────────────────────────────────────────────────

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDeleteConfirm(null);
    setBulkMoveOpen(false);
    lastSelectedIdxRef.current = -1;
  }, []);

  const handleToggle = useCallback((id: string, shiftKey: boolean) => {
    if (!selectionMode) setSelectionMode(true);

    if (shiftKey && lastSelectedIdxRef.current >= 0) {
      const ids = visibleOrderedRef.current;
      const idx = ids.indexOf(id);
      if (idx >= 0) {
        const from = Math.min(lastSelectedIdxRef.current, idx);
        const to   = Math.max(lastSelectedIdxRef.current, idx);
        setSelectedIds((prev) => new Set([...prev, ...ids.slice(from, to + 1)]));
      }
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      lastSelectedIdxRef.current = visibleOrderedRef.current.indexOf(id);
    }
  }, [selectionMode]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectionMode) {
        exitSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && selectionMode) {
        e.preventDefault();
        setSelectedIds(new Set(visibleOrderedRef.current));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectionMode, exitSelection]);

  // ── Bulk operations ────────────────────────────────────────────────────────

  const handleBulkDownload = useCallback(() => {
    attachments
      .filter((a) => selectedIds.has(a.id))
      .forEach((att) => {
        const a = document.createElement("a");
        a.href = att.download_url;
        a.download = att.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
  }, [attachments, selectedIds]);

  const handleBulkMove = useCallback(async (folderId: string | null) => {
    setBulkOpPending(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          fetch(`${apiBase}/${encodeURIComponent(id)}/move`, {
            method:  "PATCH",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
            body:    JSON.stringify({ folder_id: folderId }),
          }),
        ),
      );
      void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
      exitSelection();
    } finally { setBulkOpPending(false); }
  }, [selectedIds, apiBase, queryClient, attachmentQueryKey, exitSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    if (selectedIds.size > 10 && deleteConfirm.typed !== "DELETE") return;
    setBulkOpPending(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          fetch(`${apiBase}/${encodeURIComponent(id)}`, {
            method:  "DELETE",
            headers: { "X-CSRF-Token": getCsrfToken() },
          }),
        ),
      );
      forgetLocalAttachments(selectedIds);
      void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
      exitSelection();
    } finally { setBulkOpPending(false); }
  }, [deleteConfirm, selectedIds, apiBase, queryClient, attachmentQueryKey, forgetLocalAttachments, exitSelection]);

  // ── XHR upload ─────────────────────────────────────────────────────────────

  const uploadFileXhr = useCallback(
    (file: File, qfId: string, csrf: string): Promise<{ attachment: Attachment | null; error: string | null }> =>
      new Promise((resolve) => {
        setQueuedFiles((prev) => prev.map((qf) => qf.id === qfId ? { ...qf, state: "uploading" as const } : qf));

        const xhr = new XMLHttpRequest();
        const fd  = new FormData();
        fd.append("file", file);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setQueuedFiles((prev) => prev.map((qf) => qf.id === qfId ? { ...qf, progress: pct } : qf));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setQueuedFiles((prev) => prev.map((qf) => qf.id === qfId ? { ...qf, state: "uploaded" as const, progress: 100 } : qf));
            let attachment: Attachment | null = null;
            try { attachment = normalizeUploadedAttachment(JSON.parse(xhr.responseText), file, apiBase); } catch {}
            resolve({ attachment, error: null });
          } else {
            let errMsg = `Failed (${xhr.status})`;
            try { const d = JSON.parse(xhr.responseText) as { error?: string; message?: string }; errMsg = d.message ?? d.error ?? errMsg; } catch {}
            setQueuedFiles((prev) => prev.map((qf) => qf.id === qfId ? { ...qf, state: "failed" as const, error: errMsg } : qf));
            resolve({ attachment: null, error: errMsg });
          }
        });

        xhr.addEventListener("error", () => {
          setQueuedFiles((prev) => prev.map((qf) => qf.id === qfId ? { ...qf, state: "failed" as const, error: "Network error" } : qf));
          resolve({ attachment: null, error: "Network error" });
        });

        xhr.open("POST", apiBase);
        xhr.setRequestHeader("X-CSRF-Token", csrf);
        xhr.send(fd);
      }),
    [apiBase],
  );

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const csrf    = getCsrfToken();
    const entries: QueuedFile[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, state: "queued" as const, progress: 0,
    }));
    setQueuedFiles((prev) => [...prev, ...entries]);

    const results = await Promise.allSettled(entries.map((qf) => uploadFileXhr(qf.file, qf.id, csrf)));

    const uploadedAttachments: Attachment[] = [];
    const newFailures: FailedUpload[] = [];
    results.forEach((result, idx) => {
      const entry = entries[idx]!;
      if (result.status === "fulfilled") {
        if (result.value.attachment) uploadedAttachments.push(result.value.attachment);
        else newFailures.push({ name: entry.file.name, error: result.value.error ?? "Upload failed" });
      } else {
        newFailures.push({ name: entry.file.name, error: "Upload failed" });
      }
    });

    setQueuedFiles([]);

    if (uploadedAttachments.length > 0) {
      const uploadedIds = uploadedAttachments.map((att) => att.id);
      setOptimisticUploads((prev) => prependAttachments(prev, uploadedAttachments));
      queryClient.setQueryData<AttachmentWorkspaceResponse>(attachmentQueryKey, (current) => current
        ? { ...current, attachments: prependAttachments(current.attachments, uploadedAttachments) }
        : current);
      setJustAddedIds((prev) => new Set([...prev, ...uploadedIds]));
      setSuccessStrip({ id: Date.now(), count: uploadedAttachments.length });
      if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
      justAddedTimerRef.current = setTimeout(() => {
        setJustAddedIds(new Set());
        setOptimisticUploads([]);
        justAddedTimerRef.current = null;
      }, 5 * 60 * 1000);
    }
    if (newFailures.length > 0) setFailedUploads((prev) => [...prev, ...newFailures]);
    void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadFileXhr, queryClient, attachmentQueryKey]);

  // ── Drag handling ──────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) { setDragInfo(parseDragItems(e.dataTransfer.items)); setIsDragOver(true); }
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) { setIsDragOver(false); setDragInfo(null); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current = 0; setIsDragOver(false); setDragInfo(null);
    void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // ── Folder CRUD ────────────────────────────────────────────────────────────

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      const res = await fetch(folderBase, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const folder = await res.json() as AttachmentFolder;
        setExpandedFolders((prev) => new Set(prev).add(folder.id));
        void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
        setCreatingFolder(false); setNewFolderName("");
      }
    } finally { setIsSavingFolder(false); }
  };

  const renameFolder = async (folderId: string) => {
    const name = folderRenameVal.trim();
    if (!name) return;
    setIsSavingFolderRename(true);
    try {
      await fetch(`${folderBase}/${encodeURIComponent(folderId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ name }),
      });
      void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
      setRenamingFolderId(null); setFolderRenameVal("");
    } finally { setIsSavingFolderRename(false); }
  };

  const deleteFolder = async (folderId: string) => {
    await fetch(`${folderBase}/${encodeURIComponent(folderId)}`, {
      method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() },
    });
    refresh();
  };

  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // ── Derived state (must be before any early return so hooks order is stable) ─

  const totalCount  = attachments.length;
  const hasFiles    = totalCount > 0;
  const hasUploaded = hasFiles || folders.length > 0;
  const showQueue   = queuedFiles.length > 0;
  const isUploading = queuedFiles.some((f) => f.state === "uploading" || f.state === "queued");

  const justAdded = attachments.filter((a) => justAddedIds.has(a.id));
  const earlier   = attachments.filter((a) => !justAddedIds.has(a.id));
  const justAddedScanned = justAdded.filter(
    (a) => a.scan_status === "clean" || a.scan_status === "failed" || a.scan_status === "quarantined",
  ).length;

  const sortedList = (list: Attachment[]): Attachment[] =>
    [...list].sort((a, b) => {
      switch (sort) {
        case "name-asc":  return a.filename.localeCompare(b.filename);
        case "name-desc": return b.filename.localeCompare(a.filename);
        case "size-asc":  return a.size_bytes - b.size_bytes;
        case "size-desc": return b.size_bytes - a.size_bytes;
        case "date-asc":  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const searchFiltered = attachments.filter((a) =>
    !query.trim() || a.filename.toLowerCase().includes(query.toLowerCase()),
  );
  const counts: Record<FileCategory, number> = { all: searchFiltered.length, images: 0, pdf: 0, docs: 0, sheets: 0, other: 0 };
  for (const att of searchFiltered) counts[categorize(att)]++;

  const isFilterMode = query.trim() !== "" || category !== "all";
  const filteredFlat = sortedList(
    searchFiltered.filter((a) => category === "all" || categorize(a) === category),
  );

  const sortedJustAdded          = sortedList(justAdded);
  const uncategorizedEarlier     = earlier.filter((a) => !a.folder_id);
  const sortedUncategorizedEarlier = sortedList(uncategorizedEarlier);

  // Ordered list of all visible attachment IDs — used for ⌘A and shift-click range
  const visibleOrderedIds = useMemo((): string[] => {
    if (isFilterMode) return filteredFlat.map((a) => a.id);
    return [
      ...sortedJustAdded.map((a) => a.id),
      ...folders.flatMap((f) =>
        expandedFolders.has(f.id)
          ? sortedList(earlier.filter((a) => a.folder_id === f.id)).map((a) => a.id)
          : [],
      ),
      ...sortedUncategorizedEarlier.map((a) => a.id),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterMode, filteredFlat, sortedJustAdded, folders, expandedFolders, earlier, sortedUncategorizedEarlier]);

  visibleOrderedRef.current = visibleOrderedIds;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loadingFiles || loadingFolders) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
      </div>
    );
  }

  const allVisibleSelected = visibleOrderedIds.length > 0
    && visibleOrderedIds.every((id) => selectedIds.has(id));

  const tabs: { key: FileCategory; label: string }[] = [
    { key: "all",    label: "All" },
    { key: "images", label: "Images" },
    { key: "pdf",    label: "PDFs" },
    { key: "docs",   label: "Docs" },
    { key: "sheets", label: "Sheets" },
    { key: "other",  label: "Other" },
  ];

  const onPreview = (att: Attachment) => setPreviewAtt(att);

  const makeToggleHandler = (id: string) => (e: React.MouseEvent) => {
    handleToggle(id, e.shiftKey);
  };

  return (
    <>
      {previewAtt && <PreviewModal att={previewAtt} onClose={() => setPreviewAtt(null)} />}

      <div
        className="relative space-y-3"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && <DragOverlay info={dragInfo} />}

        <SummaryHeader attachments={attachments} />

        {/* Upload row */}
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors",
            isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/30",
          )}
        >
          {isUploading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                       : <Upload  className="size-4 shrink-0 text-muted-foreground" />}
          <span className="text-muted-foreground">{isUploading ? "Uploading…" : "Drop or paste anywhere · or"}</span>
          {!isUploading && <span className="text-primary">browse</span>}
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
            accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip" />
        </label>

        {showQueue && <UploadQueueTray files={queuedFiles} />}

        {successStrip && (
          <SuccessStrip key={successStrip.id} count={successStrip.count}
            onDismiss={() => setSuccessStrip(null)} />
        )}

        {failedUploads.length > 0 && (
          <FailureStrip files={failedUploads} onDismiss={() => setFailedUploads([])} />
        )}

        {/* Filter pills + New Folder */}
        {hasUploaded && (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
              {tabs.map((tab) => {
                const isActive = category === tab.key;
                const isZero   = tab.key !== "all" && counts[tab.key] === 0;
                return (
                  <button key={tab.key} type="button"
                    onClick={() => setCategory(isActive && tab.key !== "all" ? "all" : tab.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                      isZero && !isActive && "opacity-50",
                    )}
                  >
                    {tab.label}
                    <span className={cn("text-sm opacity-70", isActive && "opacity-90")}>{counts[tab.key]}</span>
                    {isActive && tab.key !== "all" && (
                      <span className="ml-0.5 opacity-70 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setCategory("all"); }}
                        aria-label="Clear filter">×</span>
                    )}
                  </button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-sm"
              onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}>
              <FolderPlus className="h-3.5 w-3.5" />New Folder
            </Button>
          </div>
        )}

        {/* Search + Sort */}
        {hasFiles && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input type="search" placeholder="Search files…" value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="size-desc">Size: largest</option>
              <option value="size-asc">Size: smallest</option>
            </select>
          </div>
        )}

        {/* New folder input */}
        {creatingFolder && (
          <div className="flex items-center gap-2 rounded-md border border-primary bg-card px-3 py-2">
            <Folder className="h-4 w-4 shrink-0 text-primary" />
            <input autoFocus placeholder="Folder name" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  void createFolder();
                if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            <Button variant="ghost" size="sm" className="h-7 px-2 text-sm text-primary hover:text-primary"
              onClick={() => void createFolder()} disabled={isSavingFolder || !newFolderName.trim()}>
              {isSavingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-sm"
              onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</Button>
          </div>
        )}

        {/* ── Bulk action bar / delete confirm ──────────────────────────── */}
        {selectionMode && !deleteConfirm && !bulkMoveOpen && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            visibleCount={visibleOrderedIds.length}
            allVisible={allVisibleSelected}
            onSelectAll={() => setSelectedIds(new Set(visibleOrderedIds))}
            onDeselectAll={() => setSelectedIds(new Set())}
            onDownload={handleBulkDownload}
            onMove={() => setBulkMoveOpen(true)}
            onDelete={() => setDeleteConfirm({ typed: "" })}
            onCancel={exitSelection}
            moreMenu={
              <MoreMenu
                selectedIds={selectedIds}
                attachments={attachments}
                apiBase={apiBase}
                onVisibilitySet={() => {
                  void queryClient.invalidateQueries({ queryKey: attachmentQueryKey });
                }}
              />
            }
          />
        )}
        {selectionMode && deleteConfirm && (
          <DeleteConfirmBar
            count={selectedIds.size}
            typed={deleteConfirm.typed}
            onTyped={(v) => setDeleteConfirm({ typed: v })}
            onConfirm={() => void handleBulkDelete()}
            onCancel={() => setDeleteConfirm(null)}
            pending={bulkOpPending}
          />
        )}
        {selectionMode && bulkMoveOpen && (
          <BulkMoveOverlay
            folders={folders}
            currentFolderId={null}
            pending={bulkOpPending}
            onMove={(folderId) => void handleBulkMove(folderId)}
            onCancel={() => setBulkMoveOpen(false)}
          />
        )}

        {/* ── File list ───────────────────────────────────────────────────── */}

        {isFilterMode ? (
          filteredFlat.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {(() => {
                const label = tabs.find((t) => t.key === category)?.label ?? "";
                if (query && category !== "all") return `No ${label} files match "${query}".`;
                if (query)                       return `No files match "${query}".`;
                return `No ${label} files.`;
              })()}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredFlat.map((att) => (
                <FileRow key={att.id} att={att} folders={folders} apiBase={apiBase}
                  onDeleted={refresh} onMoved={() => refresh()} onPreview={onPreview}
                  isJustAdded={justAddedIds.has(att.id)}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(att.id)}
                  onToggle={makeToggleHandler(att.id)} />
              ))}
            </div>
          )
        ) : !hasUploaded ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Upload className="h-7 w-7 text-muted-foreground" />
            <p className={DRAWER_VALUE}>No attachments yet</p>
            <p className={DRAWER_META}>Drop files anywhere in this panel to upload</p>
          </div>
        ) : (
          <div className="space-y-2">

            {/* ── JUST ADDED ─────────────────────────────────────────────── */}
            {sortedJustAdded.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className={DRAWER_SECTION_HEADING}>Just added</span>
                  <span className={DRAWER_META}>{justAddedScanned} of {sortedJustAdded.length} scanned</span>
                </div>
                <div className="space-y-1.5">
                  {sortedJustAdded.map((att) => (
                    <FileRow key={att.id} att={att} folders={folders} apiBase={apiBase}
                      onDeleted={refresh} onMoved={() => refresh()} onPreview={onPreview}
                      isJustAdded
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(att.id)}
                      onToggle={makeToggleHandler(att.id)} />
                  ))}
                </div>
                {(folders.length > 0 || uncategorizedEarlier.length > 0) && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className={DRAWER_SECTION_HEADING}>Earlier</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
              </>
            )}

            {/* ── Folders (earlier files only) ───────────────────────────── */}
            {folders.map((folder) => {
              const folderFiles = sortedList(earlier.filter((a) => a.folder_id === folder.id));
              const isExpanded  = expandedFolders.has(folder.id);
              const isRenaming  = renamingFolderId === folder.id;

              return (
                <div key={folder.id} className="rounded-lg border bg-card">
                  <div className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-muted/20"
                    onClick={() => !isRenaming && toggleFolder(folder.id)}>
                    <span className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    {isExpanded ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-primary" />}

                    {isRenaming ? (
                      <input autoFocus value={folderRenameVal}
                        onChange={(e) => setFolderRenameVal(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter")  void renameFolder(folder.id);
                          if (e.key === "Escape") { setRenamingFolderId(null); setFolderRenameVal(""); }
                        }}
                        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{folder.name}</span>
                    )}

                    <span className={cn("shrink-0", DRAWER_META)}>
                      {folderFiles.length} {folderFiles.length === 1 ? "file" : "files"}
                    </span>

                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {isRenaming ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-sm text-primary hover:text-primary"
                            onClick={() => void renameFolder(folder.id)} disabled={isSavingFolderRename}>
                            {isSavingFolderRename ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-sm"
                            onClick={() => { setRenamingFolderId(null); setFolderRenameVal(""); }}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => { setRenamingFolderId(folder.id); setFolderRenameVal(folder.name); }}
                            aria-label="Rename folder"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => void deleteFolder(folder.id)} aria-label="Delete folder"><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
                      {folderFiles.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">No files in this folder — drag files here or use the Move button</p>
                      ) : folderFiles.map((att) => (
                        <FileRow key={att.id} att={att} folders={folders} apiBase={apiBase}
                          onDeleted={refresh} onMoved={() => refresh()} onPreview={onPreview}
                          selectionMode={selectionMode}
                          isSelected={selectedIds.has(att.id)}
                          onToggle={makeToggleHandler(att.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Uncategorized earlier files ────────────────────────────── */}
            {sortedUncategorizedEarlier.length > 0 && (
              <div>
                {folders.length > 0 && (
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className={DRAWER_META}>Uncategorized</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="space-y-1.5">
                  {sortedUncategorizedEarlier.map((att) => (
                    <FileRow key={att.id} att={att} folders={folders} apiBase={apiBase}
                      onDeleted={refresh} onMoved={() => refresh()} onPreview={onPreview}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(att.id)}
                      onToggle={makeToggleHandler(att.id)} />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </>
  );
}
