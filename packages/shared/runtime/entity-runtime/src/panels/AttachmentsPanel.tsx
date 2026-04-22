"use client";

import { useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Paperclip, Upload, Loader2, Pencil, X, FolderPlus,
  Folder, FolderOpen, ChevronRight, ChevronDown, MoveRight,
} from "lucide-react";
import { Skeleton, Button } from "@athyper/ui/primitives";

// ── CSRF ──────────────────────────────────────────────────────────────────────

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1] ?? "") : "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttachmentFolder {
  id:            string;
  name:          string;
  parent_id:     string | null;
  display_order: number;
  created_at:    string;
}

interface Attachment {
  id:              string;
  filename:        string;
  size_bytes:      number;
  content_type:    string;
  created_at:      string;
  created_by_name: string | null;
  folder_id:       string | null;
  download_url:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fileTypeIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "📊";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType.includes("zip") || contentType.includes("compress")) return "🗜";
  if (contentType.startsWith("text/")) return "📃";
  return "📎";
}

function splitFilename(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot < 1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AttachmentsPanelProps {
  entityCode: string;
  recordId:   string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FileRow({
  att,
  folders,
  apiBase,
  onDeleted,
  onMoved,
}: {
  att:      Attachment;
  folders:  AttachmentFolder[];
  apiBase:  string;
  onDeleted(): void;
  onMoved(folderId: string | null): void;
}) {
  const [isDeleting,  setIsDeleting]  = useState(false);
  const [renamingMode, setRenamingMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming,  setIsRenaming]  = useState(false);
  const [movingMode,  setMovingMode]  = useState(false);
  const [isMoving,    setIsMoving]    = useState(false);

  const { ext } = splitFilename(att.filename);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}`, {
        method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() },
      });
      onDeleted();
    } finally { setIsDeleting(false); }
  };

  const startRename = () => { setRenamingMode(true); setRenameValue(base); };
  const cancelRename = () => { setRenamingMode(false); setRenameValue(""); };
  const confirmRename = async () => {
    const { base: origBase } = splitFilename(att.filename);
    const newName = (renameValue.trim() || origBase) + ext;
    setIsRenaming(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ filename: newName }),
      });
      onDeleted(); // refresh
    } finally { setIsRenaming(false); setRenamingMode(false); setRenameValue(""); }
  };

  const handleMove = async (folderId: string | null) => {
    setIsMoving(true);
    try {
      await fetch(`${apiBase}/${encodeURIComponent(att.id)}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ folder_id: folderId }),
      });
      onMoved(folderId);
    } finally { setIsMoving(false); setMovingMode(false); }
  };

  return (
    <div className="flex items-start gap-3 rounded-md border bg-card px-4 py-3 transition-colors hover:bg-muted/20">
      <span className="mt-0.5 shrink-0 select-none text-lg" aria-hidden>
        {fileTypeIcon(att.content_type)}
      </span>

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
          <a
            href={att.download_url}
            download={att.filename}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium text-primary hover:underline"
          >
            {att.filename}
          </a>
        )}

        <p className="mt-0.5 text-xs text-muted-foreground">
          {att.created_by_name && (
            <>Uploaded By: <span className="font-medium">{att.created_by_name}</span> · </>
          )}
          Uploaded On: {formatDate(att.created_at)} · File Size: {formatBytes(att.size_bytes)}
        </p>

        {/* Move to folder selector */}
        {movingMode && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Move to:</span>
            <button
              onClick={() => void handleMove(null)}
              disabled={isMoving || att.folder_id === null}
              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
            >
              Uncategorized
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => void handleMove(f.id)}
                disabled={isMoving || att.folder_id === f.id}
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                {f.name}
              </button>
            ))}
            <button
              onClick={() => setMovingMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {renamingMode ? (
          <>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary"
              onClick={() => void confirmRename()}
              disabled={isRenaming}
            >
              {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
              onClick={cancelRename} disabled={isRenaming}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {folders.length > 0 && (
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setMovingMode((v) => !v)}
                aria-label="Move to folder"
              >
                {isMoving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <MoveRight className="h-3.5 w-3.5" />
                }
              </Button>
            )}
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={startRename}
              aria-label="Rename file"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              aria-label="Delete file"
            >
              {isDeleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <X className="h-3.5 w-3.5" />
              }
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AttachmentsPanel({ entityCode, recordId }: AttachmentsPanelProps) {
  const queryClient  = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading,     setIsUploading]     = useState(false);
  const [uploadError,     setUploadError]     = useState<string | null>(null);
  const [isDragOver,      setIsDragOver]      = useState(false);

  // Folder create state
  const [creatingFolder,  setCreatingFolder]  = useState(false);
  const [newFolderName,   setNewFolderName]   = useState("");
  const [isSavingFolder,  setIsSavingFolder]  = useState(false);

  // Folder rename state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameVal,  setFolderRenameVal]  = useState("");
  const [isSavingFolderRename, setIsSavingFolderRename] = useState(false);

  // Which folders are expanded
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const apiBase     = `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/attachments`;
  const folderBase  = `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/folders`;

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: attachments = [], isLoading: loadingFiles } = useQuery<Attachment[]>({
    queryKey: ["attachments", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(apiBase, { signal });
      return res.ok ? (res.json() as Promise<Attachment[]>) : [];
    },
    staleTime: 30_000,
  });

  const { data: folders = [], isLoading: loadingFolders } = useQuery<AttachmentFolder[]>({
    queryKey: ["attachment-folders", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(folderBase, { signal });
      return res.ok ? (res.json() as Promise<AttachmentFolder[]>) : [];
    },
    staleTime: 30_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["attachments", entityCode, recordId] });
    void queryClient.invalidateQueries({ queryKey: ["attachment-folders", entityCode, recordId] });
  }, [queryClient, entityCode, recordId]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    const csrf = getCsrfToken();
    try {
      await Promise.all(Array.from(files).map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(apiBase, {
          method: "POST", body: fd, headers: { "X-CSRF-Token": csrf },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Upload failed (${res.status})`);
        }
      }));
      void queryClient.invalidateQueries({ queryKey: ["attachments", entityCode, recordId] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [apiBase, entityCode, recordId, queryClient]);

  // ── Create folder ──────────────────────────────────────────────────────────

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      const res = await fetch(folderBase, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const folder = await res.json() as AttachmentFolder;
        setExpandedFolders((prev) => new Set(prev).add(folder.id));
        void queryClient.invalidateQueries({ queryKey: ["attachment-folders", entityCode, recordId] });
        setCreatingFolder(false);
        setNewFolderName("");
      }
    } finally { setIsSavingFolder(false); }
  };

  // ── Rename folder ──────────────────────────────────────────────────────────

  const renameFolder = async (folderId: string) => {
    const name = folderRenameVal.trim();
    if (!name) return;
    setIsSavingFolderRename(true);
    try {
      await fetch(`${folderBase}/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ name }),
      });
      void queryClient.invalidateQueries({ queryKey: ["attachment-folders", entityCode, recordId] });
      setRenamingFolderId(null);
      setFolderRenameVal("");
    } finally { setIsSavingFolderRename(false); }
  };

  // ── Delete folder ──────────────────────────────────────────────────────────

  const deleteFolder = async (folderId: string) => {
    await fetch(`${folderBase}/${encodeURIComponent(folderId)}`, {
      method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() },
    });
    refresh();
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loadingFiles || loadingFolders) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
      </div>
    );
  }

  const uncategorized = attachments.filter((a) => !a.folder_id);
  const totalCount    = attachments.length;

  return (
    <div className="space-y-4">

      {/* ── Upload zone ─────────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload attachments"
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary hover:bg-muted/20",
        ].join(" ")}
      >
        {isUploading
          ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : <Upload className="h-5 w-5 text-muted-foreground" />
        }
        <p className="text-sm text-muted-foreground">
          {isUploading ? "Uploading…" : "Click or drag files to upload"}
        </p>
      </div>

      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
      />

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Files{totalCount > 0 ? ` (${totalCount})` : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Folder
        </Button>
      </div>

      {/* ── New folder inline input ──────────────────────────────────────────── */}
      {creatingFolder && (
        <div className="flex items-center gap-2 rounded-md border border-primary bg-card px-3 py-2">
          <Folder className="h-4 w-4 shrink-0 text-primary" />
          <input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  void createFolder();
              if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button
            variant="ghost" size="sm"
            className="h-6 px-2 text-xs text-primary hover:text-primary"
            onClick={() => void createFolder()}
            disabled={isSavingFolder || !newFolderName.trim()}
          >
            {isSavingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
          </Button>
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {totalCount === 0 && folders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Paperclip className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No attachments yet</p>
          <p className="text-xs text-muted-foreground">Upload files or create folders above</p>
        </div>
      ) : (
        <div className="space-y-2">

          {/* ── Folder rows ─────────────────────────────────────────────────── */}
          {folders.map((folder) => {
            const folderFiles = attachments.filter((a) => a.folder_id === folder.id);
            const isExpanded  = expandedFolders.has(folder.id);
            const isRenaming  = renamingFolderId === folder.id;

            return (
              <div key={folder.id} className="rounded-lg border bg-card">
                {/* Folder header */}
                <div
                  className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-muted/20"
                  onClick={() => !isRenaming && toggleFolder(folder.id)}
                >
                  <span className="shrink-0 text-muted-foreground">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />
                    }
                  </span>
                  {isExpanded
                    ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                    : <Folder     className="h-4 w-4 shrink-0 text-primary" />
                  }

                  {isRenaming ? (
                    <input
                      autoFocus
                      value={folderRenameVal}
                      onChange={(e) => setFolderRenameVal(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter")  void renameFolder(folder.id);
                        if (e.key === "Escape") { setRenamingFolderId(null); setFolderRenameVal(""); }
                      }}
                      className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {folder.name}
                    </span>
                  )}

                  <span className="shrink-0 text-xs text-muted-foreground">
                    {folderFiles.length} {folderFiles.length === 1 ? "file" : "files"}
                  </span>

                  {/* Folder actions */}
                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isRenaming ? (
                      <>
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 px-2 text-xs text-primary hover:text-primary"
                          onClick={() => void renameFolder(folder.id)}
                          disabled={isSavingFolderRename}
                        >
                          {isSavingFolderRename ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-6 px-2 text-xs"
                          onClick={() => { setRenamingFolderId(null); setFolderRenameVal(""); }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => { setRenamingFolderId(folder.id); setFolderRenameVal(folder.name); }}
                          aria-label="Rename folder"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => void deleteFolder(folder.id)}
                          aria-label="Delete folder"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Folder contents */}
                {isExpanded && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-2">
                    {folderFiles.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No files in this folder — drag files here or use the Move button
                      </p>
                    ) : (
                      folderFiles.map((att) => (
                        <FileRow
                          key={att.id}
                          att={att}
                          folders={folders}
                          apiBase={apiBase}
                          onDeleted={refresh}
                          onMoved={refresh}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Uncategorized files ────────────────────────────────────────── */}
          {uncategorized.length > 0 && (
            <div>
              {folders.length > 0 && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">Uncategorized</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="space-y-2">
                {uncategorized.map((att) => (
                  <FileRow
                    key={att.id}
                    att={att}
                    folders={folders}
                    apiBase={apiBase}
                    onDeleted={refresh}
                    onMoved={refresh}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
