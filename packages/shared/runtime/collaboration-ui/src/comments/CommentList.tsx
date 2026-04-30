"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Loader2, CheckCheck } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useComments, useCommentActions, useCollabUnreadCount } from "../hooks/collab";
import { CommentCard, type CommentCardProps } from "./CommentCard";
import { CommentForm } from "./CommentForm";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "me" | "unread" | "internal";

export interface CommentListProps {
  entityType: string;
  entityId: string;
  className?: string;
  onCountChange?: (count: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommentList({ entityType, entityId, className, onCountChange }: CommentListProps) {
  const { comments, hasMore, isLoading, error, refetch } = useComments(entityType, entityId);
  const { createComment }                                 = useCommentActions(entityType, entityId);
  const { unreadCount, markAllAsRead }                    = useCollabUnreadCount(entityType, entityId);
  const [filter, setFilter]                               = useState<FilterMode>("all");

  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const topLevel = useMemo(
    () => comments.filter((c) => !c.parentCommentId),
    [comments],
  );

  const counts = useMemo(() => ({
    all:      topLevel.length,
    me:       topLevel.filter((c) => c.commenterRole === "me").length,
    unread:   topLevel.filter((c) => c.isUnread).length,
    internal: topLevel.filter((c) => c.visibility === "internal").length,
  }), [topLevel]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "me":       return topLevel.filter((c) => c.commenterRole === "me");
      case "unread":   return topLevel.filter((c) => c.isUnread);
      case "internal": return topLevel.filter((c) => c.visibility === "internal");
      default:         return topLevel;
    }
  }, [topLevel, filter]);

  const handleSubmit = useCallback(
    async (text: string, attachmentIds: string[], contentJson?: unknown, contentHtml?: string, visibility?: string) => {
      await createComment({ commentText: text, attachmentIds, contentJson, contentHtml, visibility });
      refetch();
    },
    [createComment, refetch],
  );

  const renderCard = useCallback(
    (props: CommentCardProps) => (
      <CommentCard key={props.comment.id} {...props} renderCard={renderCard} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading && comments.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load comments.{" "}
        <button type="button" className="underline hover:no-underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  // ── Filter tabs ────────────────────────────────────────────────────────────

  const tabs: { key: FilterMode; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "me",       label: "@Me" },
    { key: "unread",   label: "Unread" },
    { key: "internal", label: "Internal" },
  ];

  // Position of the unread divider: insert it before the first unread comment.
  // Comments are newest-first from the server, so unread sit at the top.
  const unreadDividerBeforeIdx =
    filter === "all" && unreadCount > 0
      ? filtered.findIndex((c) => c.isUnread)
      : -1;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Composer */}
      <CommentForm entityType={entityType} entityId={entityId} onSubmit={handleSubmit} />

      {/* Filter strip — only once there are comments */}
      {topLevel.length > 0 && (
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {tabs.map((tab) => {
            const count    = counts[tab.key];
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn("tabular-nums text-[10px]", isActive ? "opacity-80" : "opacity-60")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>
      )}

      {/* Comment list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {filter === "all"
            ? "No comments yet. Be the first to comment!"
            : `No ${tabs.find((t) => t.key === filter)?.label.toLowerCase()} comments.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((comment, idx) => (
            <div key={comment.id}>
              {/* Unread divider — appears before the first unread comment */}
              {idx === unreadDividerBeforeIdx && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {unreadCount} new since you last viewed
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {renderCard({ comment, depth: 0, entityType, entityId, renderCard })}
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
