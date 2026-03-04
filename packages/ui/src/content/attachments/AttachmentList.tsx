/**
 * AttachmentList Component
 *
 * Fetches and displays attachments for an entity.
 * Includes empty state and error handling.
 */

"use client";

import { listByEntity, type Attachment, type DocumentKind } from "@athyper/api-client/content";
import { useEffect, useState, useCallback } from "react";

import { AttachmentCard } from "./AttachmentCard";

export interface AttachmentListProps {
  entityType: string;
  entityId: string;
  kind?: DocumentKind;
  readonly?: boolean;
  onRefresh?: () => void;
}

export function AttachmentList({
  entityType,
  entityId,
  kind,
  readonly = false,
  onRefresh,
}: AttachmentListProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch attachments from API
   */
  const fetchAttachments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await listByEntity({
        entityType,
        entityId,
        kind,
      });

      setAttachments(result);
    } catch (err: any) {
      setError(err.message || "Failed to load attachments");
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId, kind]);

  /**
   * Load attachments on mount and when dependencies change
   */
  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  /**
   * Handle attachment deleted
   */
  const handleDeleted = useCallback(
    (id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      onRefresh?.();
    },
    [onRefresh],
  );

  /**
   * Handle manual refresh
   */
  const handleRefresh = () => {
    fetchAttachments();
    onRefresh?.();
  };

  /**
   * Group attachments by kind
   */
  const groupedAttachments = attachments.reduce((acc, attachment) => {
    const key = attachment.kind || "attachment";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(attachment);
    return acc;
  }, {} as Record<string, Attachment[]>);

  const kindLabels: Record<DocumentKind, string> = {
    attachment: "Attachments",
    generated: "Generated Documents",
    export: "Exports",
    template: "Templates",
    letterhead: "Letterheads",
    avatar: "Avatars",
    signature: "Signatures",
    certificate: "Certificates",
    invoice: "Invoices",
    receipt: "Receipts",
    contract: "Contracts",
    report: "Reports",
  };

  /**
   * Loading state
   */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  /**
   * Error state
   */
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  /**
   * Empty state
   */
  if (attachments.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No attachments</h3>
        <p className="mt-1 text-sm text-gray-500">
          {readonly ? "No files have been uploaded yet" : "Upload files to get started"}
        </p>
      </div>
    );
  }

  /**
   * Render attachments (grouped or flat)
   */
  const shouldGroup = Object.keys(groupedAttachments).length > 1 && !kind;

  if (shouldGroup) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            {attachments.length} {attachments.length === 1 ? "file" : "files"}
          </h3>
          <button
            onClick={handleRefresh}
            className="text-sm text-blue-600 hover:text-blue-700"
            title="Refresh"
          >
            Refresh
          </button>
        </div>

        {Object.entries(groupedAttachments).map(([kindKey, items]) => (
          <div key={kindKey}>
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              {kindLabels[kindKey as DocumentKind] || kindKey} ({items.length})
            </h4>
            <div className="space-y-2">
              {items.map((attachment) => (
                <AttachmentCard
                  key={attachment.id}
                  item={attachment}
                  onDeleted={handleDeleted}
                  readonly={readonly}
                  showEntityMeta
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {attachments.length} {attachments.length === 1 ? "file" : "files"}
        </h3>
        <button
          onClick={handleRefresh}
          className="text-sm text-blue-600 hover:text-blue-700"
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {attachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            item={attachment}
            onDeleted={handleDeleted}
            readonly={readonly}
            showEntityMeta
          />
        ))}
      </div>
    </div>
  );
}
