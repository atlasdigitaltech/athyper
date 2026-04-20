"use client";

/**
 * CommentCard — Single comment with edit/delete/reply/reaction actions.
 *
 * Uses a recursive `renderCard` prop to render threaded replies
 * without circular module imports.
 */

import { useState, useCallback } from "react";
import { Reply, Pencil, Trash2, Flag, Check, X, Loader2 } from "lucide-react";

import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { getCsrfToken } from "../utils/csrf";
import { useCommentActions, type EntityComment } from "../hooks/collab";

// ── Flag reasons ──────────────────────────────────────────────────────────────

const FLAG_REASONS = [
  { value: "spam",         label: "Spam" },
  { value: "harassment",   label: "Harassment" },
  { value: "misinformation", label: "Misinformation" },
  { value: "off_topic",    label: "Off-topic" },
  { value: "other",        label: "Other" },
] as const;

type FlagReason = typeof FLAG_REASONS[number]["value"];

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
  const [showFlag, setShowFlag] = useState(false);
  const [flagReason, setFlagReason] = useState<FlagReason>("spam");
  const [flagNote, setFlagNote] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);
  const [flagDone, setFlagDone] = useState(false);

  const { replyToComment, updateComment, deleteComment } = useCommentActions(entityType, entityId);

  const handleFlag = useCallback(async () => {
    setIsFlagging(true);
    try {
      await fetch(`/api/collab/comments/${comment.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ flagReason, note: flagNote || undefined }),
      });
      setFlagDone(true);
      setShowFlag(false);
    } finally {
      setIsFlagging(false);
    }
  }, [comment.id, flagReason, flagNote]);

  const handleReply = useCallback(
    async (text: string) => {
      await replyToComment({ parentId: comment.id, commentText: text });
      setShowReply(false);
    },
    [comment.id, replyToComment],
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
            {!flagDone ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowFlag((v) => !v)}
              >
                <Flag className="mr-1 size-3" />
                Flag
              </Button>
            ) : (
              <span className="h-6 px-2 text-xs text-muted-foreground flex items-center">
                <Flag className="mr-1 size-3 text-warning" />
                Flagged
              </span>
            )}
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

          {/* Inline flag form */}
          {showFlag && (
            <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
              <p className="text-xs font-medium text-warning">Report this comment</p>
              <div className="flex gap-2 flex-wrap">
                {FLAG_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setFlagReason(r.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      flagReason === r.value
                        ? "border-warning bg-warning/10 text-warning font-medium"
                        : "text-muted-foreground hover:border-warning/50",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="Additional context (optional)"
                rows={2}
                className="w-full rounded-md border bg-background p-2 text-xs"
              />
              <div className="flex gap-1 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowFlag(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-6 px-2 text-xs bg-warning text-warning-foreground hover:bg-warning/90"
                  onClick={() => void handleFlag()}
                  disabled={isFlagging}
                >
                  {isFlagging ? <Loader2 className="size-3 animate-spin" /> : "Submit report"}
                </Button>
              </div>
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
