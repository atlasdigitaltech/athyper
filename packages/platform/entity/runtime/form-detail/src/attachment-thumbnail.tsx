"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { attachmentPreview } from "./collaboration-operations";
import { attachmentCapabilityUrl } from "@athyper/platform-communications-collaboration-ui";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { CollaborationVisibilityContext } from "./collaboration-visibility";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
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
  const intl = useEntityI18n();
  const [loading, setLoading] = useState(false);
  const client = useApiClient(),
    visible = useContext(CollaborationVisibilityContext);
  const tile = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false),
    [url, setUrl] = useState<string>();
  const image =
    contentType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic)$/i.test(name);
  const pdf = contentType === "application/pdf" || /\.pdf$/i.test(name);
  const supported = image || pdf;
  useEffect(() => {
    if (!visible || !canPreview || !supported) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "0px" },
    );
    if (tile.current) observer.observe(tile.current);
    return () => observer.disconnect();
  }, [visible, canPreview, supported]);
  useEffect(() => {
    setUrl(undefined);
    setLoading(false);
    if (!visible || !near || !supported || !canPreview) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const read = async () => {
      setLoading(true);
      try {
        const result = await client.request(attachmentPreview(attachmentId), {
          body: { rendition: "thumbnail_sm" }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.state === "processing" && ++polls < 12) {
          timer = setTimeout(() => void read(), Math.min(1000 * polls, 10000));
          return;
        }
        if (result.state !== "ready" || !result.url ||
            (result.contentType && !result.contentType.startsWith("image/"))) {
          setLoading(false);
          return;
        }
        const target = attachmentCapabilityUrl(result.url, { isolatedFromOrigin: window.location.origin });
        setUrl(target.href);
      } catch {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [client, attachmentId, visible, near, supported, canPreview]);
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
            onLoad={() => setLoading(false)}
            onError={() => { setUrl(undefined); setLoading(false); }}
          />
          <span className="a-attachment-thumbnail__badge">
            {name.includes(".") ? name.split(".").pop()?.slice(0, 5).toUpperCase() : pdf ? "PDF" : ""}
          </span>
        </>
      ) : loading ? (
        <span className="a-attachment-thumbnail__loading" role="status" aria-label={intl.message("files.loadingThumbnail")} />
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
