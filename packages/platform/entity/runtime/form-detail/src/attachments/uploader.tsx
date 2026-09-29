"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { uploadRecordAttachment } from "../upload-record-attachment";
import { collaborationFileSize } from "../collaboration-actions";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { ApiTransportError } from "@athyper/platform-api-client";
import {
  useApiClient,
  useToasts,
} from "@athyper/platform-shell-app-foundation";
import { UploadIcon } from "@athyper/platform-icons";
import { validateUploadFile } from "@athyper/platform-communications-collaboration-ui";
import { Card } from "@athyper/platform-ui";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { message } from "../section-primitives";
import { attachmentBrowse } from "../collaboration-operations";
import { UploadExpandedContext } from "./upload-context";

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
  const intl = useEntityI18n();
  const { push: notify } = useToasts();
  const client = useApiClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const expanded = useContext(UploadExpandedContext);
  const queueElement = useRef<HTMLUListElement>(null);
  const uploadsAllowed = capability?.maxFileBytes !== 0;
  const requirementsId = useId();
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const typeLabels: Record<string, string> = { "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPG/JPEG", "text/plain": "TXT" };
  const allowedTypes = capability?.allowedContentTypes?.map(type => typeLabels[type] ?? type).join(", ");
  const maximumSize = capability?.maxFileBytes === undefined ? undefined : collaborationFileSize(capability.maxFileBytes, intl);
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
      readonly failureKind?: "inspection" | "malware";
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
          ? { ...item, state: "uploading", error: undefined, failureKind: undefined }
          : item,
      ),
    );
    const controller = new AbortController();
    uploadControllers.current.set(attempt.attachmentId, controller);
    try {
      await uploadRecordAttachment(client, {
        ...attempt,
        entityType: entityCode,
        entityId: recordId,
        signal: controller.signal,
        retry: retry.current.some(
          (item) => item.attachmentId === attempt.attachmentId,
        ),
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
      const code = cause instanceof ApiTransportError ? cause.problem?.code : undefined;
      const failureKind = code === "MALWARE_DOCUMENT_UNSUPPORTED" ? "inspection" as const
        : code === "ATTACHMENT_QUARANTINED" ? "malware" as const : undefined;
      setQueue((items) =>
        items.map((item) =>
          item.attachmentId === attempt.attachmentId
            ? { ...item, state: "failed", error: message(cause), retryable, failureKind }
            : item,
        ),
      );
      // The queue item owns this error and its retry/remove action.
      // Refresh the persisted status (permanent inspection failures are terminal).
      onChanged();
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
        tone: succeeded.length < attempts.length ? "warning" : "success",
        title:
          succeeded.length === 1
            ? intl.message("files.uploadedName", {
                name: succeeded[0]!.file.name,
              })
            : intl.message("files.uploadedCount", { count: succeeded.length }),
        ...(succeeded.length < attempts.length
          ? { detail: intl.message("files.partialUpload"), action: { label: intl.message("files.reviewUploads"), onClick: () => { queueElement.current?.focus({ preventScroll: true }); queueElement.current?.scrollIntoView({ block: "center" }); } } }
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
      setError(undefined);
      setValidationErrors([]);
      const maxBatch = capability?.maxBatchCount ?? 10;
      const chosen = files.slice(0, maxBatch);
      const rejected: string[] =
        files.length > maxBatch
          ? [`Only the first ${maxBatch} files can be added at once.`]
          : [];
      const accepted: File[] = [];
      for (const file of chosen) {
        try {
          validateUploadFile(file, capability ?? {});
          accepted.push(file);
        } catch (cause) {
          rejected.push(file.size < 1 ? intl.message("files.emptyFile", { name: file.name })
            : capability?.maxFileBytes !== undefined && file.size > capability.maxFileBytes
              ? intl.message("files.tooLarge", { name: file.name, size: collaborationFileSize(file.size, intl), maximum: maximumSize! })
              : allowedTypes ? intl.message("files.unsupportedFile", { name: file.name, types: allowedTypes }) : message(cause));
        }
      }
      if (rejected.length) setValidationErrors(rejected);
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
          (item) =>
            item.fileName === file.name || item.displayName === file.name,
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
            rejected.push(
              `Could not check whether “${file.name}” already exists: ${message(cause)}`,
            );
            continue;
          }
        }
        if (!existing && canVersion && !canBrowse) {
          rejected.push(
            `${file.name}: The server cannot check duplicate file names for this record. Refresh or ask an administrator to enable file search before uploading.`,
          );
          continue;
        }
        if (existing && canVersion) pending.push({ file, existing });
        else separate.push(file);
      }
      if (separate.length) enqueue(separate);
      if (pending.length) setDuplicates((current) => [...current, ...pending]);
      setValidationErrors(rejected);
    } finally {
      admittingFiles.current = false;
    }
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
      hidden={!expanded && !queue.length && !duplicates.length && !error && !validationErrors.length}
      role="region"
      aria-label={intl.message("files.dropZone")}
      aria-busy={busy}
      data-dragging={dragging || undefined}
      tabIndex={0}
      onDragEnter={(event) => {
        if (
          Array.from(event.dataTransfer.types).includes(
            "Files",
          )
        ) {
          event.preventDefault();
          if (!uploadsAllowed) return;
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (
          Array.from(event.dataTransfer.types).includes(
            "Files",
          )
        ) {
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
      <div className="a-attachment-uploader__target" hidden={!expanded}>
        <span className="a-attachment-uploader__icon">
          <UploadIcon size={22} aria-hidden="true" />
        </span>
        <div className="a-attachment-uploader__prompt">
          <strong className="a-attachment-uploader__instruction">
            {!uploadsAllowed
              ? "Uploads are not permitted"
              : dragging
                ? busy
                  ? intl.message("files.uploadProgress")
                  : intl.message("files.dropUpload")
                : intl.message("files.dragUpload")}
          </strong>
          {uploadsAllowed ? (
            <span>
              <span className="a-attachment-uploader__or">or</span>{" "}
              <label className="a-attachment-uploader__drop">
                {intl.message("files.browse")}
                <input
                  aria-label={intl.message("files.upload")}
                  aria-describedby={requirementsId}
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
            </span>
          ) : null}
        </div>
      </div>
      <div className="a-attachment-uploader__guidance" hidden={!expanded}>
        <span>
          {intl.message("files.batchGuidance", {
            count: capability?.maxBatchCount ?? 10,
          })}
        </span>
        <span id={requirementsId}>
          {allowedTypes || intl.message("files.allowedHelp")}
          {uploadsAllowed && maximumSize ? ` · ${intl.message("files.perFileLimit", { size: maximumSize })}` : ""}
        </span>
        {uploadsAllowed ? <span>{intl.message("files.pasteHelp")}</span> : null}
      </div>
      {duplicates.length ? (
        <section
          className="a-attachment-uploader__duplicates"
          aria-label={intl.message("files.duplicates")}
        >
          <h3>{intl.message("files.chooseUpload")}</h3>
          {duplicates.map((duplicate) => (
            <div key={`${duplicate.file.name}-${duplicate.file.lastModified}`}>
              <p>
                {intl.message("files.duplicateName", {
                  name: duplicate.file.name,
                })}
              </p>
              <button
                type="button"
                onClick={() => chooseDuplicate(duplicate, true)}
              >
                {intl.message("files.newVersion")}
              </button>
              <button
                type="button"
                onClick={() => chooseDuplicate(duplicate, false)}
              >
                {intl.message("files.separate")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setDuplicates((current) =>
                    current.filter((value) => value !== duplicate),
                  )
                }
              >
                {intl.message("files.cancelUpload")}
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {queue.length ? (
        <ul ref={queueElement} tabIndex={-1} aria-label={intl.message("files.queue")}>
          {queue.map((item) => (
            <li key={item.attachmentId}>
              <strong>{item.file.name}</strong>
              {" — "}
              <span role={item.state === "failed" ? "alert" : "status"}>
                {item.state === "failed" && item.failureKind
                  ? intl.message(item.failureKind === "inspection" ? "files.inspectionUnsupported" : "files.malwareDetected")
                  : item.state === "uploading"
                  ? intl.message("files.uploading")
                  : item.state === "finalizing"
                    ? intl.message("files.finalizing")
                    : item.state === "processing"
                      ? intl.message("files.uploadProcessing")
                      : intl.message(item.state === "ready" ? "files.ready" : item.state === "queued" ? "files.queued" : "files.failed")}
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
                  {intl.message("files.cancelUpload")}
                </button>
              ) : null}
              {item.error ? `: ${item.error}` : ""}
              {item.state === "failed" && item.retryable ? (
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
                  {intl.message("files.retryFile")}
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
                  {intl.message("files.removeQueue")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {validationErrors.length ? <ul role="alert" className="a-upload-validation">{validationErrors.map((text, index) => <li key={index}>{text}</li>)}</ul> : null}
      {error ? <p role="alert">{error}</p> : null}
      {queue.some((item) => item.state === "failed" && item.retryable) &&
      !busy ? (
        <button type="button" onClick={retryFailed}>
          {intl.message("files.retryUploads")}
        </button>
      ) : null}
    </Card>
  );
}
