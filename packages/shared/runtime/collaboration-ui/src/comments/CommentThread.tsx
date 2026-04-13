"use client";

/**
 * CommentThread — Expandable threaded replies panel.
 *
 * Lazily fetches replies from the BFF when expanded.
 * Auto-expands the first 2 depth levels.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Loader2 } from "lucide-react";

import { cn } from "@athyper/theme/utils";
import { useReplies, type EntityComment } from "../hooks/collab";

export const MAX_DEPTH = 5;

export interface CommentCardProps {
  comment: EntityComment;
  depth: number;
  entityType: string;
  entityId: string;
  renderCard: (props: CommentCardProps) => React.ReactNode;
}

interface CommentThreadProps {
  parentId: string;
  depth: number;
  entityType: string;
  entityId: string;
  replyCount?: number;
  renderCard: (props: CommentCardProps) => React.ReactNode;
}

export function CommentThread({
  parentId,
  depth,
  entityType,
  entityId,
  replyCount,
  renderCard,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const { replies, isLoading } = useReplies(parentId, expanded);
  const count = replyCount ?? replies.length;

  if (count === 0 && !expanded) return null;

  return (
    <div className={cn("mt-2", depth > 0 && "ml-6 border-l pl-4")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <MessageSquare className="size-3" />
        <span>
          {count} {count === 1 ? "reply" : "replies"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading replies…
            </div>
          )}
          {replies.map((reply) =>
            renderCard({
              comment: reply,
              depth: depth + 1,
              entityType,
              entityId,
              renderCard,
            }),
          )}
        </div>
      )}
    </div>
  );
}
