"use client";

/**
 * CommentReactions — Emoji reaction buttons with optimistic toggle.
 *
 * Reaction types are stored as codes in the DB (thumbs_up, heart, …).
 * The server returns emoji characters alongside the count via the GET endpoint.
 * The picker uses a local code→emoji map and sends the code on toggle.
 */

import { useState } from "react";
import { SmilePlus } from "lucide-react";

import { Button } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import { useReactionTypes, useReactions, type ReactionSummary } from "../hooks/collab";

interface CommentReactionsProps {
  commentId: string;
  initialReactions: ReactionSummary[];
  onMutated?: () => void | Promise<unknown>;
}

export function CommentReactions({ commentId, initialReactions, onMutated }: CommentReactionsProps) {
  const { reactions, toggleReaction } = useReactions(commentId, initialReactions, onMutated);
  const { reactionTypes } = useReactionTypes();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {reactions
        .filter((r) => r.count > 0)
        .map((r) => (
          <button
            key={r.reactionType}
            type="button"
            onClick={() => toggleReaction(r.reactionType)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent",
              r.reacted && "border-primary/40 bg-primary/5",
            )}
          >
            {/* Use server-supplied emoji; fall back to the local map */}
            <span>{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        ))}

      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPicker((v) => !v)}
          className="size-6 p-0 text-muted-foreground"
        >
          <SmilePlus className="size-3.5" />
        </Button>

        {showPicker && (
          <div className="absolute bottom-full left-0 z-50 mb-1 flex gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            {reactionTypes.map(({ code, emoji, name }) => (
              <button
                key={code}
                type="button"
                title={name}
                className="rounded p-1 text-base hover:bg-accent"
                onClick={() => {
                  toggleReaction(code);
                  setShowPicker(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
