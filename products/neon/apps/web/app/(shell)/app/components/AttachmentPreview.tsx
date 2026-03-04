"use client";

import { useState } from "react";

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
 * Attachment Preview Props
 */
interface AttachmentPreviewProps {
  attachment: Attachment;
}

/**
 * Attachment Preview Component
 *
 * Shows inline previews for images and videos.
 * Falls back to download link for other file types.
 */
export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [showModal, setShowModal] = useState(false);
  const [imageError, setImageError] = useState(false);

  const downloadUrl = `/api/content/upload?id=${attachment.id}`;
  const contentType = attachment.contentType || "";

  // Determine if this is a previewable type
  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");
  const isPDF = contentType === "application/pdf";

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * Image Preview
   */
  if (isImage && !imageError) {
    return (
      <>
        <div className="flex flex-col gap-2">
          {/* Thumbnail */}
          <div
            className="relative cursor-pointer group"
            onClick={() => setShowModal(true)}
          >
            <img
              src={downloadUrl}
              alt={attachment.fileName}
              className="max-w-sm max-h-64 rounded border border-gray-200 hover:border-blue-400 transition-colors"
              onError={() => setImageError(true)}
              loading="lazy"
            />
            {/* Zoom Icon Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                />
              </svg>
            </div>
          </div>

          {/* File Info */}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="truncate">{attachment.fileName}</span>
            {attachment.sizeBytes && (
              <span className="text-gray-400">({formatFileSize(attachment.sizeBytes)})</span>
            )}
          </div>
        </div>

        {/* Modal for Full-Size Preview */}
        {showModal && (
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <div className="relative max-w-7xl max-h-full">
              <img
                src={downloadUrl}
                alt={attachment.fileName}
                className="max-w-full max-h-[90vh] rounded"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  /**
   * Video Preview
   */
  if (isVideo) {
    return (
      <div className="flex flex-col gap-2">
        <video
          controls
          className="max-w-lg max-h-64 rounded border border-gray-200"
          preload="metadata"
        >
          <source src={downloadUrl} type={contentType} />
          Your browser does not support the video tag.
        </video>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="truncate">{attachment.fileName}</span>
          {attachment.sizeBytes && (
            <span className="text-gray-400">({formatFileSize(attachment.sizeBytes)})</span>
          )}
        </div>
      </div>
    );
  }

  /**
   * PDF Preview (Show thumbnail + link to open in new tab)
   */
  if (isPDF) {
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
        <svg className="w-8 h-8 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">{attachment.fileName}</div>
          {attachment.sizeBytes && (
            <div className="text-xs text-gray-500">{formatFileSize(attachment.sizeBytes)}</div>
          )}
        </div>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex-shrink-0"
        >
          Open PDF
        </a>
      </div>
    );
  }

  /**
   * Generic File Download
   */
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
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
      <span className="truncate flex-1">{attachment.fileName}</span>
      {attachment.sizeBytes && (
        <span className="text-xs text-gray-500 flex-shrink-0">
          ({formatFileSize(attachment.sizeBytes)})
        </span>
      )}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 text-xs underline flex-shrink-0"
      >
        Download
      </a>
    </div>
  );
}
