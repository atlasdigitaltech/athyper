"use client";

import { MessageCircle, Paperclip, Star } from "lucide-react";
import type { RuntimeRecordRow } from "../core/types";

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

export interface RuntimeRowMetaStripProps {
  row:              RuntimeRecordRow;
  detailHref:       string;
  bookmarked:       boolean;
  bookmarkPending:  boolean;
  onBookmarkToggle: () => void;
  commentCount:     number;
  commentHasOpen:   boolean;
}

export function RuntimeRowMetaStrip({
  row,
  detailHref,
  bookmarked,
  bookmarkPending,
  onBookmarkToggle,
  commentCount,
  commentHasOpen,
}: RuntimeRowMetaStripProps) {
  const updatedAt   = typeof row["updated_at"] === "string" ? (row["updated_at"] as string) : null;
  const attachRaw   = row["attachment_count"];
  const attachCount = typeof attachRaw === "number" ? attachRaw : 0;
  const relTime     = updatedAt ? formatRelativeTime(updatedAt) : null;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {relTime && (
        <span
          title={updatedAt ?? undefined}
          className="mr-0.5 w-7 text-right text-xs tabular-nums text-muted-foreground/55 select-none"
        >
          {relTime}
        </span>
      )}

      {commentCount > 0 && (
        <a
          data-row-action
          href={`${detailHref}#comments`}
          onClick={(e) => e.stopPropagation()}
          className="relative inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded px-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
          title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
          aria-label={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
        >
          <MessageCircle aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="text-[10px] tabular-nums leading-none">{commentCount}</span>
          {commentHasOpen && (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0.5 size-1.5 rounded-full bg-primary/80"
            />
          )}
        </a>
      )}

      {attachCount > 0 && (
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center gap-0.5 px-0.5 text-muted-foreground/55"
          title={`${attachCount} attachment${attachCount !== 1 ? "s" : ""}`}
          aria-label={`${attachCount} attachment${attachCount !== 1 ? "s" : ""}`}
        >
          <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="text-[10px] tabular-nums leading-none">{attachCount}</span>
        </span>
      )}

      <button
        data-row-action
        type="button"
        aria-label={bookmarked ? "Remove from favourites" : "Add to favourites"}
        title={bookmarked ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={bookmarked}
        disabled={bookmarkPending}
        onClick={(e) => {
          e.stopPropagation();
          if (!bookmarkPending) onBookmarkToggle();
        }}
        className={cx(
          "inline-flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-45",
          bookmarked
            ? "text-primary hover:text-primary/75"
            : "text-muted-foreground/35 hover:text-primary/70",
        )}
      >
        <Star
          aria-hidden="true"
          className={cx("size-3.5 transition-all", bookmarked ? "fill-current" : "")}
        />
      </button>
    </div>
  );
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
