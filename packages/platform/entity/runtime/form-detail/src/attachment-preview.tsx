"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { FileTextIcon } from "@athyper/platform-icons";
import { CollaborationVisibilityContext } from "./collaboration-visibility";
import { useContext } from "react";
import { useEffect, useState } from "react";
import { attachmentPreview, type AttachmentPreviewResult as Preview } from "./collaboration-operations";
import { attachmentCapabilityUrl } from "@athyper/platform-communications-collaboration-ui";
import { useApiClient } from "@athyper/platform-shell-app-foundation";

/** Every refresh reauthorizes the derivative; closing cancels polling and delivery.
 * Native PDF viewing uses a separate storage origin and a scanned raster-only PDF.
 * No source PDF scripts, forms, links or embedded files reach this browsing context. */
export function AttachmentPreview({
  attachmentId,
  thumbnail = false,
  document: fullDocument = false,
}: {
  attachmentId: string;
  thumbnail?: boolean;
  document?: boolean;
}) {
  const intl = useEntityI18n();
  const client = useApiClient(),
    [value, setValue] = useState<Preview & {messageKey?: string}>(),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      polls = 0;
    setValue(undefined);
    const read = async () => {
      try {
        const result = await client.request(
          attachmentPreview(attachmentId),
          {
            body: {
              rendition: thumbnail
                ? "thumbnail_sm"
                : fullDocument
                  ? "preview_default"
                  : "page_preview",
            },
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        const url = result.url ? attachmentCapabilityUrl(result.url, {
            isolatedFromOrigin: window.location.origin,
          }).href : undefined;
        setValue({ ...result, ...(url ? { url } : {}) });
        if (result.state === "processing" && ++polls < 12)
          timer = setTimeout(() => void read(), Math.min(1000 * polls, 10000));
        else if (result.state === "processing")
          setValue({
            ...result,
            messageKey: "files.previewProcessing",
            detail:
              "Preview is still processing. Open or refresh the preview to check again.",
          });
        else if (result.state === "ready" && result.expiresAt)
          timer = setTimeout(
            () => void read(),
            Math.max(
              1000,
              new Date(result.expiresAt).getTime() - Date.now() - 15000,
            ),
          );
      } catch {
        if (!controller.signal.aborted)
          setValue({
            state: "unavailable",
            messageKey: "files.previewUnavailable",
            detail: "Preview is unavailable. You can still download the file.",
          });
      }
    };
    void read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [attachmentId, client, thumbnail, fullDocument, attempt]);
  const detail = value?.messageKey ? intl.message(value.messageKey) : value?.detail;
  return (
    <div
      className={
        thumbnail
          ? "a-attachment-preview a-attachment-preview--thumbnail"
          : "a-attachment-preview"
      }
    >
      {value?.state === "ready" && value.url ? (
        fullDocument ? (
          <>
            <iframe
              title={intl.message("files.documentPreview")}
              src={value.url}
              referrerPolicy="no-referrer"
            />
            <a href={value.url} target="_blank" rel="noopener noreferrer">
              {intl.message("files.openPdf")}
            </a>
          </>
        ) : (
          <img
            src={value.url}
            alt={
              thumbnail
                ? intl.message("files.firstThumbnail")
                : intl.message("files.firstPreview")
            }
            referrerPolicy="no-referrer"
            onError={() =>
              setValue({
                state: "unavailable",
                messageKey: "files.previewExpired",
                detail: "Preview expired or could not be loaded.",
              })
            }
          />
        )
      ) : thumbnail ? (
        <span
          role="status"
          aria-label={detail ?? intl.message("files.loadingThumbnail")}
          title={detail ?? intl.message("files.loadingThumbnail")}
        >
          <FileTextIcon aria-hidden="true" />
        </span>
      ) : (
        <p role="status">{detail ?? intl.message("files.loadingPreview")}</p>
      )}
      {!thumbnail ? (
        <>
          <small>
            {intl.message("files.previewHelp", {name: intl.message(fullDocument ? "files.documentPreview" : "files.firstPage")})}
          </small>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {intl.message("files.refreshPreview")}
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Closed viewers are unmounted: stop polling, revoke the browsing context and discard URLs. */
export function AttachmentPreviewControl({
  attachmentId,
}: {
  attachmentId: string;
}) {
  const intl = useEntityI18n();
  const [open, setOpen] = useState(false);
  const visible = useContext(CollaborationVisibilityContext);
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);
  return (
    <section className="a-attachment-preview-control">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? intl.message("action.closePreview") : intl.message("files.previewFile")}
      </button>
      {visible ? (
        open ? (
          <AttachmentPreview attachmentId={attachmentId} document />
        ) : (
          <AttachmentPreview attachmentId={attachmentId} thumbnail />
        )
      ) : null}
    </section>
  );
}
