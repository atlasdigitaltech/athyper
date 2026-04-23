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
  /** Active visible column names — suppresses relative time when updated_at is a column. */
  visibleColumnNames: string[];
  bookmarked:         boolean;
  commentCount:       number;
  commentHasOpen:     boolean;
  onBookmarkToggle:   (recordId: string) => void;
  bookmarkPending?:   boolean;
}

export function RowMetaStrip({
  row,
  entityCode,
  visibleColumnNames,
  bookmarked,
  commentCount,
  commentHasOpen,
  onBookmarkToggle,
  bookmarkPending = false,
}: RowMetaStripProps) {
  const router     = useRouter();
  const recordId   = String(row.id ?? "");
  const updatedAt  = row.updated_at as string | undefined;
  const attachCount = typeof row.attachment_count === "number" ? row.attachment_count : 0;

  const suppressTime = visibleColumnNames.includes("updated_at");

  return (
    <div className="flex items-center justify-end gap-0.5">
      {!suppressTime && updatedAt && (
        <RelativeTimeCell
          value={updatedAt}
          className="w-6 text-right text-xs tabular-nums text-muted-foreground/40"
        />
      )}

      <CommentCountBadge
        total={commentCount}
        hasOpen={commentHasOpen}
        onClick={() => router.push(`/app/${entityCode}/${recordId}#comments`)}
      />

      <AttachmentCountBadge count={attachCount} />

      <BookmarkToggle
        bookmarked={bookmarked}
        recordId={recordId}
        onToggle={onBookmarkToggle}
        isPending={bookmarkPending}
      />
    </div>
  );
}
