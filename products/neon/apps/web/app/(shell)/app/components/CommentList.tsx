"use client";

import { useEffect, useState } from "react";

import { AttachmentPreview } from "./AttachmentPreview";
import { CommentInput } from "./CommentInput";
import { CommentReactions } from "./CommentReactions";
import { FlagCommentModal } from "./FlagCommentModal";
import { MarkdownContent } from "./MarkdownContent";
import { NewCommentsBanner } from "./NewCommentsBanner";
import { useCommentEvents } from "./useCommentEvents";

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
 * Comment Type
 */
interface Comment {
  id: string;
  commentText: string;
  commenterId: string;
  commenterDisplayName?: string;
  createdAt: string;
  updatedAt?: string;
  visibility: CommentVisibility;
  attachments?: Attachment[];
  reactions?: ReactionSummary[];
  isUnread?: boolean;
  isHidden?: boolean;
  flagCount?: number;
}

/**
 * Comment List Props
 */
interface CommentListProps {
  entityType: string;
  entityId: string;
  currentUserId?: string;
}

/**
 * Comment Item Component
 */
function CommentItem({
  comment,
  currentUserId,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  currentUserId?: string;
  onEdit: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
}) {
  const isOwner = currentUserId === comment.commenterId;
  const isEdited = comment.updatedAt && comment.updatedAt !== comment.createdAt;
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
        setTimeout(() => setHighlighted(false), 3000); // Remove highlight after 3s
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

  return (
    <div
      id={`comment-${comment.id}`}
      className={`p-4 border rounded-lg hover:shadow-sm transition-all ${
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
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-gray-600">
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
              Hidden by moderator
            </span>
          )}
          {/* Flag Count Badge (for moderators) */}
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
              <button
                onClick={() => onEdit(comment)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Delete
              </button>
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
        <div className="mt-3 space-y-3">
          {comment.attachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}

      {/* Reactions */}
      <div className="mt-3">
        <CommentReactions
          commentId={comment.id}
          initialReactions={comment.reactions || []}
        />
      </div>
    </div>
  );
}

/**
 * Comment List Component
 *
 * Displays a list of comments for an entity with create/edit/delete functionality.
 */
export function CommentList({
  entityType,
  entityId,
  currentUserId,
}: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  // Real-time updates via SSE
  const { hasNewComments, newCommentCount, clearNewComments } = useCommentEvents(
    entityType,
    entityId
  );

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = `/api/collab/comments?entityType=${encodeURIComponent(
        entityType
      )}&entityId=${encodeURIComponent(entityId)}`;

      const res = await fetch(url, { credentials: "same-origin" });

      if (!res.ok) {
        throw new Error(`Failed to fetch comments: ${res.statusText}`);
      }

      const data = await res.json();
      setComments(data.data || []);
    } catch (err) {
      console.error("Comment fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [entityType, entityId]);

  const handleCommentCreated = () => {
    fetchComments();
    setEditingComment(null);
  };

  const handleEdit = (comment: Comment) => {
    setEditingComment(comment);
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) {
      return;
    }

    try {
      const res = await fetch(`/api/collab/comments/${commentId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      if (!res.ok) {
        throw new Error("Failed to delete comment");
      }

      await fetchComments();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete comment");
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
  };

  const handleRefreshComments = () => {
    fetchComments();
    clearNewComments();
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-pulse">Loading comments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Comments ({comments.length})
      </h3>

      {/* New Comments Banner */}
      {hasNewComments && (
        <NewCommentsBanner
          count={newCommentCount}
          onRefresh={handleRefreshComments}
          onDismiss={clearNewComments}
        />
      )}

      {/* Create/Edit Comment Form */}
      <CommentInput
        entityType={entityType}
        entityId={entityId}
        onCommentCreated={handleCommentCreated}
        editingComment={editingComment}
        onCancelEdit={handleCancelEdit}
      />

      {/* Comment List */}
      {comments.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <p>No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
