"use client";

import { useEffect, useState } from "react";

/**
 * Approval Comment Type
 */
interface ApprovalComment {
  id: string;
  approvalInstanceId: string;
  approvalTaskId?: string;
  commentText: string;
  commenterId: string;
  commenterDisplayName?: string;
  createdAt: string;
}

/**
 * Approval Comment Section Props
 */
interface ApprovalCommentSectionProps {
  approvalInstanceId: string;
  approvalTaskId?: string;
  currentUserId?: string;
}

/**
 * Approval Comment Item Component
 */
function ApprovalCommentItem({ comment }: { comment: ApprovalComment }) {
  return (
    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center">
          <span className="text-xs font-medium text-white">
            {(comment.commenterDisplayName || comment.commenterId).charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-sm font-medium text-gray-900">
          {comment.commenterDisplayName || comment.commenterId}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
        {comment.approvalTaskId && (
          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
            Task: {comment.approvalTaskId.substring(0, 8)}...
          </span>
        )}
      </div>

      {/* Comment Text */}
      <p className="text-sm text-gray-700 whitespace-pre-wrap ml-9">{comment.commentText}</p>
    </div>
  );
}

/**
 * Approval Comment Input Component
 */
function ApprovalCommentInput({
  approvalInstanceId,
  approvalTaskId,
  onCommentCreated,
}: {
  approvalInstanceId: string;
  approvalTaskId?: string;
  onCommentCreated: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const maxLength = 5000;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commentText.trim()) {
      setError("Comment cannot be empty");
      return;
    }

    if (commentText.length > maxLength) {
      setError(`Comment exceeds maximum length of ${maxLength} characters`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Upload files first (if any)
      const attachmentIds: string[] = [];

      if (selectedFiles.length > 0) {
        // TODO: Implement file upload API endpoint
        // For each file, upload to /api/content/upload and collect attachment IDs
        // Example:
        // for (const file of selectedFiles) {
        //   const formData = new FormData();
        //   formData.append("file", file);
        //   formData.append("kind", "attachment");
        //   const uploadRes = await fetch("/api/content/upload", {
        //     method: "POST",
        //     body: formData,
        //   });
        //   const uploadData = await uploadRes.json();
        //   attachmentIds.push(uploadData.id);
        // }
        console.warn("File upload not yet implemented. Files:", selectedFiles);
      }

      const res = await fetch("/api/collab/approval-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          approvalInstanceId,
          approvalTaskId,
          commentText,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create comment");
      }

      setCommentText("");
      setSelectedFiles([]);
      onCommentCreated();
    } catch (err) {
      console.error("Approval comment submit error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit comment");
    } finally {
      setSubmitting(false);
    }
  };

  const remainingChars = maxLength - commentText.length;
  const isNearLimit = remainingChars < 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Textarea */}
      <div>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a comment to this approval workflow..."
          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[80px]"
          disabled={submitting}
          maxLength={maxLength}
        />

        {/* Character Counter */}
        <div className={`text-xs text-right mt-1 ${isNearLimit ? "text-red-600" : "text-gray-500"}`}>
          {remainingChars.toLocaleString()} characters remaining
        </div>
      </div>

      {/* File Attachments */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Attachments (optional)
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          disabled={submitting}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        {selectedFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded text-sm"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg
                    className="w-4 h-4 text-blue-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                  <span className="truncate">{file.name}</span>
                  <span className="text-blue-600 text-xs flex-shrink-0">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={submitting}
                  className="ml-2 text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting || !commentText.trim()}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Posting...
          </span>
        ) : (
          <span>Post Comment</span>
        )}
      </button>
    </form>
  );
}

/**
 * Approval Comment Section Component
 *
 * Displays approval workflow comments with create functionality.
 * Comments are shown in chronological order (oldest first) to maintain discussion flow.
 */
export function ApprovalCommentSection({
  approvalInstanceId,
  approvalTaskId,
  currentUserId,
}: ApprovalCommentSectionProps) {
  const [comments, setComments] = useState<ApprovalComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParts: string[] = [];
      if (approvalTaskId) {
        queryParts.push(`taskId=${encodeURIComponent(approvalTaskId)}`);
      }
      const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

      const url = `/api/collab/approval-comments/${encodeURIComponent(
        approvalInstanceId
      )}${queryString}`;

      const res = await fetch(url, { credentials: "same-origin" });

      if (!res.ok) {
        throw new Error(`Failed to fetch approval comments: ${res.statusText}`);
      }

      const data = await res.json();
      setComments(data.data || []);
    } catch (err) {
      console.error("Approval comment fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [approvalInstanceId, approvalTaskId]);

  const handleCommentCreated = () => {
    fetchComments();
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-pulse">Loading approval comments...</div>
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Approval Discussion ({comments.length})
        </h3>
        {approvalTaskId && (
          <span className="text-sm text-gray-500">
            Filtered to task: {approvalTaskId.substring(0, 8)}...
          </span>
        )}
      </div>

      {/* Create Comment Form */}
      <ApprovalCommentInput
        approvalInstanceId={approvalInstanceId}
        approvalTaskId={approvalTaskId}
        onCommentCreated={handleCommentCreated}
      />

      {/* Comment List */}
      {comments.length === 0 ? (
        <div className="p-4 text-center text-gray-500 bg-blue-50 border border-blue-200 rounded-lg">
          <p>No comments yet. Start the discussion by adding a comment above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map((comment) => (
            <ApprovalCommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
}
