"use client";

import { useState } from "react";

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
 * Comment Reactions Props
 */
interface CommentReactionsProps {
  commentId: string;
  initialReactions?: ReactionSummary[];
  onReactionChange?: () => void;
}

/**
 * Available reaction options
 */
const REACTION_OPTIONS: ReactionType[] = ['👍', '❤️', '🎉', '👀', '👎', '🚀', '💡', '🤔'];

/**
 * Comment Reactions Component
 *
 * Displays reactions on a comment with ability to add/remove reactions.
 */
export function CommentReactions({
  commentId,
  initialReactions = [],
  onReactionChange,
}: CommentReactionsProps) {
  const [reactions, setReactions] = useState<ReactionSummary[]>(initialReactions);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState<ReactionType | null>(null);

  /**
   * Toggle a reaction
   */
  const handleToggleReaction = async (reactionType: ReactionType) => {
    setLoading(reactionType);
    try {
      const res = await fetch(`/api/collab/comments/${commentId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reactionType }),
      });

      if (!res.ok) {
        throw new Error("Failed to toggle reaction");
      }

      const data = await res.json();

      // Update local state optimistically
      setReactions((prev) => {
        const existing = prev.find((r) => r.reactionType === reactionType);

        if (data.data.action === "added") {
          if (existing) {
            // Increment count and mark as reacted
            return prev.map((r) =>
              r.reactionType === reactionType
                ? { ...r, count: r.count + 1, currentUserReacted: true }
                : r
            );
          } else {
            // Add new reaction
            return [
              ...prev,
              {
                reactionType,
                count: 1,
                userIds: [],
                currentUserReacted: true,
              },
            ];
          }
        } else {
          // Removed - decrement count
          return prev
            .map((r) =>
              r.reactionType === reactionType
                ? { ...r, count: r.count - 1, currentUserReacted: false }
                : r
            )
            .filter((r) => r.count > 0);
        }
      });

      setShowPicker(false);
      onReactionChange?.();
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2 relative">
      {/* Existing Reactions */}
      {reactions.map((reaction) => (
        <button
          key={reaction.reactionType}
          type="button"
          onClick={() => handleToggleReaction(reaction.reactionType)}
          disabled={loading === reaction.reactionType}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
            reaction.currentUserReacted
              ? "bg-blue-100 text-blue-700 border border-blue-300"
              : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
          } ${loading === reaction.reactionType ? "opacity-50" : ""}`}
          title={`${reaction.count} reaction${reaction.count !== 1 ? "s" : ""}`}
        >
          <span>{reaction.reactionType}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}

      {/* Add Reaction Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          title="Add reaction"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </button>

        {/* Reaction Picker */}
        {showPicker && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowPicker(false)}
            />

            {/* Picker Dropdown */}
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-white border border-gray-300 rounded-lg shadow-lg z-20 flex gap-1">
              {REACTION_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(emoji)}
                  disabled={!!loading}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
