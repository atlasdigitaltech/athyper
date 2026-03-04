/**
 * DocumentVersionTimeline Component
 *
 * Displays version history timeline for a document with restore capability.
 */

"use client";

import { useEffect, useState } from "react";

export interface VersionMetadata {
  id: string;
  versionNo: number;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  sha256: string | null;
  uploadedBy: string | null;
  createdAt: string;
  isCurrent: boolean;
  replacedAt?: string;
  replacedBy?: string;
}

export interface DocumentVersionTimelineProps {
  documentId: string;
  onVersionRestored?: () => void;
  readonly?: boolean;
}

export function DocumentVersionTimeline({
  documentId,
  onVersionRestored,
  readonly = false,
}: DocumentVersionTimelineProps) {
  const [versions, setVersions] = useState<VersionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  /**
   * Fetch version history
   */
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch(`/api/content/versions/${documentId}`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "Failed to load versions");
        }

        setVersions(data.data.versions);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersions();
  }, [documentId]);

  /**
   * Handle version restore
   */
  const handleRestore = async (versionNo: number) => {
    try {
      setRestoringVersion(versionNo);
      setError(null);

      const res = await fetch("/api/content/version/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, versionNo }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Restore failed");
      }

      onVersionRestored?.();

      // Refresh version list
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRestoringVersion(null);
    }
  };

  /**
   * Format file size
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  /**
   * Format date
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No version history available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Version History</h3>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200" />

        {/* Version list */}
        <div className="space-y-4">
          {versions.map((version) => (
            <div key={version.id} className="relative flex items-start gap-4 pl-10">
              {/* Timeline dot */}
              <div
                className={`absolute left-2.5 top-2 w-3 h-3 rounded-full ${
                  version.isCurrent
                    ? "bg-green-500 ring-4 ring-green-100"
                    : "bg-gray-300"
                }`}
              />

              {/* Version card */}
              <div className="flex-1 bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900">
                        Version {version.versionNo}
                      </h4>
                      {version.isCurrent && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Current
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1">{version.fileName}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{formatFileSize(version.sizeBytes)}</span>
                      <span>•</span>
                      <span>{formatDate(version.createdAt)}</span>
                      {version.uploadedBy && (
                        <>
                          <span>•</span>
                          <span>by {version.uploadedBy}</span>
                        </>
                      )}
                    </div>

                    {version.replacedAt && (
                      <div className="mt-2 text-xs text-gray-400">
                        Replaced {formatDate(version.replacedAt)}
                        {version.replacedBy && ` by ${version.replacedBy}`}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/content/download/${version.id}`}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      Download
                    </a>

                    {!version.isCurrent && !readonly && (
                      <button
                        onClick={() => handleRestore(version.versionNo)}
                        disabled={restoringVersion === version.versionNo}
                        className="px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      >
                        {restoringVersion === version.versionNo ? "Restoring..." : "Restore"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
