"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Check, CheckCheck, MessageSquarePlus, SlidersHorizontal, X } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { DRAWER_CONTROL } from "@athyper/ui/typography";
import { cn } from "@athyper/theme/utils";
import {
  useComments,
  useCommentActions,
  useCollabUnreadCount,
  useCommentIntents,
  type CommentsPage,
} from "../hooks/collab";
import { CommentCard, type CommentCardProps } from "./comment-card";
import { CommentForm } from "./comment-form";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "me" | "unread";
const EMPTY_INTENT_OPTIONS: NonNullable<CommentsPage["config"]>["intents"] = [];

export interface CommentListProps {
  entityType: string;
  entityId: string;
  className?: string;
  onCountChange?: (count: number) => void;
  searchOpen?: boolean;
  showFilters?: boolean;
  /** Canonical workspace response. When supplied, no local list request runs. */
  page?: CommentsPage;
  pageLoading?: boolean;
  pageError?: Error | null;
  onRefresh?: () => void | Promise<unknown>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommentList({
  entityType,
  entityId,
  className,
  onCountChange,
  searchOpen,
  showFilters,
  page,
  pageLoading,
  pageError,
  onRefresh,
}: CommentListProps) {
  const [activeIntents, setActiveIntents] = useState<string[]>([]);
  const externallyManaged = onRefresh !== undefined;
  const localComments = useComments(entityType, entityId, { enabled: !externallyManaged });
  const comments = page?.data ?? localComments.comments;
  const hasMore = page?.hasMore ?? localComments.hasMore;
  const isLoading = externallyManaged ? Boolean(pageLoading) : localComments.isLoading;
  const error = externallyManaged ? pageError : localComments.error;
  const refresh = useCallback(async () => {
    if (onRefresh) await onRefresh();
    else await localComments.refetch();
  }, [localComments.refetch, onRefresh]);
  const { createComment }                                 = useCommentActions(entityType, entityId);
  const { unreadCount, markAllAsRead }                    = useCollabUnreadCount(entityType, entityId, {
    initialCount: page?.unreadCount,
    queryEnabled: !externallyManaged,
    onMarkedRead: refresh,
  });
  const { intents: intentOptions }                        = useCommentIntents(
    externallyManaged ? (page?.config?.intents ?? EMPTY_INTENT_OPTIONS) : undefined,
  );
  const [filter, setFilter]                               = useState<FilterMode>("all");
  const [composerOpen, setComposerOpen]                   = useState(false);
  const [internalOnly, setInternalOnly]                   = useState(false);
  const [searchQuery, setSearchQuery]                     = useState("");
  const searchInputRef                                    = useRef<HTMLInputElement>(null);

  const toggleIntent = useCallback((code: string) => {
    setActiveIntents((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  useEffect(() => {
    onCountChange?.(page?.count ?? localComments.count ?? comments.length);
  }, [comments.length, localComments.count, onCountChange, page?.count]);

  const topLevel = useMemo(
    () => comments.filter((c) => !c.parentCommentId),
    [comments],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "me":       return topLevel.filter((c) => c.commenterRole === "me");
      case "unread":   return topLevel.filter((c) => c.isUnread);
      default:         return topLevel;
    }
  }, [topLevel, filter]);

  const visibilityFiltered = useMemo(
    () => {
      const intentFiltered = activeIntents.length > 0
        ? filtered.filter((comment) => activeIntents.includes(comment.commentIntent ?? "general"))
        : filtered;
      return internalOnly
        ? intentFiltered.filter((comment) => comment.visibility === "internal")
        : intentFiltered;
    },
    [activeIntents, filtered, internalOnly],
  );

  const displayed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibilityFiltered;
    return visibilityFiltered.filter(
      (c) =>
        (c.commentText ?? "").toLowerCase().includes(q) ||
        (c.contentHtml ?? "").toLowerCase().includes(q),
    );
  }, [visibilityFiltered, searchQuery]);

  const handleSubmit = useCallback(
    async (text: string, attachmentIds: string[], contentJson?: unknown, contentHtml?: string, visibility?: string) => {
      await createComment({ commentText: text, attachmentIds, contentJson, contentHtml, visibility });
      setComposerOpen(false);
      await refresh();
    },
    [createComment, refresh],
  );

  const renderCard = useCallback(
    (props: CommentCardProps) => (
      <CommentCard key={props.comment.id} {...props} onMutated={refresh} renderCard={renderCard} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh],
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
        <button type="button" className="underline hover:no-underline" onClick={() => void refresh()}>
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
  ];
  const filterableIntentOptions = intentOptions.filter((option) => option.code !== "general");
  const activeFilterCount = activeIntents.length + Number(internalOnly);
  // Keep the controls available when a selected filter has no matches, so it can be cleared.
  const showFilterControls =
    showFilters !== false && (topLevel.length > 0 || activeFilterCount > 0);
  const clearFilters = () => {
    setActiveIntents([]);
    setInternalOnly(false);
  };

  // Position of the unread divider: insert it before the first unread comment.
  // Comments are newest-first from the server, so unread sit at the top.
  const unreadDividerBeforeIdx =
    filter === "all" && unreadCount > 0 && !searchQuery
      ? displayed.findIndex((c) => c.isUnread)
      : -1;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Draft/config loading starts only after the user opens the composer. */}
      {composerOpen ? (
        <CommentForm
          entityType={entityType}
          entityId={entityId}
          onSubmit={handleSubmit}
          onCancel={() => setComposerOpen(false)}
          autoFocus
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => setComposerOpen(true)}
        >
          <MessageSquarePlus className="size-4" />
          Add a comment
        </Button>
      )}

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

      {/* Primary views plus the type and visibility filters. */}
      {showFilterControls && (
        <div className="space-y-2 border-b border-border pb-2">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const isActive = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-base font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}

            {filterableIntentOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-base font-medium transition-colors",
                      activeFilterCount > 0
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="rounded-full bg-foreground px-1.5 text-xs leading-4 text-background">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  sideOffset={8}
                  align="end"
                  className="max-h-80 w-72 overflow-y-auto p-2"
                >
                  <p className="px-2 py-1 text-sm font-medium text-muted-foreground">Type</p>
                  <div className="grid gap-0.5">
                    {filterableIntentOptions.map((option) => {
                      const active = activeIntents.includes(option.code);
                      return (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => toggleIntent(option.code)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-base hover:bg-muted"
                        >
                          <span className={cn(
                            "flex size-4 items-center justify-center rounded border",
                            active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}>
                            {active && <Check className="size-3" />}
                          </span>
                          <span title={option.description ?? option.name}>{option.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 px-2 py-1 text-sm font-medium text-muted-foreground">Visibility</p>
                  <button
                    type="button"
                    onClick={() => setInternalOnly((value) => !value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base hover:bg-muted"
                  >
                    <span className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      internalOnly ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}>
                      {internalOnly && <Check className="size-3" />}
                    </span>
                    Internal
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-base text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Clear filters
                    </button>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className={cn("ml-auto flex items-center gap-1 hover:text-foreground", DRAWER_CONTROL)}
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filterableIntentOptions
                .filter((option) => activeIntents.includes(option.code))
                .map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => toggleIntent(option.code)}
                    className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-base font-medium text-primary hover:bg-primary/15"
                  >
                    {option.name}
                    <X className="size-3" />
                  </button>
                ))}
              {internalOnly && (
                <button
                  type="button"
                  onClick={() => setInternalOnly(false)}
                  className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-base font-medium text-primary hover:bg-primary/15"
                >
                  Internal
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Comment list */}
      {displayed.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {searchQuery
            ? `No comments match "${searchQuery}".`
            : filter === "all" && activeFilterCount === 0
              ? "No comments yet. Be the first to comment!"
              : "No comments match these filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((comment, idx) => (
            <div key={comment.id}>
              {/* Unread divider — appears before the first unread comment */}
              {idx === unreadDividerBeforeIdx && (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className={cn("shrink-0", DRAWER_CONTROL)}>
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
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
