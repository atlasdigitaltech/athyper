/**
 * AttachmentCard Component
 *
 * Displays a single attachment with download and delete actions.
 */

"use client";

import {
  getDownloadUrl,
  deleteAttachment,
  type Attachment,
} from "@athyper/api-client/content";
import { useState } from "react";

export interface AttachmentCardProps {
  item: Attachment;
  onDeleted?: (id: string) => void;
  showEntityMeta?: boolean;
  readonly?: boolean;
}

export function AttachmentCard({
  item,
  onDeleted,
  showEntityMeta = false,
  readonly = false,
}: AttachmentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Format file size to human-readable string
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  /**
   * Get file extension from filename
   */
  const getFileExtension = (filename: string): string => {
    const parts = filename.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "FILE";
  };

  /**
   * Handle download action
   */
  const handleDownload = async () => {
    try {
      setError(null);
      const result = await getDownloadUrl(item.id);

      // Redirect to presigned URL
      window.location.href = result.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  /**
   * Handle delete action with confirmation
   */
  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);

      await deleteAttachment(item.id);

      onDeleted?.(item.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  /**
   * Handle cancel delete
   */
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  /**
   * Copy download link to clipboard
   */
  const handleCopyLink = async () => {
    try {
      const result = await getDownloadUrl(item.id);
      await navigator.clipboard.writeText(result.url);
      // TODO: Show toast notification
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Copy link failed");
    }
  };

  const fileExtension = getFileExtension(item.fileName);
  const formattedSize = formatFileSize(item.sizeBytes);
  const formattedDate = new Date(item.createdAt).toLocaleDateString();

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-4">
        {/* File icon */}
        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
          <span className="text-xs font-bold text-blue-700">
            {fileExtension}
          </span>
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {item.fileName}
          </h4>

          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span>{formattedSize}</span>
            <span>•</span>
            <span>{formattedDate}</span>
            {item.kind && item.kind !== "attachment" && (
              <>
                <span>•</span>
                <span className="capitalize">{item.kind}</span>
              </>
            )}
          </div>

          {item.createdBy && showEntityMeta && (
            <div className="mt-1 text-xs text-gray-500">
              Uploaded by {item.createdBy.displayName || item.createdBy.id}
            </div>
          )}

          {item.versionNo && item.versionNo > 1 && (
            <div className="mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                v{item.versionNo}
                {item.isCurrent && " (current)"}
              </span>
            </div>
          )}

          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </div>

        {/* Actions */}
        {!readonly && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {!showDeleteConfirm ? (
              <>
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Download"
                >
                  Download
                </button>

                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Copy link"
                >
                  Copy Link
                </button>

                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  Delete
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Delete this file?</span>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {readonly && (
          <div className="flex-shrink-0">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
