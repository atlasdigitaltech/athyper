"use client";

import {
  Reply,
  Pencil,
  Trash2,
  Flag,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";
import { useState, useCallback } from "react";

import { CommentForm } from "./CommentForm";
import { CommentReactions } from "./CommentReactions";
import { CommentThread, MAX_DEPTH } from "./CommentThread";

import type { EntityComment } from "@/lib/collab";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCommentActions } from "@/lib/collab";
import { cn } from "@/lib/utils";

export interface CommentCardProps {
  comment: EntityComment;
  depth: number;
  entityType: string;
  entityId: string;
  onMutate?: () => void;
  renderCard: (props: CommentCardProps) => React.ReactNode;
}

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
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function CommentCard({
  comment,
  depth,
  entityType,
  entityId,
  onMutate,
  renderCard,
}: CommentCardProps) {
  const [showReply, setShowReply] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.commentText);
  const [showActions, setShowActions] = useState(false);

  const { updateComment, deleteComment, createReply } = useCommentActions();

  const handleReply = useCallback(
    async (text: string) => {
      await createReply(comment.id, text);
      setShowReply(false);
      onMutate?.();
    },
    [comment.id, createReply, onMutate],
  );

  const handleEdit = useCallback(async () => {
    if (!editText.trim()) return;
    await updateComment(comment.id, editText.trim());
    setIsEditing(false);
    onMutate?.();
  }, [comment.id, editText, updateComment, onMutate]);

  const handleDelete = useCallback(async () => {
    await deleteComment(comment.id);
    onMutate?.();
  }, [comment.id, deleteComment, onMutate]);

  return (
    <div key={comment.id} className="group">
      <div className="flex gap-3">
        {/* Avatar */}
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="text-xs">
            {getInitials(comment.commenterName)}
          </AvatarFallback>
        </Avatar>

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
                <Button size="icon-xs" onClick={handleEdit}>
                  <Check className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
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
          <div
            className={cn(
              "mt-1 flex items-center gap-1 transition-opacity",
              showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            {depth < MAX_DEPTH && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowReply((v) => !v)}
              >
                <Reply className="size-3" />
                Reply
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="size-3" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
            <Button type="button" variant="ghost" size="xs">
              <Flag className="size-3" />
              Flag
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowActions((v) => !v)}
              className="ml-auto md:hidden"
            >
              <MoreHorizontal className="size-3" />
            </Button>
          </div>

          {/* Reply form */}
          {showReply && (
            <div className="mt-3">
              <CommentForm
                entityType={entityType}
                entityId={entityId}
                parentCommentId={comment.id}
                onSubmit={handleReply}
                onCancel={() => setShowReply(false)}
                placeholder="Write a reply..."
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
