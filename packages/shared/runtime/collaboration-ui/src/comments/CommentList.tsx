"use client";

/**
 * CommentList — Full comment panel for an entity record.
 *
 * Shows: new comment form, threaded comments list, unread badge + mark-all-read.
 */

import { useCallback } from "react";
import { Loader2, MessageSquare, CheckCheck } from "lucide-react";

import { Button, Badge } from "@athyper/ui/primitives";
import { useComments, useCommentActions, useCollabUnreadCount } from "../hooks/collab";

import { CommentCard, type CommentCardProps } from "./CommentCard";
import { CommentForm } from "./CommentForm";

export interface CommentListProps {
  entityType: string;
  entityId: string;
  className?: string;
}

export function CommentList({ entityType, entityId, className }: CommentListProps) {
  const { comments, hasMore, isLoading, error, refetch } = useComments(
    entityType,
    entityId,
  );
  const { createComment } = useCommentActions(entityType, entityId);
  const { unreadCount, markAllAsRead } = useCollabUnreadCount(entityType, entityId);

  const handleSubmit = useCallback(
    async (text: string) => {
      await createComment({ commentText: text });
      refetch();
    },
    [createComment, refetch],
  );

  const renderCard = useCallback(
    (props: CommentCardProps) => (
      <CommentCard
        key={props.comment.id}
        {...props}
        renderCard={renderCard}
      />
    ),
    [],
  );

  const topLevelComments = comments.filter((c) => !c.parentCommentId);

  if (isLoading && comments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading comments…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load comments.
      </div>
    );
  }

  return (
    <div className={className} style={{ display: "contents" }}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
            {unreadCount > 0 && (
              <Badge variant="default" className="text-[10px]">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllAsRead()}>
              <CheckCheck className="mr-1.5 size-4" />
              Mark all read
            </Button>
          )}
        </div>

        {/* New comment form */}
        <CommentForm
          entityType={entityType}
          entityId={entityId}
          onSubmit={handleSubmit}
        />

        {/* Comment list */}
        {topLevelComments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <div className="space-y-4">
            {topLevelComments.map((comment) =>
              renderCard({
                comment,
                depth: 0,
                entityType,
                entityId,
                renderCard,
              }),
            )}
          </div>
        )}

        {hasMore && (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Load more comments
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
