"use client";

import { useState, useEffect } from "react";

import { AttachmentPreview } from "./AttachmentPreview";
import { CommentInput } from "./CommentInput";
import { CommentReactions } from "./CommentReactions";
import { FlagCommentModal } from "./FlagCommentModal";
import { MarkdownContent } from "./MarkdownContent";

/**
 * Attachment Type
 */
interface Attachment {
  id: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
}

/**
 * Reaction Type
 */
type ReactionType = '👍' | '❤️' | '🎉' | '👀' | '👎' | '🚀' | '💡' | '🤔';

/**
 * Reaction Summary
 */
interface ReactionSummary {
  reactionType: ReactionType;
  count: number;
  userIds: string[];
  currentUserReacted: boolean;
}

/**
 * Comment Visibility
 */
type CommentVisibility = 'public' | 'internal' | 'private';

/**
 * Comment with nested replies
 */
interface ThreadedComment {
  id: string;
  commentText: string;
  commenterId: string;
  commenterDisplayName?: string;
  threadDepth: number;
  createdAt: string;
  updatedAt?: string;
  parentCommentId?: string;
  visibility: CommentVisibility;
  attachments?: Attachment[];
  reactions?: ReactionSummary[];
  isUnread?: boolean;
  isHidden?: boolean;
  flagCount?: number;
}

/**
 * Comment Thread Props
 */
interface CommentThreadProps {
  comment: ThreadedComment;
  entityType: string;
  entityId: string;
  currentUserId?: string;
  maxDepth?: number;
  onUpdate?: () => void;
}

/**
 * Single Comment with Replies
 *
 * Recursively renders comment and its replies with collapse/expand.
 */
export function CommentThread({
  comment,
  entityType,
  entityId,
  currentUserId,
  maxDepth = 5,
  onUpdate,
}: CommentThreadProps) {
  const [replies, setReplies] = useState<ThreadedComment[]>([]);
  const [showReplies, setShowReplies] = useState(true);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replyCount, setReplyCount] = useState(0);

  const isOwner = currentUserId === comment.commenterId;
  const isEdited = comment.updatedAt && comment.updatedAt !== comment.createdAt;
  const canReply = comment.threadDepth < maxDepth;
  const [highlighted, setHighlighted] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  // Detect if this comment is targeted by URL hash and scroll to it
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === `#comment-${comment.id}`) {
      const element = document.getElementById(`comment-${comment.id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlighted(true);
        setTimeout(() => setHighlighted(false), 3000);
      }
    }
  }, [comment.id]);

  // Copy permalink to clipboard
  const handleCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  /**
   * Fetch replies for this comment
   */
  const fetchReplies = async () => {
    if (replies.length > 0) return; // Already loaded

    setLoading(true);
    try {
      const res = await fetch(`/api/collab/comments/${comment.id}/replies`, {
        credentials: "same-origin",
      });

      if (res.ok) {
        const data = await res.json();
        setReplies(data.data || []);
        setReplyCount(data.meta?.total || 0);
      }
    } catch (err) {
      console.error("Failed to load replies:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load replies when expanding
   */
  useEffect(() => {
    if (showReplies && replies.length === 0) {
      fetchReplies();
    }
  }, [showReplies]);

  /**
   * Handle reply created
   */
  const handleReplyCreated = () => {
    setShowReplyForm(false);
    setReplies([]); // Clear to force reload
    fetchReplies();
    onUpdate?.();
  };

  const indentationClass = `ml-${Math.min(comment.threadDepth * 4, 16)}`;

  return (
    <div className={`${comment.threadDepth > 0 ? "ml-8 border-l-2 border-gray-200 pl-4" : ""}`}>
      {/* Comment Card */}
      <div
        id={`comment-${comment.id}`}
        className={`p-3 border rounded-lg hover:shadow-sm transition-all mb-3 ${
          comment.isHidden ? 'bg-gray-100 opacity-60' : 'bg-white'
        } ${comment.isUnread ? 'border-blue-400 border-l-4' : 'border-gray-200'} ${
          highlighted ? 'ring-2 ring-blue-400 bg-blue-50' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Unread Badge */}
            {comment.isUnread && (
              <div className="w-2 h-2 bg-blue-500 rounded-full" title="Unread" />
            )}
            <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-gray-600">
                {(comment.commenterDisplayName || comment.commenterId).charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {comment.commenterDisplayName || comment.commenterId}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(comment.createdAt).toLocaleString()}
              {isEdited && " (edited)"}
            </span>
            {comment.threadDepth > 0 && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Level {comment.threadDepth}
              </span>
            )}
            {/* Visibility Badge */}
            {comment.visibility === 'internal' && (
              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Internal
              </span>
            )}
            {comment.visibility === 'private' && (
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Private
              </span>
            )}
            {/* Hidden Badge */}
            {comment.isHidden && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded-full flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
                Hidden
              </span>
            )}
            {/* Flag Count Badge */}
            {comment.flagCount && comment.flagCount > 0 && (
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                {comment.flagCount} flag{comment.flagCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 items-center">
            {/* Copy Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="text-xs text-gray-600 hover:text-gray-800"
              title="Copy link to this comment"
            >
              {linkCopied ? (
                <span className="text-green-600">✓ Copied!</span>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )}
            </button>

            {/* Flag Button (non-owners) */}
            {!isOwner && (
              <button
                type="button"
                onClick={() => setFlagModalOpen(true)}
                className="text-xs text-gray-600 hover:text-red-600"
                title="Flag comment"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
              </button>
            )}

            {/* Owner Actions */}
            {isOwner && (
              <>
                <button type="button" className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                <button type="button" className="text-xs text-red-600 hover:text-red-800">Delete</button>
              </>
            )}
          </div>
        </div>

        {/* Flag Modal */}
        <FlagCommentModal
          commentId={comment.id}
          isOpen={flagModalOpen}
          onClose={() => setFlagModalOpen(false)}
        />

        {/* Comment Text */}
        {comment.isHidden ? (
          <div className="p-3 bg-gray-100 border border-gray-300 rounded text-sm text-gray-600 italic mb-2">
            This comment has been hidden by a moderator due to policy violations.
          </div>
        ) : (
          <MarkdownContent content={comment.commentText} className="mb-2" />
        )}

        {/* Attachments */}
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mb-3 space-y-3">
            {comment.attachments.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Reactions */}
        <div className="mb-3">
          <CommentReactions
            commentId={comment.id}
            initialReactions={comment.reactions || []}
          />
        </div>

        {/* Reply Actions */}
        <div className="flex items-center gap-3 text-xs">
          {canReply && (
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {showReplyForm ? "Cancel Reply" : "Reply"}
            </button>
          )}

          {replyCount > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="text-gray-600 hover:text-gray-800"
            >
              {showReplies ? "▼" : "►"} {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          )}

          {!canReply && comment.threadDepth >= maxDepth && (
            <span className="text-gray-400 italic">Max thread depth reached</span>
          )}
        </div>
      </div>

      {/* Reply Form */}
      {showReplyForm && canReply && (
        <div className="ml-8 mb-3">
          <CommentInput
            entityType={entityType}
            entityId={entityId}
            onCommentCreated={handleReplyCreated}
            // Note: This uses CommentInput which calls POST /api/collab/comments
            // We need to modify it to call POST /api/collab/comments/:id/replies instead
            // For now, this is a placeholder showing the UI structure
          />
          <div className="text-xs text-gray-500 mt-1">
            Note: Reply functionality requires API integration update
          </div>
        </div>
      )}

      {/* Nested Replies */}
      {showReplies && replies.length > 0 && (
        <div className="space-y-2">
          {replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              entityType={entityType}
              entityId={entityId}
              currentUserId={currentUserId}
              maxDepth={maxDepth}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && showReplies && (
        <div className="ml-8 text-sm text-gray-500 animate-pulse">Loading replies...</div>
      )}
    </div>
  );
}
