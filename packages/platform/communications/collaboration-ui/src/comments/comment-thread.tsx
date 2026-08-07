"use client";

/**
 * CommentThread — Expandable threaded replies panel.
 *
 * Lazily fetches replies from the BFF when expanded.
 * Auto-expands the first 2 depth levels.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";

import { cn } from "@athyper/platform-theme/utils";
import type { EntityComment } from "../hooks/collab";

export const MAX_DEPTH = 5;

export interface CommentCardProps {
  comment: EntityComment;
  depth: number;
  entityType: string;
  entityId: string;
  renderCard: (props: CommentCardProps) => React.ReactNode;
  onMutated?: () => void | Promise<unknown>;
}

interface CommentThreadProps {
  parentId: string;
  depth: number;
  entityType: string;
  entityId: string;
  replyCount?: number;
  replies: EntityComment[];
  onMutated?: () => void | Promise<unknown>;
  renderCard: (props: CommentCardProps) => React.ReactNode;
}

export function CommentThread({
  parentId,
  depth,
  entityType,
  entityId,
  replyCount,
  replies,
  onMutated,
  renderCard,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(false);
  const count = replyCount ?? replies.length;

  if (count === 0 && !expanded) return null;

  return (
    <div className={cn(
      depth === 0 && "mt-3 rounded-md border border-border/50 bg-muted/30 p-3",
      depth > 0  && "mt-2 border-t border-border/40 pt-2 pl-3",
    )}>
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
          {replies.map((reply) =>
            renderCard({
              comment: reply,
              depth: depth + 1,
              entityType,
              entityId,
              onMutated,
              renderCard,
            }),
          )}
        </div>
      )}
    </div>
  );
}
