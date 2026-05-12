"use client";

/**
 * RowMetaStrip — right-aligned row decoration strip.
 * Order: relative time · comment badge · attachment badge · bookmark
 */

import { useRouter } from "next/navigation";
import { BookmarkToggle } from "@athyper/collaboration-ui/bookmarks";
import { CommentCountBadge, AttachmentCountBadge } from "@athyper/collaboration-ui/badges";
import { RelativeTimeCell } from "@athyper/ui/primitives";

export interface RowMetaStripProps {
  row:                Record<string, unknown>;
  entityCode:         string;
  /** Active visible column names; suppresses relative time when the configured audit column is visible. */
  visibleColumnNames: string[];
  updatedAtFieldName?: string;
  attachmentCountFieldName?: string;
  bookmarked:         boolean;
  commentCount:       number;
  commentHasOpen:     boolean;
  onBookmarkToggle:   (recordId: string, snapshot?: RowBookmarkSnapshot) => void;
  bookmarkPending?:   boolean;
  bookmarkSnapshot?:  RowBookmarkSnapshot;
  /** Business code used for the detail-page URL (e.g. AUKA-SITE-HQ). Falls back to row.id. */
  recordNavId?:       string;
}

export interface RowBookmarkSnapshot {
  displayName?: string | null;
  recordCode?: string | null;
}

export function RowMetaStrip({
  row,
  entityCode,
  visibleColumnNames,
  updatedAtFieldName,
  attachmentCountFieldName,
  bookmarked,
  commentCount,
  commentHasOpen,
  onBookmarkToggle,
  bookmarkPending = false,
  bookmarkSnapshot,
  recordNavId,
}: RowMetaStripProps) {
  const router     = useRouter();
  const recordId   = String(row.id ?? "");
  const updatedAt  = updatedAtFieldName ? row[updatedAtFieldName] as string | undefined : undefined;
  const attachRaw  = attachmentCountFieldName ? row[attachmentCountFieldName] : undefined;
  const attachCount = typeof attachRaw === "number" ? attachRaw : undefined;

  const suppressTime = updatedAtFieldName ? visibleColumnNames.includes(updatedAtFieldName) : true;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {!suppressTime && updatedAt && (
        <RelativeTimeCell
          value={updatedAt}
          className="w-6 text-right text-xs tabular-nums text-muted-foreground/60"
        />
      )}

      <CommentCountBadge
        total={commentCount}
        hasOpen={commentHasOpen}
        onClick={() => router.push(`/app/${entityCode}/${encodeURIComponent(recordNavId ?? recordId)}#comments`)}
      />

      {attachCount !== undefined && <AttachmentCountBadge count={attachCount} />}

      <BookmarkToggle
        bookmarked={bookmarked}
        recordId={recordId}
        onToggle={(id) => onBookmarkToggle(id, bookmarkSnapshot)}
        isPending={bookmarkPending}
      />
    </div>
  );
}
