"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { attachmentPreview } from "./collaboration-operations";
import { attachmentCapabilityUrl } from "@athyper/platform-communications-collaboration-ui";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { CollaborationVisibilityContext } from "./collaboration-visibility";
import { FileTypeIcon } from "./file-type";

/** List tiles request only small authorized derivatives, never original file bytes. */
export function AttachmentThumbnail({
  attachmentId,
  name,
  contentType,
  canPreview,
  onPreview,
}: {
  attachmentId: string;
  name: string;
  contentType: string;
  canPreview: boolean;
  onPreview: () => void;
}) {
  const client = useApiClient(),
    visible = useContext(CollaborationVisibilityContext);
  const tile = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false),
    [url, setUrl] = useState<string>();
  const image =
    contentType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic)$/i.test(name);
  useEffect(() => {
    if (!visible || !canPreview || !image) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "120px" },
    );
    if (tile.current) observer.observe(tile.current);
    return () => observer.disconnect();
  }, [visible, canPreview, image]);
  useEffect(() => {
    setUrl(undefined);
    if (!visible || !near || !image || !canPreview) return;
    const controller = new AbortController();
    void client
      .request(
        attachmentPreview(attachmentId),
        { body: { rendition: "thumbnail_sm" }, signal: controller.signal },
      )
      .then((result) => {
        if (
          controller.signal.aborted ||
          result.state !== "ready" ||
          !result.url
        )
          return;
        let target: URL;
        try {
          target = attachmentCapabilityUrl(result.url, {
            isolatedFromOrigin: window.location.origin,
          });
        } catch {
          return;
        }
        if (result.contentType && !result.contentType.startsWith("image/"))
          return;
        setUrl(target.href);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [client, attachmentId, visible, near, image, canPreview]);
  const content = (
    <>
      {url ? (
        <>
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setUrl(undefined)}
          />
          <span className="a-attachment-thumbnail__badge">
            {name.split(".").pop()?.slice(0, 5).toUpperCase()}
          </span>
        </>
      ) : (
        <FileTypeIcon name={name} contentType={contentType} />
      )}
    </>
  );
  return (
    <span ref={tile} className="a-attachment-thumbnail">
      {canPreview ? (
        <button
          type="button"
          aria-label={`Preview ${name}`}
          onClick={onPreview}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </span>
  );
}
