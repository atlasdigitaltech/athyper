/**
 * EntityDocumentsPanel Component
 *
 * Drop-in panel for entity pages that combines file picker and attachment list.
 * This is the main component to use when adding document support to an entity.
 */

"use client";

import { useState } from "react";

import { AttachmentList } from "./AttachmentList";
import { FilePicker } from "./FilePicker";

import type { Attachment, DocumentKind } from "@athyper/api-client/content";

export interface EntityDocumentsPanelProps {
  entityType: string;
  entityId: string;
  kind?: DocumentKind;
  title?: string;
  readonly?: boolean;
  showUploader?: boolean;
}

export function EntityDocumentsPanel({
  entityType,
  entityId,
  kind,
  title = "Documents",
  readonly = false,
  showUploader = true,
}: EntityDocumentsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  /**
   * Handle successful uploads
   */
  const handleUploaded = (items: Attachment[]) => {
    setUploadSuccess(
      `${items.length} ${items.length === 1 ? "file" : "files"} uploaded successfully`,
    );
    setShowPicker(false);
    setRefreshKey((prev) => prev + 1);

    // Clear success message after 3 seconds
    setTimeout(() => setUploadSuccess(null), 3000);
  };

  /**
   * Handle upload errors
   */
  const handleUploadError = (error: string) => {
    setUploadError(error);

    // Clear error message after 5 seconds
    setTimeout(() => setUploadError(null), 5000);
  };

  /**
   * Handle refresh from list
   */
  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

        {!readonly && showUploader && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            {showPicker ? "Cancel" : "Upload Files"}
          </button>
        )}
      </div>

      {/* Success notification */}
      {uploadSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <svg
              className="h-5 w-5 text-green-600 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-green-800">{uploadSuccess}</span>
          </div>
        </div>
      )}

      {/* Error notification */}
      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <svg
              className="h-5 w-5 text-red-600 mr-2 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-800 whitespace-pre-line">
                {uploadError}
              </p>
            </div>
            <button
              onClick={() => setUploadError(null)}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* File picker (collapsible) */}
      {showPicker && !readonly && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <FilePicker
            entityType={entityType}
            entityId={entityId}
            kind={kind}
            onUploaded={handleUploaded}
            onError={handleUploadError}
          />
        </div>
      )}

      {/* Attachment list */}
      <AttachmentList
        key={refreshKey}
        entityType={entityType}
        entityId={entityId}
        kind={kind}
        readonly={readonly}
        onRefresh={handleRefresh}
      />
    </div>
  );
}
