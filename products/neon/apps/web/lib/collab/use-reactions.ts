"use client";

/**
 * useReactions - SWR hook for emoji reactions with optimistic toggle.
 */

import { useCallback } from "react";
import useSWR from "swr";

import { collabFetcher, collabMutate } from "./fetcher";

export interface ReactionSummary {
  reactionType: string;
  count: number;
  reacted: boolean; // current user reacted?
}

interface ReactionsResponse {
  ok: boolean;
  data: ReactionSummary[];
}

export function useReactions(commentId: string | null) {
  const key = commentId ? `/api/collab/comments/${commentId}/reactions` : null;

  const { data, error, isLoading, mutate } = useSWR<ReactionsResponse>(
    key,
    collabFetcher,
  );

  const toggleReaction = useCallback(
    async (reactionType: string) => {
      if (!commentId) return;

      // Optimistic update
      const prev = data?.data ?? [];
      const existing = prev.find((r) => r.reactionType === reactionType);

      const optimistic: ReactionSummary[] = existing?.reacted
        ? prev
            .map((r) =>
              r.reactionType === reactionType
                ? { ...r, count: r.count - 1, reacted: false }
                : r,
            )
            .filter((r) => r.count > 0)
        : [
            ...prev.filter((r) => r.reactionType !== reactionType),
            {
              reactionType,
              count: (existing?.count ?? 0) + 1,
              reacted: true,
            },
          ];

      await mutate({ ok: true, data: optimistic }, false);

      try {
        await collabMutate(
          `/api/collab/comments/${commentId}/reactions`,
          "POST",
          { reactionType },
        );
        await mutate();
      } catch {
        await mutate();
      }
    },
    [commentId, data, mutate],
  );

  return {
    reactions: data?.data ?? [],
    isLoading,
    error,
    toggleReaction,
  };
}
