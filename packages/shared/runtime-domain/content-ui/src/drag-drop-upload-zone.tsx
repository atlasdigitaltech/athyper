"use client";

/**
 * DragDropUploadZone — HTML5 drag-and-drop file upload zone.
 *
 * Data-agnostic: calls `onUpload(files)` with the selected File[] objects.
 * The caller is responsible for the actual upload (FormData → fetch).
 *
 * Features:
 *   - Drag-over highlight with visual feedback
 *   - Click-to-open file picker
 *   - File type filtering (accept prop, same format as <input accept>)
 *   - File size validation (maxSizeMb)
 *   - Multi-file support (disabled by default)
 *   - Per-file error reporting for oversized or wrong-type files
 */

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { UploadCloud, X, AlertCircle, FileText } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { formatBytes } from "@athyper/runtime-shared/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UploadFile {
  file: File;
  /** Client-side validation error, if any */
  error?: string;
}

export interface DragDropUploadZoneProps {
  /**
   * Called with validated files when the user drops or selects them.
   * Receives only files that pass type/size validation.
   * The caller uploads them via FormData / fetch.
   */
  onUpload: (files: File[]) => void | Promise<void>;
  /** HTML input accept string (e.g. ".pdf,image/*"). Default: all files. */
  accept?: string;
  /** Maximum file size in MB. Files above this are rejected. Default: 10 MB. */
  maxSizeMb?: number;
  /** Allow multiple files per selection. Default: false. */
  multiple?: boolean;
  /** Disable all interaction. */
  disabled?: boolean;
  /** Optional upload-in-progress state (renders a progress overlay). */
  isUploading?: boolean;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFile(file: File, accept: string | undefined, maxSizeMb: number): string | undefined {
  if (maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
    return `File exceeds ${maxSizeMb} MB limit (${formatBytes(file.size)})`;
  }
  if (accept) {
    const accepted = accept.split(",").map((s) => s.trim().toLowerCase());
    const ext  = "." + file.name.split(".").pop()!.toLowerCase();
    const mime = file.type.toLowerCase();
    const ok   = accepted.some((a) => {
      if (a.endsWith("/*")) return mime.startsWith(a.slice(0, -2));
      if (a.startsWith(".")) return ext === a;
      return mime === a;
    });
    if (!ok) return `File type not allowed (${file.type || ext})`;
  }
  return undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DragDropUploadZone({
  onUpload,
  accept,
  maxSizeMb = 10,
  multiple = false,
  disabled = false,
  isUploading = false,
  className,
}: DragDropUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (raw: FileList | File[]) => {
      const files = Array.from(raw);
      const selected = multiple ? files : files.slice(0, 1);

      const validated: UploadFile[] = selected.map((file) => ({
        file,
        error: validateFile(file, accept, maxSizeMb),
      }));

      setPendingFiles(validated);

      const valid = validated.filter((f) => !f.error).map((f) => f.file);
      if (valid.length > 0) {
        await onUpload(valid);
      }
    },
    [accept, maxSizeMb, multiple, onUpload],
  );

  // ── Drag handlers ──────────────────────────────────────────────

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0) {
        void processFiles(e.dataTransfer.files);
      }
    },
    [disabled, processFiles],
  );

  // ── Click handler ──────────────────────────────────────────────

  const onClick = useCallback(() => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        void processFiles(e.target.files);
        e.target.value = ""; // reset so same file can be re-selected
      }
    },
    [processFiles],
  );

  const removePending = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className={cn("flex flex-col gap-3", className)}>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          "cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragOver && !disabled
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          disabled && "cursor-not-allowed opacity-50",
          isUploading && "cursor-wait",
        )}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Uploading…</p>
          </div>
        ) : (
          <>
            <UploadCloud
              className={cn(
                "size-10 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground/50",
              )}
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragOver ? "Drop to upload" : "Drag & drop files here"}
              </p>
              <p className="text-xs text-muted-foreground">
                or <span className="text-primary underline-offset-2 hover:underline">click to browse</span>
                {accept && ` · ${accept}`}
                {maxSizeMb > 0 && ` · max ${maxSizeMb} MB`}
                {multiple && " · multiple files allowed"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={onInputChange}
        disabled={disabled || isUploading}
      />

      {/* Pending file list with validation feedback */}
      {pendingFiles.length > 0 && (
        <ul className="space-y-1.5">
          {pendingFiles.map((uf, idx) => (
            <li
              key={`${uf.file.name}-${idx}`}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                uf.error ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30",
              )}
            >
              {uf.error
                ? <AlertCircle className="size-4 shrink-0 text-destructive" />
                : <FileText    className="size-4 shrink-0 text-muted-foreground" />}

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{uf.file.name}</p>
                {uf.error
                  ? <p className="text-xs text-destructive">{uf.error}</p>
                  : <p className="text-xs text-muted-foreground">{formatBytes(uf.file.size)}</p>}
              </div>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removePending(idx); }}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Remove"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
