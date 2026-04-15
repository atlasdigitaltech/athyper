"use client";

/**
 * Collaboration hooks — local to @athyper/collaboration-ui.
 *
 * Kept here so collaboration-ui has zero dependency on @athyper/query.
 * These hooks call the BFF /api/collab/* routes directly via fetch.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { queryKeys } from "@athyper/api-contracts/query-keys";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntityComment {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  commenterId: string;
  commenterName?: string;
  commentText: string;
  parentCommentId: string | null;
  threadDepth: number;
  visibility: string;
  createdAt: string;
  updatedAt: string | null;
  replyCount?: number;
}

export interface ReactionSummary {
  reactionType: string;
  /** Emoji character for display (e.g. "👍"). Falls back to reactionType code if not resolved. */
  emoji: string;
  count: number;
  /** Whether the current user has reacted. */
  reacted: boolean;
}

export interface UseCommentsOptions {
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

// ── Internal fetch helpers ────────────────────────────────────────────────────

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

async function collabGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`[collab] GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function collabMutate<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCsrfToken(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`[collab] ${method} ${url} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── useComments ───────────────────────────────────────────────────────────────

interface CommentsPage {
  ok: boolean;
  data: EntityComment[];
  hasMore: boolean;
}

export function useComments(
  entityType: string | null,
  entityId: string | null,
  options?: UseCommentsOptions,
) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const enabled = (options?.enabled ?? true) && !!entityType && !!entityId;

  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (entityId) params.set("entityId", entityId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const query = useQuery<CommentsPage>({
    queryKey: queryKeys.collab.comments(entityType ?? "", entityId ?? ""),
    queryFn: ({ signal }) =>
      collabGet<CommentsPage>(`/api/collab/comments?${params}`, signal),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    comments: query.data?.data ?? [],
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── useReactions ──────────────────────────────────────────────────────────────

interface ReactionsResponse {
  ok: boolean;
  data: ReactionSummary[];
}

export function useReactions(commentId: string | null) {
  const queryClient = useQueryClient();
  const qk = queryKeys.collab.reactions(commentId ?? "");

  const query = useQuery<ReactionsResponse>({
    queryKey: qk,
    queryFn: ({ signal }) =>
      collabGet<ReactionsResponse>(
        `/api/collab/comments/${commentId}/reactions`,
        signal,
      ),
    enabled: !!commentId,
    staleTime: 30 * 1000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ reactionType }: { reactionType: string }) =>
      collabMutate(`/api/collab/comments/${commentId}/reactions`, "POST", {
        reactionType,
      }),
    onMutate: async ({ reactionType }) => {
      await queryClient.cancelQueries({ queryKey: qk });
      const prev = queryClient.getQueryData<ReactionsResponse>(qk);
      if (prev) {
        const existing = prev.data.find((r) => r.reactionType === reactionType);
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
                emoji: existing?.emoji ?? reactionType,
                count: (existing?.count ?? 0) + 1,
                reacted: true,
              },
            ];
        queryClient.setQueryData<ReactionsResponse>(qk, {
          ok: true,
          data: optimistic,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });

  return {
    reactions: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    toggleReaction: (reactionType: string) =>
      toggleMutation.mutate({ reactionType }),
  };
}

// ── useCommentActions ─────────────────────────────────────────────────────────

interface CommentActionResponse {
  ok: boolean;
  data: { id: string };
}

export function useCommentActions(entityType: string, entityId: string) {
  const queryClient = useQueryClient();
  const listKey = queryKeys.collab.comments(entityType, entityId);

  const createMutation = useMutation({
    mutationFn: ({
      commentText,
      parentCommentId,
    }: {
      commentText: string;
      parentCommentId?: string;
    }) =>
      collabMutate<CommentActionResponse>("/api/collab/comments", "POST", {
        entityType,
        entityId,
        commentText,
        parentCommentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({
      parentId,
      commentText,
    }: {
      parentId: string;
      commentText: string;
    }) =>
      collabMutate<CommentActionResponse>(
        `/api/collab/comments/${parentId}/replies`,
        "POST",
        { commentText },
      ),
    onSuccess: (_data, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: queryKeys.collab.replies(parentId),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, commentText }: { id: string; commentText: string }) =>
      collabMutate<CommentActionResponse>(`/api/collab/comments/${id}`, "PATCH", {
        commentText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      collabMutate(`/api/collab/comments/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  return {
    createComment: createMutation.mutateAsync,
    replyToComment: replyMutation.mutateAsync,
    updateComment: updateMutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ── useDraft ──────────────────────────────────────────────────────────────────

interface DraftData {
  draftText: string;
  updatedAt: string;
}

interface DraftResponse {
  ok: boolean;
  draft: DraftData | null;
}

export function useDraft(
  entityType: string | null,
  entityId: string | null,
  parentCommentId?: string,
) {
  const queryClient = useQueryClient();
  const enabled = !!entityType && !!entityId;

  const draftKey = queryKeys.collab.draft(
    entityType ?? "",
    entityId ?? "",
    parentCommentId,
  );

  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (entityId) params.set("entityId", entityId);
  if (parentCommentId) params.set("parentCommentId", parentCommentId);

  const query = useQuery<DraftResponse>({
    queryKey: draftKey,
    queryFn: ({ signal }) =>
      collabGet<DraftResponse>(`/api/collab/drafts?${params}`, signal),
    enabled,
    staleTime: 60 * 1000,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saveDraft = useCallback(
    (draftText: string) => {
      if (!entityType || !entityId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        collabMutate("/api/collab/drafts", "POST", {
          entityType,
          entityId,
          parentCommentId,
          draftText,
        })
          .then(() => queryClient.invalidateQueries({ queryKey: draftKey }))
          .catch(() => {
            // Best-effort — don't surface draft save failures
          });
      }, 2000);
    },
    [entityType, entityId, parentCommentId, queryClient, draftKey],
  );

  const deleteDraft = useCallback(() => {
    if (!enabled) return;
    collabMutate(`/api/collab/drafts?${params}`, "DELETE")
      .then(() => queryClient.invalidateQueries({ queryKey: draftKey }))
      .catch(() => {
        // Best-effort
      });
  }, [enabled, params, queryClient, draftKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    draft: query.data?.draft ?? null,
    saveDraft,
    deleteDraft,
  };
}

// ── useReplies ────────────────────────────────────────────────────────────────

interface RepliesResponse {
  ok: boolean;
  data: EntityComment[];
}

export function useReplies(parentId: string, enabled: boolean) {
  const query = useQuery<RepliesResponse>({
    queryKey: queryKeys.collab.replies(parentId),
    queryFn: ({ signal }) =>
      collabGet<RepliesResponse>(
        `/api/collab/comments/${parentId}/replies`,
        signal,
      ),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    replies: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── useCollabUnreadCount ──────────────────────────────────────────────────────

interface UnreadCountResponse {
  ok: boolean;
  count: number;
}

export function useCollabUnreadCount(
  entityType: string | null,
  entityId: string | null,
) {
  const enabled = !!entityType && !!entityId;

  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (entityId) params.set("entityId", entityId);

  const queryClient = useQueryClient();
  const qk = queryKeys.collab.unreadCount(entityType ?? "", entityId ?? "");

  const query = useQuery<UnreadCountResponse>({
    queryKey: qk,
    queryFn: ({ signal }) =>
      collabGet<UnreadCountResponse>(
        `/api/collab/comments/unread-count?${params}`,
        signal,
      ),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      collabMutate(`/api/collab/comments/mark-all-read?${params}`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
    },
  });

  return {
    unreadCount: query.data?.count ?? 0,
    markAllAsRead: markAllReadMutation.mutate,
  };
}
