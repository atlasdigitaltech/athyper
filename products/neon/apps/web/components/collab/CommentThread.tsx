"use client";

import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import type { CommentCardProps } from "./CommentCard";

import { collabFetcher, type EntityComment } from "@/lib/collab";
import { cn } from "@/lib/utils";

// Forward declaration — resolved via barrel export

const MAX_DEPTH = 5;

interface RepliesResponse {
  ok: boolean;
  data: EntityComment[];
}

interface CommentThreadProps {
  parentId: string;
  depth: number;
  entityType: string;
  entityId: string;
  replyCount?: number;
  /** Render function for individual comment cards (avoids circular import) */
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
  const [expanded, setExpanded] = useState(depth < 2); // auto-expand first 2 levels

  const { data, isLoading } = useSWR<RepliesResponse>(
    expanded ? `/api/collab/comments/${parentId}/replies` : null,
    collabFetcher,
  );

  const replies = data?.data ?? [];
  const count = replyCount ?? replies.length;

  if (count === 0 && !expanded) return null;

  return (
    <div className={cn("mt-2", depth > 0 && "ml-6 border-l pl-4")}>
      {/* Toggle button */}
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

      {/* Reply list */}
      {expanded && (
        <div className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading replies...
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

export { MAX_DEPTH };
