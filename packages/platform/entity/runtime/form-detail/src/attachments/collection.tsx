"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { writeRecordLocation } from "../record/write-record-location";
import { uploadRecordAttachment } from "../upload-record-attachment";
import { useAttachmentBrowse } from "../use-attachment-browse";
import { useAttachmentStatusPolling } from "../use-attachment-status-polling";
import { downloadAttachment } from "../attachment-download";
import { fileLabel } from "../collaboration-read-models";
import { AttachmentThumbnail } from "../attachment-thumbnail";
import {
  CollaborationPresentationContext,
  CollaborationVisibilityContext,
} from "../collaboration-visibility";
import {
  CollaborationActions,
  collaborationTime,
  collaborationFileSize,
} from "../collaboration-actions";
import { AttachmentPreview } from "../attachment-preview";
import { FileAction } from "../file-action";
import {
  useFileSearch,
  FileSearchInput,
  FileSearchResults,
} from "../file-search";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { ApiTransportError } from "@athyper/platform-api-client";
import {
  useApiClient,
  useToasts,
  useSessionIdentity,
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
  InfoIcon,
  ChevronLeftIcon,
} from "@athyper/platform-icons";
import { validateUploadFile } from "@athyper/platform-communications-collaboration-ui";
import {
  FilterChipGroup,
  PanelEmptyState,
  Button,
  Card,
  Dialog,
  DialogContent,
  Tooltip,
} from "@athyper/platform-ui";
import {
  useId,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EmptySectionState, display, message } from "../section-primitives";
import {
  attachmentUnlink,
  attachmentRename,
  attachmentCategory,
  attachmentFolder,
  attachmentArchiveOutcome,
  attachmentArchive,
  attachmentBrowse,
} from "../collaboration-operations";
import { UploadExpandedContext } from "./upload-context";

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
  const intl = useEntityI18n();
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadAreaId = useId();
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
  const categoryTarget =
    dialog?.kind === "category" ? dialog.target : undefined;
  const dialogPendingId = !dialog
    ? ""
    : dialog.kind === "folder"
      ? "new-folder"
      : dialog.kind === "category"
        ? dialog.target
        : String(dialog.target.id);
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
  const browse = useAttachmentBrowse(
    client,
    entityCode,
    recordId,
    canSearch,
    filter,
    folderFilter,
    categoryFilter,
    items,
  );
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
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>(
    {},
  );
  const identity = useSessionIdentity();
  const historyScope = JSON.stringify([identity.scope, entityCode, recordId]);
  const historyCache = useRef(new Map<string, unknown[]>());
  const previousHistoryScope = useRef(historyScope);
  // Stable semantic coordinates: polling can replace items without changing any
  // open series revision. Do not clear visible history while revalidating it.
  const historyRequests = JSON.stringify(
    [...history].sort().flatMap((id) => {
      const item = (browseItems ?? items).find((row) => String(row.id) === id);
      return item
        ? [[id, item.seriesId ?? id, item.revision ?? item.version ?? null]]
        : [];
    }),
  );
  useEffect(() => {
    const controller = new AbortController();
    if (previousHistoryScope.current !== historyScope) {
      previousHistoryScope.current = historyScope;
      historyCache.current.clear();
      setHistoryRows({});
      setHistoryErrors({});
      setHistory(new Set());
      return () => controller.abort();
    }
    for (const coordinate of JSON.parse(historyRequests) as [
      string,
      unknown,
      unknown,
    ][]) {
      const id = coordinate[0];
      const key = JSON.stringify([historyScope, ...coordinate]);
      const cached = historyCache.current.get(key);
      if (cached) {
        setHistoryRows((current) => ({ ...current, [id]: cached }));
        continue;
      }
      setHistoryErrors((current) => ({ ...current, [id]: "" }));
      void client
        .request(attachmentBrowse, {
          signal: controller.signal,
          body: {
            entityType: entityCode,
            entityId: recordId,
            attachmentId: id,
            includeHistory: true,
          },
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          const versions = result.items[0]?.versionHistory;
          if (!Array.isArray(versions))
            throw new Error("Version history unavailable");
          historyCache.current.set(key, versions);
          setHistoryRows((current) => ({ ...current, [id]: versions }));
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setHistoryErrors((current) => ({
              ...current,
              [id]: "Version history could not be refreshed. Close and reopen history to retry.",
            }));
        });
    }
    return () => controller.abort();
  }, [historyRequests, historyScope, client, entityCode, recordId]);
  const toggleHistory = (id: string) =>
    setHistory((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const openHistory = (item: Readonly<Record<string, unknown>>) =>
    toggleHistory(String(item.id));
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
      if (!file) {
        setFileLinkNotice(undefined);
        return;
      }
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
        const item =
          items.find((item) => item.id === file) ??
          (
            await client.request(attachmentBrowse, {
              signal: controller.signal,
              body: {
                entityType: entityCode,
                entityId: recordId,
                attachmentId: file,
              },
            })
          ).items[0];
        if (controller.signal.aborted) return;
        if (!item) throw new Error("unavailable");
        appliedPreviewLink.current = file;
        setSelected(file);
        setSelectedName(fileLabel(item));
        setFileLinkNotice(undefined);
      } catch {
        if (!controller.signal.aborted)
          setFileLinkNotice("This file is unavailable in this record.");
      }
    };
    void applyLink();
    const navigate = () => {
      appliedPreviewLink.current = undefined;
      setSelected(undefined);
      void applyLink();
    };
    window.addEventListener("popstate", navigate);
    return () => {
      pending?.abort();
      window.removeEventListener("popstate", navigate);
    };
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
      setError(
        "This file is missing its current revision. Refresh the file list before renaming it.",
      );
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
      throw new Error(
        "The file workspace revision is unavailable. Refresh before changing folders.",
      );
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
      setError(
        "The file workspace revision is unavailable. Refresh before creating a folder.",
      );
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
        `“${fileLabel(item)}” moved to “${String(folders.find((folder) => folder.id === folderId)?.name ?? intl.message("files.unfiled"))}”.`,
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
    setErrors((current) => ({ ...current, workspace: undefined }));
    try {
      const contentType = validateUploadFile(file, uploadPolicy ?? {});
      const previous = versionAttempts.current.get(parentAttachmentId);
      const same = previous?.file === file;
      const attempt = same
        ? previous!
        : { attachmentId: crypto.randomUUID(), file };
      versionAttempts.current.set(parentAttachmentId, attempt);
      await uploadRecordAttachment(client, {
        ...attempt,
        file,
        contentType,
        entityType: entityCode,
        entityId: recordId,
        parentAttachmentId,
        expectedSeriesVersion: Number(parent.version),
        retry: same,
      });
      versionAttempts.current.delete(parentAttachmentId);
      setFailedVersion(undefined);
      onChanged();
    } catch (cause) {
      setFailedVersion({ file, parent });
      setErrors((current) => ({
        ...current,
        workspace: `Version upload failed: ${message(cause)}`,
      }));
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
      notifySuccess(intl.message("files.linkCopied"));
    } catch (cause) {
      setError(`Unable to copy file link: ${message(cause)}`);
    }
  }
  const visible = (browseItems ?? items)
    .map((item) =>
      previousHistoryScope.current === historyScope &&
      historyRows[String(item.id)]
        ? { ...item, versionHistory: historyRows[String(item.id)] }
        : item,
    )
    .filter(
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
      aria-label={intl.message("collaboration.files")}
      data-viewing={Boolean(selected) || undefined}
      onDragEnter={(event) => {
        if (
          upload &&
          Array.from(event.dataTransfer.types).includes(
            intl.message("collaboration.files"),
          )
        ) {
          event.preventDefault();
          setUploadOpen(true);
        }
      }}
    >
      {fileLinkNotice ? <p role="status">{fileLinkNotice}</p> : null}
      <section
        className="a-files-discovery-controls"
        aria-label={intl.message("files.searchFilter")}
      >
        <div
          onFocusCapture={() => {
            if (!contentSearch) rememberBrowse();
          }}
        >
          <FileSearchInput
            creationAction={
              upload ? (
                <button
                  type="button"
                  aria-expanded={uploadOpen}
                  aria-controls={uploadOpen ? uploadAreaId : undefined}
                  onClick={() => setUploadOpen(!uploadOpen)}
                >
                  <span>{intl.message("files.addButton")}</span>
                  <ChevronDownIcon
                    size={16}
                    aria-hidden="true"
                    className="a-files-upload-chevron"
                  />
                </button>
              ) : undefined
            }
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
                    label={intl.message("files.newFolder")}
                    icon={<FolderPlusIcon size={18} aria-hidden="true" />}
                    onClick={() => {
                      setError(undefined);
                      setDialog({ kind: "folder" });
                    }}
                  />
                ) : null}
                {
                  <span className="a-file-filter-action">
                    <FileAction
                      label={intl.message("files.filters")}
                      badge={
                        folderFilter || categoryFilter ? (
                          <span
                            className="a-file-filter-count"
                            aria-label={intl.message("files.activeFilters")}
                          >
                            {Number(Boolean(folderFilter)) +
                              Number(Boolean(categoryFilter))}
                          </span>
                        ) : null
                      }
                      icon={
                        <SlidersHorizontalIcon size={18} aria-hidden="true" />
                      }
                      aria-expanded={filtersOpen}
                      aria-controls="file-browse-filters"
                      onClick={() => setFiltersOpen((value) => !value)}
                    />
                  </span>
                }
              </div>
            }
          />
        </div>
        <div id={uploadAreaId} className="a-files-upload-area">
          <UploadExpandedContext.Provider value={uploadOpen}>
            {upload}
          </UploadExpandedContext.Provider>
        </div>
        {items.some((item) =>
          ["pending", "uploading", "uploaded", "processing"].includes(
            String(item.processingStatus),
          ),
        ) ? (
          <p className="a-files-processing" role="status">
            {intl.message("files.processingNote")}
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
            {intl.message("files.retryVersion")}
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
            if (!open && !pending(dialogPendingId)) {
              setDialog(undefined);
              setError(undefined);
            }
          }}
        >
          <DialogContent
            portal
            description={
              folderOpen
                ? intl.message("files.folderHelp")
                : `File: ${fileLabel(renameTarget ?? moveTarget ?? items.find((item) => String(item.id) === categoryTarget) ?? {})}`
            }
            className="a-comment-action-dialog a-file-action-dialog"
            title={
              folderOpen
                ? intl.message("files.newFolder")
                : renameTarget
                  ? intl.message("files.renameTitle")
                  : categoryTarget
                    ? intl.message("files.setCategory")
                    : intl.message("files.move")
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
                  {intl.message("files.folderName")}
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
                  {intl.message("files.displayName")}
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
                  {intl.message("files.category")}
                  <select
                    value={categoryValue}
                    onChange={(event) =>
                      setCategoryValue(
                        event.currentTarget.value as "general" | "evidence",
                      )
                    }
                  >
                    <option value="general">
                      {intl.message("files.general")}
                    </option>
                    <option value="evidence">
                      {intl.message("files.evidence")}
                    </option>
                  </select>
                </label>
              ) : (
                <label>
                  {intl.message("files.folder")}
                  <select
                    value={moveValue}
                    onChange={(event) =>
                      setMoveValue(event.currentTarget.value)
                    }
                  >
                    <option value="">{intl.message("files.noFolder")}</option>
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
                  disabled={pending(dialogPendingId)}
                  onClick={() => {
                    setDialog(undefined);
                    setError(undefined);
                  }}
                >
                  {intl.message("action.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pending(dialogPendingId) ||
                    (folderOpen
                      ? !newFolderName.trim()
                      : renameTarget
                        ? !renameValue.trim()
                        : moveTarget
                          ? moveValue === String(moveTarget.folderId ?? "")
                          : false)
                  }
                >
                  {folderOpen ? intl.message("files.createFolder") : "Save"}
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
            {intl.message("files.folder")}
            <select
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.currentTarget.value)}
            >
              <option value="">{intl.message("files.allFolders")}</option>
              <option value="__unfiled">{intl.message("files.unfiled")}</option>
              {folders.map((folder) => (
                <option key={String(folder.id)} value={String(folder.id)}>
                  {String(folder.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {intl.message("files.category")}
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.currentTarget.value)}
            >
              <option value="">{intl.message("files.allCategories")}</option>
              <option value="general">{intl.message("files.general")}</option>
              <option value="evidence">{intl.message("files.evidence")}</option>
            </select>
          </label>
        </div>
        {categoryFilter ? (
          <div className="a-file-filter-chips">
            <button type="button" onClick={() => setCategoryFilter("")}>
              {intl.message("files.categoryFilter", { name: categoryFilter })} ×
              <span className="a-file-search__label">
                {intl.message("files.removeCategory")}
              </span>
            </button>
          </div>
        ) : null}
        <div className="a-files-browse-summary">
          <nav
            className="a-file-folders"
            aria-label={intl.message("files.recordFolders")}
          >
            <FilterChipGroup
              label={intl.message("files.folderFilter")}
              value={folderFilter}
              onValueChange={setFolderFilter}
              items={[
                { value: "", label: intl.message("files.all") },
                { value: "__unfiled", label: intl.message("files.unfiled") },
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
                        {intl.message("files.deleteFolder")}
                      </button>
                    </CollaborationActions>
                  ) : undefined,
                })),
              ]}
            />
          </nav>
          <p
            hidden={contentSearch || !visible.length}
            className="a-attachment-workspace__count"
            role="status"
          >
            {browseItems
              ? intl.message("files.matchingCount", {
                  count: visible.length,
                  loaded: String(Boolean(browseHasMore)),
                })
              : visible.length !== items.length
                ? intl.message("files.filteredCount", {
                    shown: visible.length,
                    total: items.length,
                    loaded: String(Boolean(loadMore)),
                  })
                : intl.message("files.totalCount", {
                    count: visible.length,
                    loaded: String(Boolean(loadMore)),
                  })}
          </p>
        </div>
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
              ? intl.message("files.archive")
              : confirm?.kind === "folder"
                ? intl.message("files.deleteFolder")
                : intl.message("files.unlink")
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
              {intl.message("action.cancel")}
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
                ? intl.message("files.archiveEverywhere")
                : confirm?.kind === "folder"
                  ? intl.message("files.deleteFolder")
                  : intl.message("files.unlink")}
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
          title={intl.message("files.archiveUnavailable")}
          description={intl.message("files.legalHold")}
          className="a-comment-action-dialog a-file-action-dialog"
        >
          <p>{archiveNotice ? fileLabel(archiveNotice) : ""}</p>
          <div className="a-comment-action-dialog__footer">
            <Button onClick={() => setArchiveNotice(undefined)}>
              {intl.message("action.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <section
        className="a-files-results-area"
        aria-label={
          contentSearch
            ? intl.message("files.searchResults")
            : intl.message("files.recordFiles")
        }
      >
        {!contentSearch && !items.length ? (
          <EmptySectionState
            centered
            title={intl.message("files.emptyTitle")}
            detail={
              upload
                ? intl.message("files.emptyDescription")
                : intl.message("files.readOnlyEmpty")
            }
          />
        ) : null}
        <div
          className="a-files-content-layout"
          data-preview={Boolean(selected) || undefined}
        >
          <div className="a-files-results-pane">
            {!contentSearch && !visible.length && items.length ? (
              <PanelEmptyState
                className="a-files-empty-state"
                role="status"
                icon={<FileTextIcon size={22} />}
                title={intl.message("files.noMatches")}
                description={
                  filter
                    ? intl.message("files.noNames")
                    : intl.message("files.filteredEmpty")
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
                        {intl.message("files.searchContents")}
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
                      {intl.message("files.showAll")}
                    </Button>
                  </div>
                }
              />
            ) : null}
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
                      canPreview={
                        canOpenPreview && item.processingStatus === "active"
                      }
                      onPreview={() =>
                        openPreview(String(item.id), fileLabel(item))
                      }
                    />
                    <div className="a-attachment-card__identity">
                      <span className="a-file-name">
                        <Tooltip
                          portal
                          onlyWhenTruncated
                          label={fileLabel(item)}
                        >
                          {canOpenPreview &&
                          item.processingStatus === "active" ? (
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
                        <small className="a-file-attribution">
                          {intl.message("files.addedBy", {
                            name: String(
                              item.addedByDisplayName ??
                                intl.message("files.unavailable"),
                            ),
                          })}
                          {item.addedAt
                            ? ` · ${collaborationTime(item.addedAt, intl)}`
                            : ""}
                        </small>
                      </span>
                      <small className="a-file-metadata">
                        {collaborationFileSize(item.sizeBytes, intl)} ·{" "}
                        {collaborationTime(item.createdAt, intl)}
                      </small>
                      <small className="a-file-version">
                        <span className="a-file-version-status">
                          v{display(item.version)} ·{" "}
                          <span
                            className="a-file-status"
                            data-state={String(item.processingStatus)}
                          >
                            {display(
                              status[String(item.id)] ?? item.processingStatus,
                            )}
                          </span>
                          {item.category ? ` · ${item.category}` : ""}
                        </span>
                        {canVersion ? (
                          <span className="a-file-history-disclosure">
                            <button
                              type="button"
                              aria-expanded={history.has(String(item.id))}
                              aria-controls={history.has(String(item.id)) ? `file-history-${item.id}` : undefined}
                              onClick={() => void openHistory(item)}
                            >
                              <ChevronDownIcon
                                size={16}
                                aria-hidden="true"
                                style={{
                                  transform: history.has(String(item.id))
                                    ? "rotate(180deg)"
                                    : undefined,
                                }}
                              />
                              {intl.message("files.history")}
                            </button>
                            <Tooltip
                              portal
                              side="bottom"
                              label={intl.message("files.historyHelp")}
                            >
                              <button
                                type="button"
                                aria-label={intl.message("files.aboutHistory")}
                              >
                                <InfoIcon size={14} aria-hidden="true" />
                              </button>
                            </Tooltip>
                          </span>
                        ) : null}
                      </small>
                      <small className="a-file-location">
                        <FolderInputIcon size={14} aria-hidden="true" />
                        {String(
                          item.folderName ??
                            folders.find(
                              (folder) => folder.id === item.folderId,
                            )?.name ??
                            intl.message("files.unfiled"),
                        )}
                      </small>
                    </div>
                  </header>
                  <div className="a-attachment-card__primary">
                    {canOpenPreview && item.processingStatus === "active" ? (
                      <FileAction
                        label={intl.message("files.previewFile")}
                        icon={<EyeIcon size={18} aria-hidden="true" />}
                        aria-pressed={selected === item.id}
                        onClick={() =>
                          openPreview(String(item.id), fileLabel(item))
                        }
                      >
                        {intl.message("action.preview")}
                      </FileAction>
                    ) : null}
                    {canDownload ? (
                      <FileAction
                        label={intl.message("action.download")}
                        icon={<DownloadIcon size={18} aria-hidden="true" />}
                        disabled={pendingIds.has(String(item.id))}
                        onClick={() => void download(String(item.id))}
                      />
                    ) : null}
                    <CollaborationActions
                      portal
                      label={intl.message("files.actions")}
                    >
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
                            {intl.message("files.uploadVersion")}
                          </button>
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
                            setDialog({ kind: "rename", target: item });
                            setRenameValue(fileLabel(item));
                          }}
                        >
                          <PencilIcon size={16} aria-hidden="true" />
                          {intl.message("files.rename")}
                        </button>
                      ) : null}
                      {canFolder ? (
                        <button
                          type="button"
                          onClick={() => {
                            setError(undefined);
                            setDialog({ kind: "move", target: item });
                            setMoveValue(String(item.folderId ?? ""));
                          }}
                        >
                          <FolderInputIcon size={16} aria-hidden="true" />
                          {intl.message("files.move")}
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
                            setDialog({
                              kind: "category",
                              target: String(item.id),
                            });
                          }}
                        >
                          <TagIcon size={16} aria-hidden="true" />
                          {intl.message("files.setCategory")}
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
                        {intl.message("files.copyLink")}
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
                          {intl.message("files.archive")}
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
                          {intl.message("files.unlink")}
                        </button>
                      ) : null}
                    </CollaborationActions>
                  </div>

                  {history.has(String(item.id)) &&
                  Array.isArray(item.versionHistory) ? (
                    <ul
                      id={`file-history-${item.id}`}
                      className="a-attachment-card__history"
                      aria-label={intl.message("files.history")}
                    >
                      {item.versionHistory.map((version: any) => (
                        <li key={String(version.id)}>
                          <div>
                            <strong>
                              v{display(version.version)} ·{" "}
                              {version.id === item.id
                                ? item.pinnedAttachmentId
                                  ? intl.message("files.pinned")
                                  : version.status === "active"
                                    ? "Current"
                                    : intl.message("files.pendingVersion")
                                : intl.message("files.previousVersion")}
                            </strong>
                            <span>{display(version.fileName)}</span>
                            <small>
                              {version.status === "active"
                                ? intl.message("files.retainedVersion")
                                : display(version.status)}{" "}
                              · {collaborationTime(version.createdAt, intl)}
                              <span className="a-file-version-author">
                                {intl.message("files.uploadedBy", {
                                  name: String(
                                    version.uploadedByDisplayName ??
                                      intl.message("files.unavailable"),
                                  ),
                                })}
                              </span>
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
                                {intl.message("action.preview")}
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
                                {intl.message("action.download")}
                              </FileAction>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {history.has(String(item.id)) &&
                  !Array.isArray(item.versionHistory) ? (
                    <p
                      role={historyErrors[String(item.id)] ? "alert" : "status"}
                    >
                      {historyErrors[String(item.id)] ||
                        intl.message("files.loadingHistory")}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
            {!contentSearch && browse.error ? (
              <p role="alert">
                {browse.error}{" "}
                <button type="button" onClick={browse.retry}>
                  {intl.message("action.retry")}
                </button>
              </p>
            ) : null}
            {!contentSearch && browseItems && browseHasMore ? (
              <button
                type="button"
                disabled={browse.busy}
                onClick={browse.loadMore}
              >
                {browse.busy
                  ? intl.message("files.loadingMore")
                  : intl.message("files.moreMatching")}
              </button>
            ) : null}
            {!contentSearch &&
            !filter.trim() &&
            !folderFilter &&
            !categoryFilter
              ? loadMore
              : null}
          </div>
          {selected && canOpenPreview ? (
            <aside
              ref={previewRef}
              tabIndex={-1}
              className="a-files-selected-preview"
              aria-label={intl.message("files.selectedPreview")}
            >
              <header>
                {fullView ? (
                  <FileAction
                    label={intl.message("action.closePreview")}
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
                    {intl.message("files.back")}
                  </button>
                )}
                <strong>
                  {selectedName ||
                    String(
                      items.find((item) => item.id === selected)?.displayName ??
                        items.find((item) => item.id === selected)?.fileName ??
                        intl.message("files.previewTitle"),
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
      </section>
      {errors.workspace ? (
        <p className="a-attachment-workspace__error" role="alert">
          {errors.workspace}
        </p>
      ) : null}
    </section>
  );
}
