"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";
import {
  type EntityComment,
  type ReactionSummary,
  type TimelineEntry,
} from "@athyper/platform-api-client";

export type { EntityComment, ReactionSummary, TimelineEntry };

// ── useComments ───────────────────────────────────────────────────────────────

export interface UseCommentsOptions {
  limit?:   number;
  offset?:  number;
  enabled?: boolean;
}

export function useComments(
  entityType: string | null,
  entityId:   string | null,
  options?:   UseCommentsOptions,
) {
  const limit   = options?.limit   ?? 50;
  const offset  = options?.offset  ?? 0;
  const enabled = (options?.enabled ?? true) && Boolean(entityType) && Boolean(entityId);

  const query = useQuery({
    queryKey:  queryKeys.collab.comments(entityType ?? "", entityId ?? ""),
    queryFn:   () => clients.collab().listComments({
      entityType: entityType!,
      entityId:   entityId!,
      limit,
      offset,
    }),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    comments:  query.data?.data ?? [],
    hasMore:   query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error:     query.error,
    refetch:   query.refetch,
  };
}

// ── useTimeline ───────────────────────────────────────────────────────────────

export interface UseTimelineOptions {
  entityType?:  string;
  entityId?:    string;
  actorUserId?: string;
  limit?:       number;
  enabled?:     boolean;
}

export function useTimeline(options?: UseTimelineOptions) {
  const limit   = options?.limit   ?? 50;
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey:  queryKeys.collab.timeline(options?.entityType, options?.entityId),
    queryFn:   () => clients.collab().listTimeline({
      entityType:  options?.entityType,
      entityId:    options?.entityId,
      actorUserId: options?.actorUserId,
      limit,
    }),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    entries:   query.data?.data ?? [],
    isLoading: query.isLoading,
    error:     query.error,
    refetch:   query.refetch,
    hasMore:   (query.data?.data.length ?? 0) === limit,
  };
}

// ── useReactions ──────────────────────────────────────────────────────────────

export function useReactions(commentId: string | null) {
  const qc = useQueryClient();
  const qk = queryKeys.collab.reactions(commentId ?? "");

  const query = useQuery({
    queryKey:  qk,
    queryFn:   () => clients.collab().listReactions(commentId!),
    enabled:   Boolean(commentId),
    staleTime: 30 * 1000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ reactionType }: { reactionType: string }) =>
      clients.collab().toggleReaction(commentId!, reactionType),

    onMutate: async ({ reactionType }) => {
      await qc.cancelQueries({ queryKey: qk });
      const prev = qc.getQueryData<{ ok: boolean; data: ReactionSummary[] }>(qk);

      if (prev) {
        const existing  = prev.data.find((r) => r.reactionType === reactionType);
        const optimistic: ReactionSummary[] = existing?.reacted
          ? prev.data
              .map((r) =>
                r.reactionType === reactionType
                  ? { ...r, count: r.count - 1, reacted: false }
                  : r,
              )
              .filter((r) => r.count > 0)
          : [
              ...prev.data.filter((r) => r.reactionType !== reactionType),
              {
                reactionType,
                emoji:   existing?.emoji ?? reactionType,
                count:   (existing?.count ?? 0) + 1,
                reacted: true,
              },
            ];
        qc.setQueryData(qk, { ok: true, data: optimistic });
      }

      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk, ctx.prev);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });

  return {
    reactions:    query.data?.data ?? [],
    isLoading:    query.isLoading,
    error:        query.error,
    toggleReaction: (reactionType: string) =>
      toggleMutation.mutate({ reactionType }),
  };
}

// ── useCommentActions ─────────────────────────────────────────────────────────

export function useCommentActions(entityType: string, entityId: string) {
  const qc      = useQueryClient();
  const listKey = queryKeys.collab.comments(entityType, entityId);

  const createMutation = useMutation({
    mutationFn: ({
      commentText,
      parentCommentId,
    }: {
      commentText:      string;
      parentCommentId?: string;
    }) => clients.collab().createComment({ entityType, entityId, commentText, parentCommentId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); },
  });

  const replyMutation = useMutation({
    mutationFn: ({ parentId, commentText }: { parentId: string; commentText: string }) =>
      clients.collab().replyToComment(parentId, { commentText }),
    onSuccess: (_data, { parentId }) => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: queryKeys.collab.replies(parentId) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, commentText }: { id: string; commentText: string }) =>
      clients.collab().updateComment(id, { commentText }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => clients.collab().deleteComment(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: listKey }); },
  });

  return {
    createComment:  createMutation.mutateAsync,
    replyToComment: replyMutation.mutateAsync,
    updateComment:  updateMutation.mutateAsync,
    deleteComment:  deleteMutation.mutateAsync,
    isCreating:     createMutation.isPending,
    isUpdating:     updateMutation.isPending,
    isDeleting:     deleteMutation.isPending,
  };
}

// ── useDraft ──────────────────────────────────────────────────────────────────

export function useDraft(
  entityType:       string | null,
  entityId:         string | null,
  parentCommentId?: string,
) {
  const qc      = useQueryClient();
  const enabled = Boolean(entityType) && Boolean(entityId);

  const draftKey = queryKeys.collab.draft(
    entityType ?? "",
    entityId   ?? "",
    parentCommentId,
  );

  // Stable string key for callbacks — avoids URLSearchParams identity churn
  const paramString = useMemo(() => {
    const p = new URLSearchParams();
    if (entityType)      p.set("entityType",      entityType);
    if (entityId)        p.set("entityId",        entityId);
    if (parentCommentId) p.set("parentCommentId", parentCommentId);
    return p.toString();
  }, [entityType, entityId, parentCommentId]);

  const query = useQuery({
    queryKey:  draftKey,
    queryFn:   () => clients.collab().getDraft({
      entityType:      entityType!,
      entityId:        entityId!,
      parentCommentId,
    }),
    enabled,
    staleTime: 60 * 1000,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saveDraft = useCallback(
    (draftText: string) => {
      if (!entityType || !entityId) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        clients.collab()
          .saveDraft({ entityType, entityId, draftText, parentCommentId })
          .then(() => qc.invalidateQueries({ queryKey: draftKey }))
          .catch(() => {});
      }, 2000);
    },
    [entityType, entityId, parentCommentId, qc, draftKey],
  );

  const deleteDraft = useCallback(() => {
    if (!enabled || !entityType || !entityId) return;
    clients.collab()
      .deleteDraft({ entityType, entityId, parentCommentId })
      .then(() => qc.invalidateQueries({ queryKey: draftKey }))
      .catch(() => {});
    // paramString is the stable dep, not the URLSearchParams object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paramString, qc, draftKey]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    draft:       query.data?.draft ?? null,
    saveDraft,
    deleteDraft,
  };
}

// ── useCollabUnreadCount ──────────────────────────────────────────────────────

export function useCollabUnreadCount(
  entityType: string | null,
  entityId:   string | null,
) {
  const qc      = useQueryClient();
  const enabled = Boolean(entityType) && Boolean(entityId);
  const qk      = queryKeys.collab.unreadCount(entityType ?? "", entityId ?? "");

  const query = useQuery({
    queryKey:        qk,
    queryFn:         () => clients.collab().getUnreadCount({
      entityType: entityType!,
      entityId:   entityId!,
    }),
    enabled,
    staleTime:       30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => clients.collab().markAllRead({
      entityType: entityType!,
      entityId:   entityId!,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk }); },
  });

  return {
    unreadCount:    query.data?.count ?? 0,
    markAllAsRead:  markAllReadMutation.mutate,
  };
}
