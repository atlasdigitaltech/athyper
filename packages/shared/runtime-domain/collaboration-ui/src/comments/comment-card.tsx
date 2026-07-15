"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Reply, Pencil, Trash2, Flag, Check, Loader2, MoreHorizontal, Link2, Globe, Lock } from "lucide-react";
import type { JSONContent } from "@tiptap/core";

import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import { useCommentActions, type EntityComment } from "../hooks/collab";

import { CommentForm } from "./comment-form";
import { CommentReactions } from "./comment-reactions";
import { CommentThread, MAX_DEPTH, type CommentCardProps } from "./comment-thread";
import { IntentBadge } from "./intent-badge";
import { RichCommentComposer } from "./rich-comment-composer";
import { RichCommentRenderer } from "./rich-comment-renderer";
import { useCommentAttachmentList } from "../hooks/attachments";
import { RenderedAttachmentChip, RenderedImageChip } from "../attachments/attachment-chip";

export type { CommentCardProps };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)  return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)     return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Role chip — semantic tokens only, no hardcoded colors ────────────────────

const ROLE_CHIP: Record<string, string> = {
  admin:    "border-border/60 bg-muted text-muted-foreground",
  supplier: "border-warning/30 bg-warning/10 text-warning",
  approver: "border-primary/30 bg-primary/10 text-primary",
  partner:  "border-secondary/30 bg-secondary/10 text-secondary-foreground",
};

function RoleChip({ role }: { role: string }) {
  const cls = ROLE_CHIP[role.toLowerCase()] ?? "border-border/60 bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium leading-none", cls)}>
      {role}
    </span>
  );
}

// ── Visibility chip — semantic tokens, shown only for non-internal ────────────

function VisibilityChip({ visibility }: { visibility: string }) {
  if (!visibility || visibility === "internal") return null;
  if (visibility === "public") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success leading-none">
        <Globe className="size-2.5" />Public
      </span>
    );
  }
  if (visibility === "private") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning leading-none">
        <Lock className="size-2.5" />Private
      </span>
    );
  }
  return null;
}

// ── Attachments strip ─────────────────────────────────────────────────────────

function CommentAttachments({ commentId }: { commentId: string }) {
  const { items, isLoading } = useCommentAttachmentList(commentId);
  if (isLoading || items.length === 0) return null;

  const images = items.filter((i) => i.contentType.startsWith("image/"));
  const files  = items.filter((i) => !i.contentType.startsWith("image/"));

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((item) => <RenderedImageChip key={item.attachmentId} item={item} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((item) => <RenderedAttachmentChip key={item.attachmentId} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ── Flag reasons ──────────────────────────────────────────────────────────────

const FLAG_REASONS = [
  { value: "spam",           label: "Spam" },
  { value: "harassment",     label: "Harassment" },
  { value: "misinformation", label: "Misinformation" },
  { value: "off_topic",      label: "Off-topic" },
  { value: "other",          label: "Other" },
] as const;

type FlagReason = typeof FLAG_REASONS[number]["value"];

// ── Overflow menu (⋯) — Edit / Copy link / Flag / --- / Delete ───────────────

function OverflowMenu({
  onEdit,
  onFlag,
  onDelete,
  commentId,
}: {
  onEdit():    void;
  onFlag():    void;
  onDelete():  void;
  commentId:   string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopyLink = async () => {
    const url = `${window.location.href.split("#")[0]}#comment-${commentId}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-30 min-w-[150px] rounded-md border border-border bg-popover py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <Pencil className="size-3.5" />Edit
          </button>
          <button
            type="button"
            onClick={() => { void handleCopyLink(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <Link2 className="size-3.5" />Copy link
          </button>
          <button
            type="button"
            onClick={() => { onFlag(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <Flag className="size-3.5" />Flag
          </button>

          {/* Divider before destructive action */}
          <div className="my-1 border-t border-border" />

          <button
            type="button"
            onClick={() => { onDelete(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── CommentCard ───────────────────────────────────────────────────────────────

export function CommentCard({
  comment,
  depth,
  entityType,
  entityId,
  renderCard,
}: CommentCardProps) {
  const [showReply, setShowReply]   = useState(false);
  const [isEditing, setIsEditing]   = useState(false);
  const [showFlag, setShowFlag]     = useState(false);
  const [flagReason, setFlagReason] = useState<FlagReason>("spam");
  const [flagNote, setFlagNote]     = useState("");
  const [isFlagging, setIsFlagging] = useState(false);
  const [flagDone, setFlagDone]     = useState(false);
  const [hasReplied, setHasReplied] = useState(false);

  const { replyToComment, updateComment, deleteComment } = useCommentActions(entityType, entityId);

  const handleFlag = useCallback(async () => {
    setIsFlagging(true);
    try {
      await fetch(`/api/collab/comments/${comment.id}/flag`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ flagReason, note: flagNote || undefined }),
      });
      setFlagDone(true);
      setShowFlag(false);
    } finally { setIsFlagging(false); }
  }, [comment.id, flagReason, flagNote]);

  const handleReply = useCallback(
    async (text: string, attachmentIds: string[], contentJson?: JSONContent, contentHtml?: string, visibility?: string) => {
      await replyToComment({ parentId: comment.id, commentText: text, attachmentIds, contentJson, contentHtml, visibility });
      setHasReplied(true);
      setShowReply(false);
    },
    [comment.id, replyToComment],
  );

  const handleEditSave = useCallback(
    async (text: string, _attachmentIds: string[], contentJson?: JSONContent, contentHtml?: string) => {
      await updateComment({ id: comment.id, commentText: text, contentJson, contentHtml });
      setIsEditing(false);
    },
    [comment.id, updateComment],
  );

  const handleDelete = useCallback(async () => {
    await deleteComment({ id: comment.id });
  }, [comment.id, deleteComment]);

  const richComment = comment as EntityComment & { contentFormat?: string; contentHtml?: string | null };

  return (
    <div
      id={`comment-${comment.id}`}
      className={cn(
        "group relative",
        depth === 0 && "rounded-lg border border-border bg-card p-4 shadow-2xs",
        // Slim primary left bar for unread comments
        depth === 0 && comment.isUnread && "border-l-[3px] border-l-primary/75",
      )}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {getInitials(comment.commenterName)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">

          {/* Header row: name · role chip · time · edited + ⋯ menu */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-foreground leading-snug">
                {comment.commenterName ?? "Unknown"}
              </span>
              {comment.commenterRole && <RoleChip role={comment.commenterRole} />}
              <IntentBadge intent={comment.commentIntent} />
              <VisibilityChip visibility={comment.visibility} />
              <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
              {comment.updatedAt && (
                <span className="text-xs text-muted-foreground">· edited</span>
              )}
            </div>

            {/* ⋯ overflow menu — visible on card hover */}
            {!isEditing && (
              <OverflowMenu
                commentId={comment.id}
                onEdit={() => setIsEditing(true)}
                onFlag={() => setShowFlag((v) => !v)}
                onDelete={() => void handleDelete()}
              />
            )}
          </div>

          {/* Body */}
          {isEditing ? (
            <div className="mt-2">
              <RichCommentComposer
                entityType={entityType}
                entityId={entityId}
                onSubmit={handleEditSave}
                onCancel={() => setIsEditing(false)}
                placeholder="Edit your comment…"
                autoFocus
                initialContent={
                  (comment as { contentJson?: JSONContent }).contentJson ?? comment.commentText
                }
              />
            </div>
          ) : (
            <RichCommentRenderer
              commentText={comment.commentText}
              contentHtml={richComment.contentHtml}
              contentFormat={richComment.contentFormat}
            />
          )}

          {/* Attachments */}
          {!isEditing && <CommentAttachments commentId={comment.id} />}

          {/* Reactions + Reply */}
          {!isEditing && (
            <div className="mt-2 flex items-center gap-3">
              <CommentReactions commentId={comment.id} />
              {depth < MAX_DEPTH && (
                <button
                  type="button"
                  onClick={() => setShowReply((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Reply className="size-3" />Reply
                </button>
              )}
              {flagDone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Flag className="size-3 text-warning" />Flagged
                </span>
              )}
            </div>
          )}

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

          {/* Flag form */}
          {showFlag && (
            <div className="mt-2 space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-medium text-warning">Report this comment</p>
              <div className="flex flex-wrap gap-2">
                {FLAG_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setFlagReason(r.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      flagReason === r.value
                        ? "border-warning bg-warning/10 font-medium text-warning"
                        : "border-border text-muted-foreground hover:border-warning/50",
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
                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => setShowFlag(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="warning" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => void handleFlag()} disabled={isFlagging}>
                  {isFlagging ? <Loader2 className="size-3 animate-spin" /> : "Submit report"}
                </Button>
              </div>
            </div>
          )}

          {/* Threaded replies */}
          {((comment.replyCount ?? 0) > 0 || hasReplied) && (
            <CommentThread
              parentId={comment.id}
              depth={depth}
              entityType={entityType}
              entityId={entityId}
              replyCount={hasReplied ? Math.max(1, comment.replyCount ?? 0) : comment.replyCount}
              renderCard={renderCard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
