"use client";
import { parseInstant } from "@athyper/platform-temporal";
import { useContext, useEffect, useRef, useState } from "react";
import { requestThumbnail, forgetThumbnail } from "./thumbnail-requests";
import { useThumbnailScope } from "./thumbnail-scope";
import { attachmentCapabilityUrl } from "@athyper/platform-communications-collaboration-ui";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
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
  const identity = useSessionIdentity();
  const scope = useThumbnailScope();
  const coordinate = JSON.stringify([
    scope,
    attachmentId,
    contentType,
    canPreview,
  ]);
  const ready = useRef<
    { key: string; url: string; expires: number } | undefined
  >(undefined);
  const [epoch, setEpoch] = useState(0);
  const [loading, setLoading] = useState(false);
  const client = useApiClient(),
    visible = useContext(CollaborationVisibilityContext);
  const tile = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false),
    [value, setValue] = useState<{
      key: string;
      url: string;
      expires: number;
    }>();
  const url =
    canPreview &&
    identity.state === "authenticated" &&
    value?.key === coordinate &&
    value.expires > Date.now()
      ? value.url
      : undefined;
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
    setLoading(false);
    if (ready.current?.key !== coordinate) {
      ready.current = undefined;
      setValue(undefined);
    }
    if (
      !visible ||
      !near ||
      !supported ||
      !canPreview ||
      identity.state !== "authenticated" ||
      !identity.scope
    )
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = (expires: number) => {
      timer = setTimeout(
        () => {
          ready.current = undefined;
          setValue(undefined);
          setEpoch((current) => current + 1);
        },
        Math.max(1, expires - Date.now()),
      );
    };
    if (ready.current && ready.current.expires > Date.now()) {
      setValue(ready.current);
      expire(ready.current.expires);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }
    setValue(undefined);
    let polls = 0;
    const read = async () => {
      setLoading(true);
      try {
        const result = await requestThumbnail(
          client,
          scope,
          attachmentId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result.state === "processing" && ++polls < 12) {
          timer = setTimeout(() => void read(), Math.min(1000 * polls, 10000));
          return;
        }
        if (
          result.state !== "ready" ||
          !result.url ||
          (result.contentType && !result.contentType.startsWith("image/"))
        ) {
          setLoading(false);
          return;
        }
        const target = attachmentCapabilityUrl(result.url, {
          isolatedFromOrigin: window.location.origin,
        });
        const expires = result.expiresAt
          ? parseInstant(result.expiresAt) - 5000
          : Date.now();
        if (!Number.isFinite(expires) || expires <= Date.now()) {
          setLoading(false);
          return;
        }
        ready.current = { key: coordinate, url: target.href, expires };
        setValue(ready.current);
        expire(expires);
      } catch {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [
    client,
    attachmentId,
    visible,
    near,
    supported,
    canPreview,
    coordinate,
    scope,
    identity.state,
    epoch,
  ]);
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
            onError={() => {
              forgetThumbnail(client, scope, attachmentId);
              ready.current = undefined;
              setValue(undefined);
              setLoading(false);
            }}
          />
          <span className="a-attachment-thumbnail__badge">
            {name.includes(".")
              ? name.split(".").pop()?.slice(0, 5).toUpperCase()
              : pdf
                ? "PDF"
                : ""}
          </span>
        </>
      ) : loading ? (
        <span
          className="a-attachment-thumbnail__loading"
          role="status"
          aria-label={intl.message("files.loadingThumbnail")}
        />
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
