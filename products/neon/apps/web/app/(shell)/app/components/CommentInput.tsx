"use client";

import { useState, useEffect } from "react";

import { MarkdownEditor } from "./MarkdownEditor";

/**
 * Comment Type (for editing)
 */
interface Comment {
  id: string;
  commentText: string;
}

/**
 * Comment Input Props
 */
interface CommentInputProps {
  entityType: string;
  entityId: string;
  onCommentCreated: () => void;
  editingComment?: Comment | null;
  onCancelEdit?: () => void;
  maxLength?: number;
}

/**
 * Comment Input Component
 *
 * Form for creating or editing comments with:
 * - Character counter
 * - Validation
 * - Loading states
 */
export function CommentInput({
  entityType,
  entityId,
  onCommentCreated,
  editingComment,
  onCancelEdit,
  maxLength = 5000,
}: CommentInputProps) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'internal' | 'private'>('public');

  // Set text when editing
  useEffect(() => {
    if (editingComment) {
      setCommentText(editingComment.commentText);
      setSelectedFiles([]); // Clear files when editing
      setVisibility('public'); // Reset visibility when editing
    } else {
      setCommentText("");
      setSelectedFiles([]);
      setVisibility('public');
    }
  }, [editingComment]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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

      if (editingComment) {
        // Update existing comment (attachments not supported on edit)
        const res = await fetch(`/api/collab/comments/${editingComment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ commentText }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update comment");
        }
      } else {
        // Upload files first (if any)
        const attachmentIds: string[] = [];

        if (selectedFiles.length > 0) {
          for (const file of selectedFiles) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("kind", "attachment");

            const uploadRes = await fetch("/api/content/upload", {
              method: "POST",
              credentials: "same-origin",
              body: formData,
            });

            if (!uploadRes.ok) {
              throw new Error(`Failed to upload file: ${file.name}`);
            }

            const uploadData = await uploadRes.json();
            attachmentIds.push(uploadData.id);
          }
        }

        // Create new comment with attachment IDs
        const res = await fetch("/api/collab/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            entityType,
            entityId,
            commentText,
            visibility,
            attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create comment");
        }
      }

      setCommentText("");
      setSelectedFiles([]);
      setVisibility('public');
      onCommentCreated();
    } catch (err) {
      console.error("Comment submit error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCommentText("");
    setSelectedFiles([]);
    setVisibility('public');
    setError(null);
    onCancelEdit?.();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const remainingChars = maxLength - commentText.length;
  const isNearLimit = remainingChars < 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Markdown Editor */}
      <div>
        <MarkdownEditor
          value={commentText}
          onChange={setCommentText}
          placeholder={editingComment ? "Edit your comment..." : "Write your comment in markdown..."}
          maxLength={maxLength}
          disabled={submitting}
        />

        {/* Character Counter */}
        <div className={`text-xs text-right mt-1 ${isNearLimit ? "text-red-600" : "text-gray-500"}`}>
          {remainingChars.toLocaleString()} characters remaining
        </div>
      </div>

      {/* Visibility Selector */}
      {!editingComment && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Visibility
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'internal' | 'private')}
            disabled={submitting}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="public">Public - Visible to all users</option>
            <option value="internal">Internal - Visible to internal users only</option>
            <option value="private">Private - Visible only to you</option>
          </select>
          <div className="mt-1 text-xs text-gray-500">
            {visibility === 'public' && '🌐 Anyone with access to this record can see this comment'}
            {visibility === 'internal' && '🔒 Only internal team members can see this comment'}
            {visibility === 'private' && '👤 Only you can see this comment'}
          </div>
        </div>
      )}

      {/* File Attachments */}
      {!editingComment && (
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
                  className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded text-sm"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <svg
                      className="w-4 h-4 text-gray-500 flex-shrink-0"
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
                    <span className="text-gray-500 text-xs flex-shrink-0">
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
      )}

      {/* Error Message */}
      {error && (
        <div className="p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
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
              {editingComment ? "Updating..." : "Posting..."}
            </span>
          ) : (
            <span>{editingComment ? "Update Comment" : "Post Comment"}</span>
          )}
        </button>

        {editingComment && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
