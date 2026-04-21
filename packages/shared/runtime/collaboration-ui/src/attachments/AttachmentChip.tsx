"use client";

/**
 * AttachmentChip — compact file chip for staged (pre-submit) and rendered
 * (post-submit) comment attachments.
 *
 * Staged mode:  shows upload progress, error state, remove button.
 * Rendered mode: shows icon, filename, size, download link.
 */

import { X, Paperclip, FileText, Image, FileSpreadsheet, File, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { StagedAttachment } from "../hooks/attachments";
import type { CommentAttachmentItem } from "../hooks/attachments";

// ── File icon resolver ────────────────────────────────────────────────────────

function FileIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith("image/"))
    return <Image className={cn("shrink-0", className)} />;
  if (contentType === "application/pdf")
    return <FileText className={cn("shrink-0 text-destructive", className)} />;
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("csv"))
    return <FileSpreadsheet className={cn("shrink-0 text-success", className)} />;
  return <File className={cn("shrink-0", className)} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Staged chip ───────────────────────────────────────────────────────────────

interface StagedChipProps {
  item:     StagedAttachment;
  onRemove: (key: string) => void;
  onRetry:  (key: string) => void;
}

export function StagedAttachmentChip({ item, onRemove, onRetry }: StagedChipProps) {
  const isError    = item.status === "error";
  const isUploading = item.status === "uploading";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
        isError
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-muted/40 text-foreground",
      )}
    >
      {isError ? (
        <AlertCircle className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <FileIcon contentType={item.file.type} className="size-3.5 text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-none">{item.file.name}</p>
        {isUploading && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {isError && (
          <p className="mt-0.5 truncate text-[10px] leading-none text-destructive/80">
            {item.errorMessage ?? "Upload failed"}
          </p>
        )}
        {item.status === "done" && (
          <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">
            {formatBytes(item.file.size)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isError && (
          <button
            type="button"
            onClick={() => onRetry(item.key)}
            className="rounded p-0.5 hover:bg-destructive/10"
            title="Retry upload"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.key)}
          className="rounded p-0.5 hover:bg-accent"
          title="Remove"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ── Rendered chip (post-submit) ───────────────────────────────────────────────

interface RenderedChipProps {
  item: CommentAttachmentItem;
}

function isImageType(ct: string) {
  return ct.startsWith("image/");
}

export function RenderedAttachmentChip({ item }: RenderedChipProps) {
  return (
    <a
      href={item.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs",
        "transition-colors hover:bg-muted/60 hover:border-border/80 no-underline text-foreground",
      )}
      download={item.fileName}
    >
      <FileIcon contentType={item.contentType} className="size-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-none">{item.fileName}</p>
        <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">
          {formatBytes(item.sizeBytes)} · {item.contentType.split("/")[1]?.toUpperCase() ?? "FILE"}
        </p>
      </div>
      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

// ── Thumbnail chip for images ─────────────────────────────────────────────────

export function RenderedImageChip({ item }: RenderedChipProps) {
  if (!isImageType(item.contentType)) return <RenderedAttachmentChip item={item} />;

  return (
    <a
      href={item.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-border"
      title={item.fileName}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.downloadUrl}
        alt={item.fileName}
        className="h-24 w-36 object-cover transition-opacity group-hover:opacity-90"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
        <p className="truncate text-[10px] text-white">{item.fileName}</p>
      </div>
    </a>
  );
}
