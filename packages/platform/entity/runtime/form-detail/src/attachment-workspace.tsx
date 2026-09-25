"use client";
import { writeRecordLocation } from "./record/write-record-location";
import { uploadRecordAttachment } from "./upload-record-attachment";
import { useAttachmentBrowse } from "./use-attachment-browse";
import { useAttachmentStatusPolling } from "./use-attachment-status-polling";
import { downloadAttachment } from "./attachment-download";
import { fileLabel } from "./collaboration-read-models";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import {
  CollaborationPresentationContext,
  CollaborationVisibilityContext,
} from "./collaboration-visibility";
import {
  CollaborationActions,
  collaborationTime,
  collaborationFileSize,
} from "./collaboration-actions";
import { AttachmentPreview } from "./attachment-preview";
import { FileAction } from "./file-action";
import {
  useFileSearch,
  FileSearchInput,
  FileSearchResults,
} from "./file-search";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { ApiTransportError } from "@athyper/platform-api-client";
import {
  useApiClient,
  useToasts,
} from "@athyper/platform-shell-app-foundation";
import {
  FileTextIcon,
  EyeIcon,
  DownloadIcon,
  FolderPlusIcon,
  FolderInputIcon,
  PencilIcon,
  ArchiveIcon,
  UploadIcon,
  LinkIcon,
  UnlinkIcon,
  TagIcon,
  TrashIcon,
  SlidersHorizontalIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
} from "@athyper/platform-icons";
import {
  validateUploadFile,
} from "@athyper/platform-communications-collaboration-ui";
import {
  FilterChipGroup,
  PanelEmptyState,
  Button,
  Card,
  Dialog,
  DialogContent,
  Tooltip,
} from "@athyper/platform-ui";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { EmptySectionState, display, message } from "./section-primitives";
import {
  attachmentUnlink,
  attachmentRename,
  attachmentCategory,
  attachmentFolder,
  attachmentArchiveOutcome,
  attachmentArchive,
  attachmentBrowse,
} from "./collaboration-operations";

export function AttachmentUploader({
  capability,
  entityCode,
  recordId,
  knownItems,
  canVersion,
  onChanged,
}: {
  readonly capability?: EntityRuntimeSectionResource["capability"];
  readonly entityCode: string;
  readonly recordId: string;
  readonly knownItems: readonly Readonly<Record<string, unknown>>[];
  readonly canVersion: boolean;
  readonly onChanged: () => void;
}) {
  const { push: notify } = useToasts();
  const client = useApiClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const uploadsAllowed = capability?.maxFileBytes !== 0;
  const [queue, setQueue] = useState<
    readonly {
      readonly attachmentId: string;
      readonly file: File;
      readonly contentType: string;
      readonly parentAttachmentId?: string;
      readonly expectedSeriesVersion?: number;
      readonly state:
        | "queued"
        | "uploading"
        | "finalizing"
        | "processing"
        | "ready"
        | "failed";
      readonly progress?: number;
      readonly error?: string;
      readonly retryable?: boolean;
    }[]
  >([]);
  const [duplicates, setDuplicates] = useState<
    readonly {
      readonly file: File;
      readonly existing: Readonly<Record<string, unknown>>;
    }[]
  >([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const uploadControllers = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      for (const controller of uploadControllers.current.values())
        controller.abort();
    },
    [],
  );
  const retry = useRef<
    readonly {
      readonly attachmentId: string;
      readonly file: File;
      readonly contentType: string;
      readonly parentAttachmentId?: string;
      readonly expectedSeriesVersion?: number;
    }[]
  >([]);
  async function upload(attempt: {
    readonly attachmentId: string;
    readonly file: File;
    readonly contentType: string;
    readonly parentAttachmentId?: string;
    readonly expectedSeriesVersion?: number;
  }) {
    setBusy(true);
    setQueue((items) =>
      items.map((item) =>
        item.attachmentId === attempt.attachmentId
          ? { ...item, state: "uploading" }
          : item,
      ),
    );
    const controller = new AbortController();
    uploadControllers.current.set(attempt.attachmentId, controller);
    try {
      await uploadRecordAttachment(client, {
        ...attempt, entityType: entityCode, entityId: recordId,
        signal: controller.signal,
        retry: retry.current.some(item => item.attachmentId === attempt.attachmentId),
        onFinalizing: () =>
          setQueue((items) =>
            items.map((item) =>
              item.attachmentId === attempt.attachmentId
                ? { ...item, state: "finalizing" }
                : item,
            ),
          ),
      });
      uploadControllers.current.delete(attempt.attachmentId);
      retry.current = retry.current.filter(
        (item) => item.attachmentId !== attempt.attachmentId,
      );
      setQueue((items) =>
        items.map((item) =>
          item.attachmentId === attempt.attachmentId
            ? { ...item, state: "processing" }
            : item,
        ),
      );
      onChanged();
      return true;
    } catch (cause) {
      uploadControllers.current.delete(attempt.attachmentId);
      if (
        controller.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError") ||
        (cause instanceof Error && cause.name === "AbortError")
      ) {
        retry.current = retry.current.filter(
          (item) => item.attachmentId !== attempt.attachmentId,
        );
        // The server may have accepted finalization just before abort. Refresh
        // the authoritative section, but do not show a deliberate cancel as a
        // failed, retryable upload.
        setQueue((items) =>
          items.filter((item) => item.attachmentId !== attempt.attachmentId),
        );
        onChanged();
        return false;
      }
      const retryable = !(
        cause instanceof ApiTransportError && cause.status === 422
      );
      retry.current = [
        ...retry.current.filter(
          (item) => item.attachmentId !== attempt.attachmentId,
        ),
        ...(retryable ? [attempt] : []),
      ];
      setQueue((items) =>
        items.map((item) =>
          item.attachmentId === attempt.attachmentId
            ? { ...item, state: "failed", error: message(cause), retryable }
            : item,
        ),
      );
      setError(
        `${message(cause)}${retryable ? " Retry uses the same upload reservation." : ""}`,
      );
      return false;
    }
  }
  const refreshRef = useRef(onChanged);
  refreshRef.current = onChanged;
  const readySince = useRef(new Map<string, number>());
  const activeBatches = useRef(0);
  const admittingFiles = useRef(false);
  useEffect(() => {
    const processing = queue.filter((item) => item.state === "processing");
    if (!processing.length) return;
    const ready = new Set(
      processing
        .filter((item) =>
          knownItems.some(
            (row) =>
              row.id === item.attachmentId && row.processingStatus === "active",
          ),
        )
        .map((item) => item.attachmentId),
    );
    if (ready.size)
      setQueue((current) =>
        current.map((item) =>
          ready.has(item.attachmentId) ? { ...item, state: "ready" } : item,
        ),
      );
  }, [queue, knownItems]);
  useEffect(() => {
    const ready = queue.filter(
      (item) =>
        item.state === "ready" &&
        knownItems.some(
          (row) =>
            row.id === item.attachmentId && row.processingStatus === "active",
        ),
    );
    if (!ready.length) return;
    const now = Date.now();
    for (const item of ready)
      if (!readySince.current.has(item.attachmentId))
        readySince.current.set(item.attachmentId, now);
    const timer = window.setTimeout(
      () => {
        const completed = new Set(
          ready
            .filter(
              (item) =>
                Date.now() - readySince.current.get(item.attachmentId)! >= 2000,
            )
            .map((item) => item.attachmentId),
        );
        setQueue((current) =>
          current.filter((item) => !completed.has(item.attachmentId)),
        );
        for (const id of completed) readySince.current.delete(id);
      },
      Math.max(
        0,
        Math.min(
          ...ready.map(
            (item) => 2000 - (now - readySince.current.get(item.attachmentId)!),
          ),
        ),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [queue, knownItems]);
  const runBatch = async (attempts: typeof retry.current) => {
    activeBatches.current++;
    setBusy(true);
    const succeeded: (typeof attempts)[number][] = [];
    try {
      for (const attempt of attempts)
        if (await upload(attempt)) succeeded.push(attempt);
    } finally {
      activeBatches.current--;
      setBusy(activeBatches.current > 0);
    }
    if (succeeded.length)
      notify({
        tone: "success",
        title:
          succeeded.length === 1
            ? `“${succeeded[0]!.file.name}” uploaded`
            : `${succeeded.length} files uploaded`,
        ...(succeeded.length < attempts.length
          ? { detail: "Some uploads failed. Review the upload queue." }
          : {}),
        dedupeKey: `upload:${succeeded.map((item) => item.attachmentId).join(",")}`,
      });
  };
  const enqueue = (
    files: readonly File[],
    versions = new Map<File, Readonly<Record<string, unknown>>>(),
  ) => {
    const attempts = files.map((file) => {
      const version = versions.get(file);
      return {
        attachmentId: crypto.randomUUID(),
        file,
        contentType: file.type || "application/octet-stream",
        ...(version
          ? {
              parentAttachmentId: String(version.id),
              expectedSeriesVersion: Number(version.version),
            }
          : {}),
      };
    });
    setQueue((items) => [
      ...items,
      ...attempts.map((item) => ({ ...item, state: "queued" as const })),
    ]);
    void runBatch(attempts);
  };
  const addFiles = async (files: readonly File[]) => {
    if (!files.length) return;
    if (!uploadsAllowed) {
      setError("Uploads are not permitted for this record.");
      return;
    }
    if (admittingFiles.current) {
      setError(
        "Wait for the selected files to be checked before adding more files.",
      );
      return;
    }
    admittingFiles.current = true;
    try {
    const maxBatch = capability?.maxBatchCount ?? 10;
    const chosen = files.slice(0, maxBatch);
    const rejected: string[] = files.length > maxBatch
      ? [`Only the first ${maxBatch} files can be added at once.`]
      : [];
    const accepted: File[] = [];
    for (const file of chosen) {
      try {
        validateUploadFile(file, capability ?? {});
        accepted.push(file);
      } catch (cause) {
        rejected.push(`${file.name}: ${message(cause)}`);
      }
    }
    if (rejected.length) setError(rejected.join(" "));
    if (!accepted.length) return;
    const valid = accepted,
      pending: { file: File; existing: Readonly<Record<string, unknown>> }[] =
        [],
      separate: File[] = [];
    const canBrowse = Boolean(
      capability?.actions.some((action) => action.key === "search"),
    );
    for (const file of valid) {
      let existing = knownItems.find(
        (item) => item.fileName === file.name || item.displayName === file.name,
      );
      if (!existing && canVersion && canBrowse) {
        try {
          const result = await client.request(attachmentBrowse, {
            body: {
              entityType: entityCode,
              entityId: recordId,
              name: file.name,
              exactName: true,
            },
          });
          existing = result.items[0];
        } catch (cause) {
          rejected.push(`Could not check whether “${file.name}” already exists: ${message(cause)}`);
          continue;
        }
      }
      if (!existing && canVersion && !canBrowse) {
        rejected.push(`${file.name}: The server cannot check duplicate file names for this record. Refresh or ask an administrator to enable file search before uploading.`);
        continue;
      }
      if (existing && canVersion) pending.push({ file, existing });
      else separate.push(file);
    }
    if (separate.length) enqueue(separate);
    if (pending.length) setDuplicates((current) => [...current, ...pending]);
    setError(rejected.length ? rejected.join(" ") : undefined);
    } finally { admittingFiles.current = false; }
  };
  const chooseDuplicate = (
    duplicate: {
      readonly file: File;
      readonly existing: Readonly<Record<string, unknown>>;
    },
    asVersion: boolean,
  ) => {
    setDuplicates((current) => current.filter((item) => item !== duplicate));
    enqueue(
      [duplicate.file],
      asVersion ? new Map([[duplicate.file, duplicate.existing]]) : undefined,
    );
  };
  const retryFailed = () => {
    void runBatch([...retry.current]);
  };
  return (
    <Card
      className="a-attachment-uploader"
      role="region"
      aria-label="File upload drop zone"
      aria-busy={busy}
      data-dragging={dragging || undefined}
      tabIndex={0}
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          if (!uploadsAllowed) return;
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          if (!uploadsAllowed) {
            event.dataTransfer.dropEffect = "none";
            return;
          }
          event.dataTransfer.dropEffect = busy ? "none" : "copy";
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!uploadsAllowed) {
          setError("Uploads are not permitted for this record.");
          return;
        }
        addFiles(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          if (!uploadsAllowed) {
            setError("Uploads are not permitted for this record.");
            return;
          }
          addFiles(files);
        }
      }}
    >
      <div className="a-attachment-uploader__target">
        <span className="a-attachment-uploader__icon">
          <UploadIcon size={22} aria-hidden="true" />
        </span>
        <div className="a-attachment-uploader__prompt">
          <strong>
            {!uploadsAllowed
              ? "Uploads are not permitted"
              : dragging
              ? busy
                ? "Upload in progress"
                : "Drop files to upload"
              : "Drag and drop files here"}
          </strong>
          {uploadsAllowed ? <span>
            or{" "}
            <label className="a-attachment-uploader__drop">
              browse files
              <input
                aria-label="Upload files"
                type="file"
                accept={capability?.allowedContentTypes?.join(",")}
                multiple
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = "";
                  addFiles(files);
                }}
              />
            </label>
          </span> : null}
        </div>
      </div>
      <div className="a-attachment-uploader__guidance">
        <span>
          Up to {capability?.maxBatchCount ?? 10} files · scanned automatically
        </span>
        <details className="a-upload-help">
          <summary>File requirements</summary>
          <p>
            {capability?.allowedContentTypes?.length
              ? `Allowed types: ${capability.allowedContentTypes.map((type) => ({ "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG" })[type] ?? type).join(", ")}.`
              : "Use the file types enabled for this record."}
            {capability?.maxFileBytes === 0
              ? " Uploads are not permitted for this record."
              : capability?.maxFileBytes !== undefined
              ? ` Maximum size: ${collaborationFileSize(capability.maxFileBytes)} per file.`
              : ""}{" "}
            {uploadsAllowed ? "You can also paste files into this area." : ""}
          </p>
        </details>
      </div>
      {duplicates.length ? (
        <section
          className="a-attachment-uploader__duplicates"
          aria-label="Duplicate file choices"
        >
          <h3>Choose how to upload</h3>
          {duplicates.map((duplicate) => (
            <div key={`${duplicate.file.name}-${duplicate.file.lastModified}`}>
              <p>
                <strong>{duplicate.file.name}</strong> already exists on this
                record.
              </p>
              <button
                type="button"
                onClick={() => chooseDuplicate(duplicate, true)}
              >
                Upload as new version
              </button>
              <button
                type="button"
                onClick={() => chooseDuplicate(duplicate, false)}
              >
                Keep as separate file
              </button>
              <button
                type="button"
                onClick={() =>
                  setDuplicates((current) =>
                    current.filter((value) => value !== duplicate),
                  )
                }
              >
                Cancel upload
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {queue.length ? (
        <ul aria-label="Upload queue">
          {queue.map((item) => (
            <li key={item.attachmentId}>
              <strong>{item.file.name}</strong>
              {" — "}
              <span role={item.state === "failed" ? "alert" : "status"}>
                {item.state === "uploading"
                  ? "Uploading…"
                  : item.state === "finalizing"
                    ? "Uploaded · Finalizing"
                    : item.state === "processing"
                      ? "Uploaded · Processing"
                      : item.state}
              </span>
              {item.state === "uploading" ? (
                <progress aria-label={`Uploading ${item.file.name}`} max={1} />
              ) : item.state === "finalizing" ? (
                <progress aria-label={`Finalizing ${item.file.name}`} />
              ) : null}
              {["uploading", "finalizing"].includes(item.state) ? (
                <button
                  type="button"
                  onClick={() =>
                    uploadControllers.current.get(item.attachmentId)?.abort()
                  }
                >
                  Cancel upload
                </button>
              ) : null}
              {item.error ? `: ${item.error}` : ""}
              {item.state === "failed" &&
              item.retryable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const attempt = retry.current.find(
                      (value) => value.attachmentId === item.attachmentId,
                    );
                    if (attempt) void runBatch([attempt]);
                  }}
                >
                  Retry this file
                </button>
              ) : null}
              {item.state === "failed" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    retry.current = retry.current.filter(
                      (attempt) => attempt.attachmentId !== item.attachmentId,
                    );
                    setQueue((current) =>
                      current.filter(
                        (value) => value.attachmentId !== item.attachmentId,
                      ),
                    );
                    setError(undefined);
                  }}
                >
                  Remove from queue
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {queue.some(item => item.state === "failed" && item.retryable) && !busy ? (
        <button type="button" onClick={retryFailed}>
          Retry failed uploads
        </button>
      ) : null}
    </Card>
  );
}
export function AttachmentCollection({
  uploadPolicy,
  entityCode,
  recordId,
  items,
  folders,
  workspaceRevision,
  canPreview,
  canSearch,
  canDownload,
  canUnlink,
  canArchive,
  canRename,
  canVersion,
  canCategory,
  canFolder,
  onChanged,
  upload,
  loadMore,
}: {
  readonly uploadPolicy?: EntityRuntimeSectionResource["capability"];
  readonly upload?: ReactNode;
  readonly loadMore?: ReactNode;
  readonly entityCode: string;
  readonly recordId: string;
  readonly folders: readonly Readonly<Record<string, unknown>>[];
  readonly workspaceRevision: string;
  readonly canPreview: boolean;
  readonly canSearch: boolean;
  readonly canDownload: boolean;
  readonly canUnlink: boolean;
  readonly canArchive: boolean;
  readonly canRename: boolean;
  readonly canVersion: boolean;
  readonly canCategory: boolean;
  readonly canFolder: boolean;
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly onChanged: () => void;
}) {
  const fullView = useContext(CollaborationPresentationContext) === "content";
  const panelVisible = useContext(CollaborationVisibilityContext);
  const canOpenPreview = canPreview && panelVisible;
  const [folderFilter, setFolderFilter] = useState(""),
    [categoryFilter, setCategoryFilter] = useState("");
  const search = useFileSearch(
    entityCode,
    recordId,
    canSearch,
    folderFilter,
    categoryFilter,
  );
  const contentSearch = search.scope === "contents";
  const { push: notify } = useToasts();
  const notifySuccess = (title: string) => notify({ tone: "success", title });
  const [filtersOpen, setFiltersOpen] = useState(false),
    [selectedName, setSelectedName] = useState("");
  const workspaceRef = useRef<HTMLElement>(null),
    previewRef = useRef<HTMLElement>(null),
    previewOpener = useRef<HTMLElement | null>(null);
  const previewScroll = useRef<
    { element: Element | null; top: number; page: number } | undefined
  >(undefined);
  const browseScroll = useRef<
    { element: Element | null; top: number; page: number } | undefined
  >(undefined);
  const rememberBrowse = () => {
    const element =
      workspaceRef.current?.closest(".a-collaboration-panel__body") ?? null;
    browseScroll.current = {
      element,
      top: element?.scrollTop ?? 0,
      page: window.scrollY,
    };
  };
  const clearPreviewLink = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("file")) {
      url.searchParams.delete("file");
      writeRecordLocation(url, "replace");
    }
  };
  const appliedPreviewLink = useRef<string | undefined>(undefined);
  const clearSearch = () => {
    clearPreviewLink();
    search.reset();
    search.setScope("names");
    setSelected(undefined);
    requestAnimationFrame(() => {
      const saved = browseScroll.current;
      if (saved) {
        if (saved.element) saved.element.scrollTop = saved.top;
        window.scrollTo({ top: saved.page, behavior: "instant" });
      }
    });
  };
  const openPreview = (id: string, name: string) => {
    if (!canOpenPreview) return;
    previewOpener.current = document.activeElement as HTMLElement;
    const element =
      workspaceRef.current?.closest(".a-collaboration-panel__body") ?? null;
    previewScroll.current = {
      element,
      top: element?.scrollTop ?? 0,
      page: window.scrollY,
    };
    const link = new URL(window.location.href);
    link.searchParams.set("file", id);
    // Preview is transient workspace state, not a navigable history trail.
    writeRecordLocation(link, "replace");
    setSelected(id);
    setSelectedName(name);
    requestAnimationFrame(() =>
      previewRef.current?.focus({
        preventScroll:
          fullView && (workspaceRef.current?.clientWidth ?? 0) >= 680,
      }),
    );
  };
  const closePreview = () => {
    clearPreviewLink();
    setSelected(undefined);
    requestAnimationFrame(() => {
      if (previewOpener.current?.isConnected)
        previewOpener.current.focus({ preventScroll: true });
      const saved = previewScroll.current;
      if (saved) {
        if (saved.element) saved.element.scrollTop = saved.top;
        window.scrollTo({ top: saved.page, behavior: "instant" });
      }
    });
  };

  const [dialog, setDialog] = useState<
    | { kind: "folder" }
    | { kind: "rename" | "move"; target: Readonly<Record<string, unknown>> }
    | { kind: "category"; target: string }
  >();
  const folderOpen = dialog?.kind === "folder";
  const moveTarget = dialog?.kind === "move" ? dialog.target : undefined;
  const renameTarget = dialog?.kind === "rename" ? dialog.target : undefined;
  const categoryTarget = dialog?.kind === "category" ? dialog.target : undefined;
  const dialogPendingId = !dialog ? "" : dialog.kind === "folder" ? "new-folder"
    : dialog.kind === "category" ? dialog.target : String(dialog.target.id);
  const [moveValue, setMoveValue] = useState(""),
    [categoryValue, setCategoryValue] = useState<"general" | "evidence">(
      "general",
    );
  const client = useApiClient(),
    [errors, setErrors] = useState<
      Readonly<Record<string, string | undefined>>
    >({}),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<string>(),
    [history, setHistory] = useState<ReadonlySet<string>>(new Set()),
    [newFolderName, setNewFolderName] = useState(""),
    [renameValue, setRenameValue] = useState(""),
    [confirm, setConfirm] = useState<{
      readonly kind: "unlink" | "archive" | "folder";
      readonly item: Readonly<Record<string, unknown>>;
      readonly detail: string;
    }>(),
    versionTarget = useRef<Readonly<Record<string, unknown>> | undefined>(
      undefined,
    ),
    versionInput = useRef<HTMLInputElement>(null),
    folderCommands = useRef(
      new Map<
        string,
        {
          readonly folderId: string | null;
          readonly idempotencyKey: string;
          readonly expectedRevision: number;
        }
      >(),
    );
  const browse = useAttachmentBrowse(client, entityCode, recordId, canSearch,
    filter, folderFilter, categoryFilter, items);
  const browseItems = browse.items;
  const browseHasMore = Boolean(browse.cursor);
  // Retain the key while an action may be retried after a transport failure.
  // Reusing it lets the relay and lifecycle treat the retry as the same intent;
  // a fresh key is created only after a confirmed completion or conflict.
  const attachmentCommands = useRef(new Map<string, string>());
  const commandKey = (action: string, id: string, value = "") =>
    `${action}:${id}:${value}`;
  const idempotencyKeyFor = (key: string) => {
    const existing = attachmentCommands.current.get(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    attachmentCommands.current.set(key, created);
    return created;
  };
  const completeCommand = (key: string) =>
    attachmentCommands.current.delete(key);
  const errorScope = folderOpen
    ? "new-folder"
    : renameTarget
      ? `rename:${renameTarget.id}`
      : moveTarget
        ? `move:${moveTarget.id}`
        : categoryTarget
          ? `category:${categoryTarget}`
          : confirm
            ? `${confirm.kind}:${confirm.item.id}`
            : "workspace";
  const [historyRows, setHistoryRows] = useState<Record<string, unknown[]>>({});
  useEffect(() => {
    const controller = new AbortController();
    setHistoryRows({});
    for (const id of history) {
      void client.request(attachmentBrowse, {
        signal: controller.signal,
        body: { entityType: entityCode, entityId: recordId, attachmentId: id, includeHistory: true },
      }).then(result => {
        if (controller.signal.aborted) return;
        const versions = result.items[0]?.versionHistory;
        if (Array.isArray(versions)) setHistoryRows(current => ({ ...current, [id]: versions }));
      }).catch(() => {
        if (!controller.signal.aborted) setHistoryErrors(current => ({ ...current, [id]: "Version history could not be refreshed. Close and reopen history to retry." }));
      });
    }
    return () => controller.abort();
  }, [items, client, entityCode, recordId]);
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const historyPending = useRef(new Set<string>());
  const toggleHistory = (id: string) =>
    setHistory((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const openHistory = async (item: Readonly<Record<string, unknown>>) => {
    const id = String(item.id);
    toggleHistory(id);
    if (history.has(id) || Array.isArray(item.versionHistory) || historyPending.current.has(id)) return;
    historyPending.current.add(id);
    setHistoryErrors(current => ({...current,[id]:""}));
    try {
      const result = await client.request(attachmentBrowse, {
        body: {entityType:entityCode,entityId:recordId,attachmentId:id,includeHistory:true},
      });
      const versions = result.items[0]?.versionHistory;
      if (!Array.isArray(versions)) throw new Error("Version history is unavailable.");
      setHistoryRows(current => ({...current,[id]:versions}));
    } catch {
      setHistoryErrors(current => ({...current,[id]:"Version history could not be loaded. Close and reopen history to retry."}));
    } finally { historyPending.current.delete(id); }
  };
  const error = errors[errorScope];
  const setError = (value: string | undefined) =>
    setErrors((current) => ({ ...current, [errorScope]: value }));

  const pendingActions = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const pending = (id: string | undefined) => Boolean(id && pendingIds.has(id));
  const beginAction = (id: string) => {
    if (pendingActions.current.has(id)) return false;
    pendingActions.current.add(id);
    setPendingIds(new Set(pendingActions.current));
    return true;
  };
  const endAction = (id: string) => {
    pendingActions.current.delete(id);
    setPendingIds(new Set(pendingActions.current));
  };
  const [downloadError, setDownloadError] = useState<string>();
  const [archiveNotice, setArchiveNotice] =
    useState<Readonly<Record<string, unknown>>>();

  const [fileLinkNotice, setFileLinkNotice] = useState<string>();
  useEffect(() => {
    let pending: AbortController | undefined;
    const applyLink = async () => {
      pending?.abort();
      const file = new URLSearchParams(window.location.search).get("file");
      if (!file) { setFileLinkNotice(undefined); return; }
      if (!canOpenPreview) {
        clearPreviewLink();
        setSelected(undefined);
        setFileLinkNotice(undefined);
        return;
      }
      if (file === appliedPreviewLink.current) return;
      const controller = new AbortController();
      pending = controller;
      setFileLinkNotice("Finding the linked file…");
      try {
        const item = items.find(item => item.id === file) ??
          (await client.request(attachmentBrowse, {
            signal: controller.signal,
            body: {entityType: entityCode, entityId: recordId, attachmentId: file},
          })).items[0];
        if (controller.signal.aborted) return;
        if (!item) throw new Error("unavailable");
        appliedPreviewLink.current = file;
        setSelected(file);
        setSelectedName(fileLabel(item));
        setFileLinkNotice(undefined);
      } catch {
        if (!controller.signal.aborted) setFileLinkNotice("This file is unavailable in this record.");
      }
    };
    void applyLink();
    const navigate = () => {
      appliedPreviewLink.current = undefined;
      setSelected(undefined);
      void applyLink();
    };
    window.addEventListener("popstate", navigate);
    return () => { pending?.abort(); window.removeEventListener("popstate", navigate); };
  }, [items, client, entityCode, recordId, canOpenPreview]);
  const status = useAttachmentStatusPolling(client, items, onChanged);
  async function download(id: string) {
    if (!beginAction(id)) return;
    setDownloadError(undefined);
    try {
      await downloadAttachment(client, id);
    } catch (cause) {
      setDownloadError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function unlink(item: Readonly<Record<string, unknown>>) {
    const id = String(item.id);
    if (!beginAction(id)) return;
    setError(undefined);
    const command = commandKey("unlink", id);
    try {
      await client.request(attachmentUnlink(id), {
        idempotencyKey: idempotencyKeyFor(command),
      });
      completeCommand(command);
      setConfirm(undefined);
      notifySuccess(`File “${fileLabel(item)}” removed from record`);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function requestArchive(item: Readonly<Record<string, unknown>>) {
    const id = String(item.id);
    if (!beginAction(id)) return;
    setError(undefined);
    try {
      const outcome = await client.request(attachmentArchiveOutcome(id), {});
      if (outcome.legalHold) {
        setArchiveNotice(item);
        return;
      }
      setConfirm({
        kind: "archive",
        item,
        detail: `This archives the file everywhere it is linked, including other records. It currently has ${outcome.activeLinks} active ${outcome.activeLinks === 1 ? "record link" : "record links"}.`,
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function archive(item: Readonly<Record<string, unknown>>) {
    const id = String(item.id);
    if (!beginAction(id)) return;
    setError(undefined);
    const command = commandKey("archive", id);
    try {
      await client.request(attachmentArchive(id), {
        idempotencyKey: idempotencyKeyFor(command),
      });
      completeCommand(command);
      setConfirm(undefined);
      notifySuccess(`File “${fileLabel(item)}” archived`);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function rename(
    item: Readonly<Record<string, unknown>>,
    displayName: string,
  ) {
    const id = String(item.id),
      current = fileLabel(item);
    if (!displayName.trim() || displayName.trim() === current) {
      setDialog(undefined);
      return;
    }
    const revision = String(item.revision ?? "");
    if (!/^[1-9][0-9]*$/.test(revision)) {
      setError("This file is missing its current revision. Refresh the file list before renaming it.");
      return;
    }
    if (!beginAction(id)) return;
    setError(undefined);
    const nextName = displayName.trim(),
      command = commandKey("rename", id, `${revision}:${nextName}`);
    try {
      await client.request(attachmentRename(id), {
        body: {
          displayName: nextName,
          expectedSeriesRevision: revision,
        },
        idempotencyKey: idempotencyKeyFor(command),
      });
      completeCommand(command);
      setDialog(undefined);
      notifySuccess(`File renamed to “${nextName}”`);
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function category(id: string, value: "general" | "evidence") {
    if (!beginAction(id)) return;
    setError(undefined);
    const command = commandKey("category", id, value);
    try {
      await client.request(attachmentCategory(id), {
        body: { entityType: entityCode, entityId: recordId, category: value },
        idempotencyKey: idempotencyKeyFor(command),
      });
      completeCommand(command);
      setDialog(undefined);
      notifySuccess(
        `Category updated for “${fileLabel(items.find((item) => String(item.id) === id) ?? {})}”`,
      );
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(id);
    }
  }
  async function folderCommand(
    key: string,
    body: Readonly<Record<string, unknown>>,
  ) {
    const revision = Number(workspaceRevision);
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new Error("The file workspace revision is unavailable. Refresh before changing folders.");
    const current = folderCommands.current.get(key) ?? {
      folderId: body.folderId === null ? null : String(body.folderId),
      idempotencyKey: crypto.randomUUID(),
      expectedRevision: revision,
    };
    folderCommands.current.set(key, current);
    try {
      await client.request(attachmentFolder, {
        body: {
          ...body,
          folderId: current.folderId,
          expectedRevision: current.expectedRevision,
        },
        idempotencyKey: current.idempotencyKey,
      });
      folderCommands.current.delete(key);
      onChanged();
    } catch (cause) {
      if (
        cause instanceof ApiTransportError &&
        cause.status === 409 &&
        cause.problem?.code === "ATTACHMENT_WORKSPACE_REVISION_CONFLICT"
      )
        folderCommands.current.delete(key);
      onChanged();
      throw cause;
    }
  }
  async function createFolder() {
    if (!newFolderName.trim()) return;
    if (!beginAction("new-folder")) return;
    setError(undefined);
    const name = newFolderName.trim(),
      key = `create:${name}`;
    const revision = Number(workspaceRevision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      setError("The file workspace revision is unavailable. Refresh before creating a folder.");
      endAction("new-folder");
      return;
    }
    const command = folderCommands.current.get(key) ?? {
      folderId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      expectedRevision: revision,
    };
    folderCommands.current.set(key, command);
    try {
      await folderCommand(key, {
        command: "create",
        entityType: entityCode,
        entityId: recordId,
        folderId: command.folderId,
        name,
      });
      setNewFolderName("");
      setDialog(undefined);
      notifySuccess(`Folder “${name}” created for this record.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction("new-folder");
    }
  }
  async function move(
    item: Readonly<Record<string, unknown>>,
    folderId: string,
  ) {
    if (!beginAction(String(item.id))) return;
    setError(undefined);
    try {
      await folderCommand(`move:${String(item.id)}:${folderId}`, {
        command: "move",
        entityType: entityCode,
        entityId: recordId,
        folderId: folderId || null,
        attachmentId: item.id,
      });
      setDialog(undefined);
      notifySuccess(
        `“${fileLabel(item)}” moved to “${String(folders.find((folder) => folder.id === folderId)?.name ?? "Unfiled")}”.`,
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(String(item.id));
    }
  }
  async function deleteFolder(folder: Readonly<Record<string, unknown>>) {
    if (!beginAction(String(folder.id))) return;
    setError(undefined);
    try {
      await folderCommand(`delete:${String(folder.id)}`, {
        command: "delete",
        entityType: entityCode,
        entityId: recordId,
        folderId: folder.id,
      });
      setConfirm(undefined);
      if (folderFilter === folder.id) setFolderFilter("");
      notifySuccess(`Folder “${String(folder.name)}” deleted`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      endAction(String(folder.id));
    }
  }
  const [failedVersion, setFailedVersion] = useState<{
    file: File;
    parent: Readonly<Record<string, unknown>>;
  }>();
  const versionAttempts = useRef(
    new Map<string, { attachmentId: string; file: File }>(),
  );
  async function stageVersion(file: File) {
    const parent = versionTarget.current;
    versionTarget.current = undefined;
    if (!parent) return;
    const parentAttachmentId = String(parent.id);
    if (!beginAction(parentAttachmentId)) return;
    setErrors(current => ({ ...current, workspace: undefined }));
    try {
      const contentType = validateUploadFile(file, uploadPolicy ?? {});
      const previous = versionAttempts.current.get(parentAttachmentId);
      const same = previous?.file === file;
      const attempt = same
        ? previous!
        : { attachmentId: crypto.randomUUID(), file };
      versionAttempts.current.set(parentAttachmentId, attempt);
      await uploadRecordAttachment(client, {
        ...attempt, file, contentType, entityType: entityCode, entityId: recordId,
        parentAttachmentId, expectedSeriesVersion: Number(parent.version), retry: same,
      });
      versionAttempts.current.delete(parentAttachmentId);
      setFailedVersion(undefined);
      onChanged();
    } catch (cause) {
      setFailedVersion({ file, parent });
      setErrors(current => ({ ...current, workspace: `Version upload failed: ${message(cause)}` }));
    } finally {
      endAction(parentAttachmentId);
    }
  }
  async function copyLink(id: string) {
    setError(undefined);
    try {
      const link = new URL(window.location.href);
      link.searchParams.set("panel", "collaboration");
      link.searchParams.set("collaborationSection", "attachments");
      link.searchParams.set("file", id);
      await navigator.clipboard.writeText(link.toString());
      notifySuccess("Link copied");
    } catch (cause) {
      setError(`Unable to copy file link: ${message(cause)}`);
    }
  }
  const visible = (browseItems ?? items).map(item => historyRows[String(item.id)]
    ? {...item, versionHistory:historyRows[String(item.id)]} : item).filter(
    (item) =>
      `${item.fileName ?? ""} ${item.displayName ?? ""} ${item.contentType ?? ""}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()) &&
      (!folderFilter ||
        (folderFilter === "__unfiled"
          ? !item.folderId
          : item.folderId === folderFilter)) &&
      (!categoryFilter || item.category === categoryFilter),
  );
  return (
    <section
      ref={workspaceRef}
      className="a-attachment-workspace"
      aria-label="Files"
      data-viewing={Boolean(selected) || undefined}
    >
      <div className="a-files-upload-area">{upload}</div>
      {fileLinkNotice ? <p role="status">{fileLinkNotice}</p> : null}
      <section
        className="a-files-discovery-controls"
        aria-label="Search and filter files"
      >
        <div
          onFocusCapture={() => {
            if (!contentSearch) rememberBrowse();
          }}
        >
          <FileSearchInput
            search={search}
            nameQuery={filter}
            onNameQuery={setFilter}
            canSearch={canSearch}
            onClear={() => {
              if (contentSearch) clearSearch();
              else setFilter("");
            }}
            actions={
              <div className="a-files-toolbar">
                {canFolder ? (
                  <FileAction
                    label="New folder"
                    icon={<FolderPlusIcon size={18} aria-hidden="true" />}
                    onClick={() => {
                      setError(undefined);
                      setDialog({kind: "folder"});
                    }}
                  />
                ) : null}
                {
                  <span className="a-file-filter-action">
                    <FileAction
                      label="Filters"
                      icon={
                        <SlidersHorizontalIcon size={18} aria-hidden="true" />
                      }
                      aria-expanded={filtersOpen}
                      aria-controls="file-browse-filters"
                      onClick={() => setFiltersOpen((value) => !value)}
                    />
                    {folderFilter || categoryFilter ? (
                      <span
                        className="a-file-filter-count"
                        aria-label="Active filters"
                      >
                        {Number(Boolean(folderFilter)) +
                          Number(Boolean(categoryFilter))}
                      </span>
                    ) : null}
                  </span>
                }
              </div>
            }
          />
        </div>
        {items.some((item) =>
          ["pending", "uploading", "uploaded", "processing"].includes(
            String(item.processingStatus),
          ),
        ) ? (
          <p className="a-files-processing" role="status">
            Some files are still processing and may not appear in content search
            yet.
          </p>
        ) : null}
        {downloadError ? <p role="alert">{downloadError}</p> : null}
        {failedVersion ? (
          <Button
            type="button"
            disabled={pendingIds.has(String(failedVersion.parent.id))}
            onClick={() => {
              versionTarget.current = failedVersion.parent;
              void stageVersion(failedVersion.file);
            }}
          >
            Retry version upload
          </Button>
        ) : null}
        <input
          ref={versionInput}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void stageVersion(file);
          }}
        />
        <Dialog
          open={Boolean(
            folderOpen || renameTarget || categoryTarget || moveTarget,
          )}
          onOpenChange={(open) => {
            if (
              !open &&
              !pending(
                dialogPendingId,
              )
            ) {
              setDialog(undefined);
              setError(undefined);
            }
          }}
        >
          <DialogContent
            portal
            description={
              folderOpen
                ? "Create a folder for this record only."
                : `File: ${fileLabel(renameTarget ?? moveTarget ?? items.find((item) => String(item.id) === categoryTarget) ?? {})}`
            }
            className="a-comment-action-dialog a-file-action-dialog"
            title={
              folderOpen
                ? "New folder"
                : renameTarget
                  ? "Rename file"
                  : categoryTarget
                    ? "Set category"
                    : "Move to folder"
            }
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (folderOpen) void createFolder();
                else if (renameTarget) void rename(renameTarget, renameValue);
                else if (categoryTarget)
                  void category(categoryTarget, categoryValue);
                else if (moveTarget) void move(moveTarget, moveValue);
              }}
            >
              {folderOpen ? (
                <label>
                  Folder name
                  <input
                    autoFocus
                    value={newFolderName}
                    maxLength={256}
                    onChange={(event) =>
                      setNewFolderName(event.currentTarget.value)
                    }
                  />
                </label>
              ) : renameTarget ? (
                <label>
                  Display name
                  <input
                    autoFocus
                    value={renameValue}
                    maxLength={1024}
                    onChange={(event) =>
                      setRenameValue(event.currentTarget.value)
                    }
                  />
                </label>
              ) : categoryTarget ? (
                <label>
                  Category
                  <select
                    value={categoryValue}
                    onChange={(event) =>
                      setCategoryValue(
                        event.currentTarget.value as "general" | "evidence",
                      )
                    }
                  >
                    <option value="general">General</option>
                    <option value="evidence">Evidence</option>
                  </select>
                </label>
              ) : (
                <label>
                  Folder
                  <select
                    value={moveValue}
                    onChange={(event) =>
                      setMoveValue(event.currentTarget.value)
                    }
                  >
                    <option value="">Unfiled (no folder)</option>
                    {folders.map((folder) => (
                      <option key={String(folder.id)} value={String(folder.id)}>
                        {String(folder.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {error ? <p role="alert">{error}</p> : null}
              <div className="a-comment-action-dialog__footer">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={pending(
                    dialogPendingId,
                  )}
                  onClick={() => {
              setDialog(undefined);
                    setError(undefined);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pending(
                      dialogPendingId,
                    ) ||
                    (folderOpen
                      ? !newFolderName.trim()
                      : renameTarget
                        ? !renameValue.trim()
                        : moveTarget
                          ? moveValue === String(moveTarget.folderId ?? "")
                          : false)
                  }
                >
                  {folderOpen ? "Create folder" : "Save"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <div
          id="file-browse-filters"
          hidden={!filtersOpen}
          className="a-attachment-workspace__filters"
        >
          <label>
            Folder
            <select
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.currentTarget.value)}
            >
              <option value="">All folders</option>
              <option value="__unfiled">Unfiled</option>
              {folders.map((folder) => (
                <option key={String(folder.id)} value={String(folder.id)}>
                  {String(folder.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.currentTarget.value)}
            >
              <option value="">All categories</option>
              <option value="general">General</option>
              <option value="evidence">Evidence</option>
            </select>
          </label>
        </div>
        {categoryFilter ? (
          <div className="a-file-filter-chips">
            <button type="button" onClick={() => setCategoryFilter("")}>
              Category: {categoryFilter} ×
              <span className="a-file-search__label">
                Remove category filter
              </span>
            </button>
          </div>
        ) : null}
        <nav className="a-file-folders" aria-label="Record folders">
          <FilterChipGroup
            label="Folder filter"
            value={folderFilter}
            onValueChange={setFolderFilter}
            items={[
              { value: "", label: "All files" },
              { value: "__unfiled", label: "Unfiled" },
              ...folders.map((folder) => ({
                value: String(folder.id),
                label: String(folder.name),
                className: "a-file-folder",
                icon: <FolderInputIcon size={16} />,
                action: canFolder ? (
                  <CollaborationActions
                    portal
                    label={`Actions for folder ${folder.name}`}
                  >
                    <button
                      className="a-menu__item"
                      type="button"
                      onClick={() =>
                        setConfirm({
                          kind: "folder",
                          item: folder,
                          detail:
                            "Move files to Unfiled or another folder first. Only empty folders can be deleted; this applies to this record only.",
                        })
                      }
                    >
                      <TrashIcon size={16} aria-hidden="true" />
                      Delete folder
                    </button>
                  </CollaborationActions>
                ) : undefined,
              })),
            ]}
          />
        </nav>
      </section>
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (
            !open &&
            !pending(confirm ? String(confirm.item.id) : undefined)
          ) {
            setConfirm(undefined);
            setError(undefined);
          }
        }}
      >
        <DialogContent
          portal
          title={
            confirm?.kind === "archive"
              ? "Archive file"
              : confirm?.kind === "folder"
                ? "Delete folder"
                : "Remove from this record"
          }
          description={confirm?.detail}
          className="a-comment-action-dialog a-file-action-dialog"
        >
          <p>{confirm ? fileLabel(confirm.item) : ""}</p>
          {error ? <p role="alert">{error}</p> : null}
          <div className="a-comment-action-dialog__footer">
            <Button
              variant="secondary"
              type="button"
              disabled={pending(confirm ? String(confirm.item.id) : undefined)}
              onClick={() => {
                setError(undefined);
                setConfirm(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={pending(confirm ? String(confirm.item.id) : undefined)}
              onClick={() => {
                if (!confirm) return;
                const action = confirm;
                void (action.kind === "archive"
                  ? archive(action.item)
                  : action.kind === "folder"
                    ? deleteFolder(action.item)
                    : unlink(action.item));
              }}
            >
              {confirm?.kind === "archive"
                ? "Archive file everywhere"
                : confirm?.kind === "folder"
                  ? "Delete folder"
                  : "Remove from this record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(archiveNotice)}
        onOpenChange={(open) => {
          if (!open) setArchiveNotice(undefined);
        }}
      >
        <DialogContent
          portal
          title="Archive unavailable"
          description="A legal hold blocks archive for this file."
          className="a-comment-action-dialog a-file-action-dialog"
        >
          <p>{archiveNotice ? fileLabel(archiveNotice) : ""}</p>
          <div className="a-comment-action-dialog__footer">
            <Button onClick={() => setArchiveNotice(undefined)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <section
        className="a-files-results-area"
        aria-label={contentSearch ? "File search results" : "Record files"}
      >
        <p
          hidden={contentSearch || !visible.length}
          className="a-attachment-workspace__count"
          role="status"
        >
          {browseItems
            ? `${browseHasMore ? "First " : ""}${visible.length} matching files shown`
            : `${visible.length} of ${items.length} loaded files shown`}
        </p>
        {!contentSearch && !items.length ? (
          <EmptySectionState
            centered
            title="No files yet"
            detail="Upload files or create a folder to start organizing this record."
          />
        ) : null}
        <div
          className="a-files-content-layout"
          data-preview={Boolean(selected) || undefined}
        >
          <div className="a-files-results-pane">
            {contentSearch ? (
              <FileSearchResults
                search={search}
                canPreview={canOpenPreview}
                canDownload={canDownload}
                selected={selected}
                downloading={pendingIds}
                onPreview={(hit) => openPreview(hit.attachmentId, hit.fileName)}
                onDownload={(id) => void download(id)}
              />
            ) : null}
            <div
              hidden={contentSearch}
              className="a-record-detail-collection a-attachment-workspace__list"
            >
              {visible.map((item) => (
                <Card
                  key={String(item.id)}
                  className="a-attachment-card"
                  role="group"
                  aria-label={fileLabel(item)}
                  data-selected={selected === item.id || undefined}
                >
                  <header className="a-attachment-card__header">
                    <AttachmentThumbnail
                      key={String(item.id)}
                      attachmentId={String(item.id)}
                      name={fileLabel(item)}
                      contentType={String(item.contentType ?? "")}
                        canPreview={canOpenPreview && item.processingStatus === "active"}
                      onPreview={() =>
                        openPreview(String(item.id), fileLabel(item))
                      }
                    />
                    <div>
                      <span className="a-file-name">
                        <Tooltip
                          portal
                          onlyWhenTruncated
                          label={fileLabel(item)}
                        >
                          {canOpenPreview && item.processingStatus === "active" ? (
                            <button
                              type="button"
                              className="a-file-name__preview"
                              onClick={() =>
                                openPreview(String(item.id), fileLabel(item))
                              }
                            >
                              {fileLabel(item)}
                            </button>
                          ) : (
                            <strong tabIndex={0}>{fileLabel(item)}</strong>
                          )}
                        </Tooltip>
                      </span>
                      <small>
                        {collaborationFileSize(item.sizeBytes)} ·{" "}
                        {collaborationTime(item.createdAt)}
                      </small>
                      <small>
                        v{display(item.version)} ·{" "}
                        <span
                          className="a-file-status"
                          data-state={String(item.processingStatus)}
                        >
                          {display(status[String(item.id)] ?? item.processingStatus)}
                        </span>
                        {item.category ? ` · ${item.category}` : ""}
                      </small>
                      <small className="a-file-location">
                        <FolderInputIcon size={14} aria-hidden="true" />
                        {String(
                          item.folderName ??
                            folders.find(
                              (folder) => folder.id === item.folderId,
                            )?.name ??
                            "Unfiled",
                        )}
                      </small>
                    </div>
                  </header>
                  <div className="a-attachment-card__primary">
                    {canOpenPreview && item.processingStatus === "active" ? (
                      <FileAction
                        label="Preview file"
                        icon={<EyeIcon size={18} aria-hidden="true" />}
                        aria-pressed={selected === item.id}
                        onClick={() =>
                          openPreview(String(item.id), fileLabel(item))
                        }
                      >
                        Preview
                      </FileAction>
                    ) : null}
                    {canDownload ? (
                      <FileAction
                        label="Download"
                        icon={<DownloadIcon size={18} aria-hidden="true" />}
                        disabled={pendingIds.has(String(item.id))}
                        onClick={() => void download(String(item.id))}
                      />
                    ) : null}
                    {fullView && canVersion ? (
                      <FileAction
                        label={
                          history.has(String(item.id))
                            ? "Hide history"
                            : "Version history"
                        }
                        icon={
                          history.has(String(item.id)) ? (
                            <ChevronDownIcon
                              style={{ transform: "rotate(180deg)" }}
                              size={18}
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDownIcon size={18} aria-hidden="true" />
                          )
                        }
                        aria-expanded={history.has(String(item.id))}
                        onClick={() => void openHistory(item)}
                      >
                        {history.has(String(item.id))
                          ? "Hide history"
                          : "Version history"}
                      </FileAction>
                    ) : null}
                    <CollaborationActions portal label="File actions">
                      {canVersion ? (
                        <>
                          <button
                            type="button"
                            disabled={pendingIds.has(String(item.id))}
                            onClick={() => {
                              versionTarget.current = item;
                              versionInput.current?.click();
                            }}
                          >
                            <UploadIcon size={16} aria-hidden="true" />
                            Upload new version
                          </button>
                          {!fullView ? (
                            <button
                              type="button"
                              aria-expanded={history.has(String(item.id))}
                              onClick={() => void openHistory(item)}
                            >
                              {history.has(String(item.id)) ? (
                                <ChevronDownIcon
                                  style={{ transform: "rotate(180deg)" }}
                                  size={16}
                                  aria-hidden="true"
                                />
                              ) : (
                                <ChevronDownIcon size={16} aria-hidden="true" />
                              )}
                              {history.has(String(item.id))
                                ? "Hide history"
                                : "Version history"}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {canVersion && (canRename || canFolder || canCategory) ? (
                        <hr />
                      ) : null}
                      {canRename ? (
                        <button
                          type="button"
                          disabled={pendingIds.has(String(item.id))}
                          onClick={() => {
                            setError(undefined);
                            setDialog({kind: "rename", target: item});
                            setRenameValue(fileLabel(item));
                          }}
                        >
                          <PencilIcon size={16} aria-hidden="true" />
                          Rename
                        </button>
                      ) : null}
                      {canFolder ? (
                        <button
                          type="button"
                          onClick={() => {
                            setError(undefined);
                            setDialog({kind: "move", target: item});
                            setMoveValue(String(item.folderId ?? ""));
                          }}
                        >
                          <FolderInputIcon size={16} aria-hidden="true" />
                          Move to folder
                        </button>
                      ) : null}
                      {canCategory ? (
                        <button
                          type="button"
                          onClick={() => {
                            setError(undefined);
                            setCategoryValue(
                              item.category === "evidence"
                                ? "evidence"
                                : "general",
                            );
                            setDialog({kind: "category", target: String(item.id)});
                          }}
                        >
                          <TagIcon size={16} aria-hidden="true" />
                          Set category
                        </button>
                      ) : null}
                      {canVersion || canRename || canFolder || canCategory ? (
                        <hr />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyLink(String(item.id))}
                      >
                        <LinkIcon size={16} aria-hidden="true" />
                        Copy link
                      </button>
                      {canArchive || canUnlink ? <hr /> : null}
                      {canArchive ? (
                        <button
                          type="button"
                          className="a-attachment-card__danger"
                          disabled={pendingIds.has(String(item.id))}
                          onClick={() => void requestArchive(item)}
                        >
                          <ArchiveIcon size={16} aria-hidden="true" />
                          Archive file
                        </button>
                      ) : null}
                      {canUnlink ? (
                        <button
                          type="button"
                          className="a-attachment-card__danger"
                          disabled={pendingIds.has(String(item.id))}
                          onClick={() =>
                            setConfirm({
                              kind: "unlink",
                              item,
                              detail:
                                "This removes the file from this record. The file remains available wherever else it is linked.",
                            })
                          }
                        >
                          <UnlinkIcon size={16} aria-hidden="true" />
                          Remove from this record
                        </button>
                      ) : null}
                    </CollaborationActions>
                  </div>

                  {!fullView && history.has(String(item.id)) ? (
                    <div className="a-attachment-card__history-controls">
                      <button
                        type="button"
                        aria-expanded="true"
                        onClick={(event) => {
                          const trigger = event.currentTarget
                            .closest(".a-attachment-card")
                            ?.querySelector<HTMLElement>(
                              ".a-collaboration-actions > summary",
                            );
                          toggleHistory(String(item.id));
                          trigger?.focus();
                        }}
                      >
                        <ChevronDownIcon
                          style={{ transform: "rotate(180deg)" }}
                          size={16}
                          aria-hidden="true"
                        />
                        Hide history
                      </button>
                    </div>
                  ) : null}
                  {history.has(String(item.id)) &&
                  Array.isArray(item.versionHistory) ? (
                    <ul
                      className="a-attachment-card__history"
                      aria-label="Version history"
                    >
                      {item.versionHistory.map((version: any) => (
                        <li key={String(version.id)}>
                          <div>
                            <strong>
                              v{display(version.version)} ·{" "}
                              {version.id === item.id
                                ? item.pinnedAttachmentId
                                  ? "Pinned to this record"
                                  : version.status === "active"
                                    ? "Current"
                                    : "Pending version"
                                : "Previous version"}
                            </strong>
                            <span>{display(version.fileName)}</span>
                            <small>
                              {version.status === "active"
                                ? "Available · retained version"
                                : display(version.status)}{" "}
                              · {collaborationTime(version.createdAt)}
                            </small>
                          </div>
                          <div className="a-version-actions">
                            {version.id === item.id &&
                            canOpenPreview &&
                            version.status === "active" ? (
                              <FileAction
                                label={`Preview version ${version.version}`}
                                icon={<EyeIcon size={18} aria-hidden="true" />}
                                onClick={() =>
                                  openPreview(
                                    String(version.id),
                                    String(version.fileName),
                                  )
                                }
                              >
                                Preview
                              </FileAction>
                            ) : null}
                            {canDownload && version.status === "active" ? (
                              <FileAction
                                label={`Download version ${version.version}`}
                                icon={
                                  <DownloadIcon size={18} aria-hidden="true" />
                                }
                                disabled={pendingIds.has(String(version.id))}
                                onClick={() =>
                                  void download(String(version.id))
                                }
                              >
                                Download
                              </FileAction>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {history.has(String(item.id)) && !Array.isArray(item.versionHistory)
                    ? <p role={historyErrors[String(item.id)] ? "alert" : "status"}>{historyErrors[String(item.id)] || "Loading version history…"}</p> : null}
                  {history.has(String(item.id)) ? (
                    <p className="a-version-note">
                      Previous versions are retained. Preview is available for
                      the version linked to this record; downloads are checked
                      when requested.
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
            {!contentSearch && browse.error ? <p role="alert">{browse.error} <button type="button" onClick={browse.retry}>Retry</button></p> : null}
            {!contentSearch && browseItems && browseHasMore ? (
              <button
                type="button"
                disabled={browse.busy}
                onClick={browse.loadMore}
              >
                {browse.busy ? "Loading more files…" : "Load more matching files"}
              </button>
            ) : null}
            {!contentSearch && !filter.trim() && !folderFilter && !categoryFilter ? loadMore : null}
          </div>
          {selected && canOpenPreview ? (
            <aside
              ref={previewRef}
              tabIndex={-1}
              className="a-files-selected-preview"
              aria-label="Selected file preview"
            >
              <header>
                {fullView ? (
                  <FileAction
                    label="Close preview"
                    icon={<CloseIcon size={18} aria-hidden="true" />}
                    onClick={closePreview}
                  />
                ) : (
                  <button
                    type="button"
                    className="a-file-back"
                    onClick={closePreview}
                  >
                    <ChevronLeftIcon size={18} aria-hidden="true" />
                    Back to results
                  </button>
                )}
                <strong>
                  {selectedName ||
                    String(
                      items.find((item) => item.id === selected)?.displayName ??
                        items.find((item) => item.id === selected)?.fileName ??
                        "File preview",
                    )}
                </strong>
              </header>
              <AttachmentPreview
                key={selected}
                attachmentId={selected}
                document
              />
            </aside>
          ) : null}
        </div>
        {!contentSearch && !visible.length && items.length ? (
          <PanelEmptyState
            className="a-files-empty-state"
            role="status"
            icon={<FileTextIcon size={22} />}
            title="No matching files"
            description={
              filter
                ? "No file names match your search. Try searching inside files, or clear your search and filters."
                : "No files match these filters. Clear them to show the file list."
            }
            action={
              <div className="a-files-empty-state__actions">
                {canSearch && filter ? (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      search.setQuery(filter);
                      search.setScope("contents");
                    }}
                  >
                    Search file contents
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setFilter("");
                    setFolderFilter("");
                    setCategoryFilter("");
                  }}
                >
                  Show all files
                </Button>
              </div>
            }
          />
        ) : null}
      </section>
      {errors.workspace ? (
        <p className="a-attachment-workspace__error" role="alert">
          {errors.workspace}
        </p>
      ) : null}
    </section>
  );
}
