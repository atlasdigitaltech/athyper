"use client";

/**
 * CommentCard — Single comment with edit/delete/reply/reaction actions.
 *
 * Uses a recursive `renderCard` prop to render threaded replies
 * without circular module imports.
 */

import { useState, useCallback } from "react";
import { Reply, Pencil, Trash2, Flag, Check, X } from "lucide-react";

import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useCommentActions, type EntityComment } from "../hooks/collab";

import { CommentForm } from "./CommentForm";
import { CommentReactions } from "./CommentReactions";
import { CommentThread, MAX_DEPTH, type CommentCardProps } from "./CommentThread";

export type { CommentCardProps };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommentCard({
  comment,
  depth,
  entityType,
  entityId,
  renderCard,
}: CommentCardProps) {
  const [showReply, setShowReply] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.commentText);

  const { updateComment, deleteComment } = useCommentActions(entityType, entityId);

  const handleReply = useCallback(
    async (text: string) => {
      await updateComment({ id: comment.id, commentText: text });
      setShowReply(false);
    },
    [comment.id, updateComment],
  );

  const handleEdit = useCallback(async () => {
    if (!editText.trim()) return;
    await updateComment({ id: comment.id, commentText: editText.trim() });
    setIsEditing(false);
  }, [comment.id, editText, updateComment]);

  const handleDelete = useCallback(async () => {
    await deleteComment({ id: comment.id });
  }, [comment.id, deleteComment]);

  return (
    <div className="group">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {getInitials(comment.commenterName)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {comment.commenterName ?? "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground">
              {timeAgo(comment.createdAt)}
            </span>
            {comment.updatedAt && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>

          {/* Body */}
          {isEditing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full rounded-md border bg-background p-2 text-sm"
                rows={3}
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={handleEdit} className="size-6 p-0">
                  <Check className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0"
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.commentText);
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-sm">
              {comment.commentText}
            </p>
          )}

          {/* Reactions */}
          <div className="mt-2">
            <CommentReactions commentId={comment.id} />
          </div>

          {/* Action bar */}
          <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {depth < MAX_DEPTH && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowReply((v) => !v)}
              >
                <Reply className="mr-1 size-3" />
                Reply
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="mr-1 size-3" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-1 size-3" />
              Delete
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
            >
              <Flag className="mr-1 size-3" />
              Flag
            </Button>
          </div>

          {/* Inline reply form */}
          {showReply && (
            <div className="mt-3">
              <CommentForm
                entityType={entityType}
                entityId={entityId}
                parentCommentId={comment.id}
                onSubmit={handleReply}
                onCancel={() => setShowReply(false)}
                placeholder="Write a reply…"
                autoFocus
              />
            </div>
          )}

          {/* Threaded replies */}
          {(comment.replyCount ?? 0) > 0 && (
            <CommentThread
              parentId={comment.id}
              depth={depth}
              entityType={entityType}
              entityId={entityId}
              replyCount={comment.replyCount}
              renderCard={renderCard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
