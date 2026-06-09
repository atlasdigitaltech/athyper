"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Loader2, CheckCheck, X } from "lucide-react";
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
  searchOpen?: boolean;
  showFilters?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommentList({ entityType, entityId, className, onCountChange, searchOpen, showFilters }: CommentListProps) {
  const { comments, hasMore, isLoading, error, refetch } = useComments(entityType, entityId);
  const { createComment }                                 = useCommentActions(entityType, entityId);
  const { unreadCount, markAllAsRead }                    = useCollabUnreadCount(entityType, entityId);
  const [filter, setFilter]                               = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery]                     = useState("");
  const searchInputRef                                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

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

  const displayed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (c) =>
        (c.commentText ?? "").toLowerCase().includes(q) ||
        (c.contentHtml ?? "").toLowerCase().includes(q),
    );
  }, [filtered, searchQuery]);

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
    filter === "all" && unreadCount > 0 && !searchQuery
      ? displayed.findIndex((c) => c.isUnread)
      : -1;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Composer */}
      <CommentForm entityType={entityType} entityId={entityId} onSubmit={handleSubmit} />

      {/* Search bar — shown when parent toggles searchOpen */}
      {searchOpen && (
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search comments…"
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 pr-8 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Filter strip — gated by showFilters prop (default on); only when there are comments */}
      {topLevel.length > 0 && showFilters !== false && (
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
                  <span className={cn("tabular-nums text-xs", isActive ? "opacity-80" : "opacity-60")}>
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
      {displayed.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {searchQuery
            ? `No comments match "${searchQuery}".`
            : filter === "all"
              ? "No comments yet. Be the first to comment!"
              : `No ${tabs.find((t) => t.key === filter)?.label.toLowerCase()} comments.`}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((comment, idx) => (
            <div key={comment.id}>
              {/* Unread divider — appears before the first unread comment */}
              {idx === unreadDividerBeforeIdx && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
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
