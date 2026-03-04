"use client";

import { useState, useEffect } from "react";

import { MarkdownContent } from "./MarkdownContent";

/**
 * Flag Reason Type
 */
type FlagReason =
  | "spam"
  | "offensive"
  | "harassment"
  | "misinformation"
  | "other";

/**
 * Flag Status Type
 */
type FlagStatus = "pending" | "dismissed" | "action_taken";

/**
 * Flagged Comment Type
 */
interface FlaggedComment {
  flagId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterDisplayName?: string;
  entityType: string;
  entityId: string;
  flagReason: FlagReason;
  flagDetails?: string;
  flaggedBy: string;
  flaggedByDisplayName?: string;
  flaggedAt: string;
  flagStatus: FlagStatus;
  totalFlags: number;
  isHidden: boolean;
}

/**
 * Moderation Queue Props
 */
interface ModerationQueueProps {
  tenantId?: string;
}

/**
 * Moderation Queue Component
 *
 * Dashboard for moderators to review and act on flagged comments.
 */
export function ModerationQueue({ tenantId }: ModerationQueueProps) {
  const [flags, setFlags] = useState<FlaggedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "dismissed">(
    "pending",
  );
  const [processingFlagId, setProcessingFlagId] = useState<string | null>(null);

  const flagReasonLabels: Record<FlagReason, string> = {
    spam: "Spam",
    offensive: "Offensive",
    harassment: "Harassment",
    misinformation: "Misinformation",
    other: "Other",
  };

  const fetchFlags = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }

      const res = await fetch(
        `/api/collab/moderation/flags?${params.toString()}`,
        {
          credentials: "same-origin",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to fetch flags");
      }

      const data = await res.json();
      setFlags(data.data || []);
    } catch (err) {
      console.error("Error fetching flags:", err);
      setError(err instanceof Error ? err.message : "Failed to load flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [filter]);

  const handleReviewFlag = async (
    flagId: string,
    action: "dismiss" | "hide_comment" | "delete_comment",
  ) => {
    if (
      action === "delete_comment" &&
      !confirm(
        "Are you sure you want to permanently delete this comment? This cannot be undone.",
      )
    ) {
      return;
    }

    setProcessingFlagId(flagId);

    try {
      const res = await fetch(`/api/collab/moderation/flags/${flagId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Failed to review flag");
      }

      // Refresh flags
      await fetchFlags();
    } catch (err) {
      console.error("Error reviewing flag:", err);
      alert("Failed to process flag review");
    } finally {
      setProcessingFlagId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse text-gray-500">
          Loading moderation queue...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600">⚠️ {error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Moderation Queue
        </h1>
        <p className="text-sm text-gray-600">
          Review flagged comments and take appropriate action
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === "pending"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Pending ({flags.filter((f) => f.flagStatus === "pending").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("dismissed")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === "dismissed"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Dismissed
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === "all"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          All ({flags.length})
        </button>
      </div>

      {/* Flags List */}
      {flags.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg
            className="w-16 h-16 mx-auto text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-gray-600">
            No {filter !== "all" ? filter : ""} flags to review
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <div
              key={flag.flagId}
              className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                flag.isHidden ? "border-red-300" : "border-gray-200"
              }`}
            >
              {/* Flag Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        flag.flagReason === "spam"
                          ? "bg-yellow-100 text-yellow-800"
                          : flag.flagReason === "offensive"
                            ? "bg-red-100 text-red-800"
                            : flag.flagReason === "harassment"
                              ? "bg-purple-100 text-purple-800"
                              : flag.flagReason === "misinformation"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {flagReasonLabels[flag.flagReason]}
                    </span>
                    <span className="text-sm text-gray-600">
                      Flagged by{" "}
                      <span className="font-medium">
                        {flag.flaggedByDisplayName || flag.flaggedBy}
                      </span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(flag.flaggedAt).toLocaleString()}
                    </span>
                    {flag.totalFlags > 1 && (
                      <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full font-semibold">
                        {flag.totalFlags} total flags
                      </span>
                    )}
                    {flag.isHidden && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full font-semibold">
                        Hidden
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      flag.flagStatus === "pending"
                        ? "text-yellow-600"
                        : flag.flagStatus === "dismissed"
                          ? "text-gray-600"
                          : "text-green-600"
                    }`}
                  >
                    {flag.flagStatus.replace("_", " ").toUpperCase()}
                  </span>
                </div>

                {/* Flag Details */}
                {flag.flagDetails && (
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="font-medium">Details:</span>{" "}
                    {flag.flagDetails}
                  </div>
                )}
              </div>

              {/* Comment Content */}
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-gray-600">
                      {(flag.commenterDisplayName || flag.commenterId)
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {flag.commenterDisplayName || flag.commenterId}
                      </span>
                      <span className="text-xs text-gray-500">
                        on {flag.entityType}
                      </span>
                    </div>
                    <div
                      className={`prose prose-sm max-w-none ${flag.isHidden ? "opacity-50" : ""}`}
                    >
                      <MarkdownContent content={flag.commentText} />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {flag.flagStatus === "pending" && (
                  <div className="flex gap-3 pt-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleReviewFlag(flag.flagId, "dismiss")}
                      disabled={processingFlagId === flag.flagId}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingFlagId === flag.flagId
                        ? "Processing..."
                        : "Dismiss Flag"}
                    </button>
                    {!flag.isHidden && (
                      <button
                        type="button"
                        onClick={() =>
                          handleReviewFlag(flag.flagId, "hide_comment")
                        }
                        disabled={processingFlagId === flag.flagId}
                        className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-300 rounded-lg hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Hide Comment
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleReviewFlag(flag.flagId, "delete_comment")
                      }
                      disabled={processingFlagId === flag.flagId}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete Comment
                    </button>
                    <a
                      href={`#comment-${flag.commentId}`}
                      className="ml-auto px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      View in Context →
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
