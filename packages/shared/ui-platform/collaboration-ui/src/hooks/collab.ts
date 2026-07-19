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
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { getCsrfToken } from "@athyper/runtime-shared/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntityComment {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  commenterId: string;
  commenterName?: string;
  /** Role label surfaced by the server e.g. "admin", "supplier", "approver". */
  commenterRole?: string;
  commentText: string;
  /** "plain" for legacy comments, "rich_json" for TipTap-authored ones. */
  contentFormat?: string;
  /** TipTap ProseMirror document JSON. Present when contentFormat = "rich_json". */
  contentJson?: unknown;
  /** TipTap-serialized HTML. Sanitized by DOMPurify before display. */
  contentHtml?: string | null;
  parentCommentId: string | null;
  threadDepth: number;
  visibility: string;
  /** Lookup code from master.comment_intent. Drives the intent badge + filter. */
  commentIntent?: string;
  /** Server-flagged true when this comment has not been read by the current user. */
  isUnread?: boolean;
  createdAt: string;
  updatedAt: string | null;
  replyCount?: number;
  /** Enriched by the list response; renderers must not fetch these per row. */
  attachments?: CommentAttachmentSummary[];
  /** Enriched by the list response; renderers must not fetch these per row. */
  reactions?: ReactionSummary[];
  /** Nested reply tree returned with the root page. */
  replies?: EntityComment[];
}

export interface CommentAttachmentSummary {
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}

/**
 * Single comment-intent option as returned from the lookup domain.
 * Driven by control.lookup_value rows where domain_code = 'master.comment_intent'.
 */
export interface CommentIntentOption {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  /** Free-form metadata: { icon, tone, ... } — surfaced as-is by IntentBadge. */
  metadata?: Record<string, unknown>;
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
  /** Filter list by intent codes (master.comment_intent). Empty = all intents. */
  intents?: string[];
}

// ── Internal fetch helpers ────────────────────────────────────────────────────

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

export interface CommentsPage {
  ok: boolean;
  data: EntityComment[];
  hasMore: boolean;
  count: number;
  unreadCount: number;
  config: { intents: CommentIntentOption[] };
}

export function useComments(
  entityType: string | null,
  entityId: string | null,
  options?: UseCommentsOptions,
) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const enabled = (options?.enabled ?? true) && !!entityType && !!entityId;
  const intents = options?.intents ?? [];
  const intentKey = intents.join(",");

  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (entityId) params.set("entityId", entityId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (intentKey) params.set("intent", intentKey);

  const query = useQuery<CommentsPage>({
    queryKey: [
      ...queryKeys.collab.comments(entityType ?? "", entityId ?? ""),
      ...(intentKey ? [{ intent: intentKey }] : []),
    ],
    queryFn: ({ signal }) =>
      collabGet<CommentsPage>(`/api/collab/comments?${params}`, signal),
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    page: query.data,
    comments: query.data?.data ?? [],
    hasMore: query.data?.hasMore ?? false,
    count: query.data?.count ?? 0,
    unreadCount: query.data?.unreadCount ?? 0,
    intents: query.data?.config?.intents ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── useReactions ──────────────────────────────────────────────────────────────

export function useReactions(
  commentId: string | null,
  initialReactions: ReactionSummary[],
  onMutated?: () => void | Promise<unknown>,
) {
  const [reactions, setReactions] = useState(initialReactions);

  useEffect(() => {
    setReactions(initialReactions);
  }, [commentId, initialReactions]);

  const toggleMutation = useMutation({
    mutationFn: ({ reactionType }: { reactionType: string }) =>
      collabMutate(`/api/collab/comments/${commentId}/reactions`, "POST", {
        reactionType,
      }),
    onMutate: ({ reactionType }) => {
      const prev = reactions;
      const existing = prev.find((reaction) => reaction.reactionType === reactionType);
      const optimistic: ReactionSummary[] = existing?.reacted
        ? prev
            .map((reaction) => reaction.reactionType === reactionType
              ? { ...reaction, count: reaction.count - 1, reacted: false }
              : reaction)
            .filter((reaction) => reaction.count > 0)
        : [
            ...prev.filter((reaction) => reaction.reactionType !== reactionType),
            {
              reactionType,
              emoji: existing?.emoji ?? reactionType,
              count: (existing?.count ?? 0) + 1,
              reacted: true,
            },
          ];
      setReactions(optimistic);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) setReactions(ctx.prev);
    },
    onSettled: () => {
      void onMutated?.();
    },
  });

  return {
    reactions,
    isLoading: false,
    error: toggleMutation.error,
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
      attachmentIds,
      contentJson,
      contentHtml,
      visibility,
      commentIntent,
      contextType,
    }: {
      commentText: string;
      parentCommentId?: string;
      attachmentIds?: string[];
      contentJson?: unknown;
      contentHtml?: string;
      visibility?: string;
      /** master.comment_intent lookup code. Defaults to 'general' server-side. */
      commentIntent?: string;
      /** master.comment_type lookup code. Defaults to 'entity' server-side. */
      contextType?: string;
    }) =>
      collabMutate<CommentActionResponse>("/api/collab/comments", "POST", {
        entityType,
        entityId,
        commentText,
        parentCommentId,
        ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}),
        ...(contentJson ? { contentJson } : {}),
        ...(contentHtml ? { contentHtml } : {}),
        ...(visibility ? { visibility } : {}),
        ...(commentIntent ? { commentIntent } : {}),
        ...(contextType ? { contextType } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({
      parentId,
      commentText,
      attachmentIds,
      contentJson,
      contentHtml,
      visibility,
    }: {
      parentId: string;
      commentText: string;
      attachmentIds?: string[];
      contentJson?: unknown;
      contentHtml?: string;
      visibility?: string;
    }) =>
      collabMutate<CommentActionResponse>(
        `/api/collab/comments/${parentId}/replies`,
        "POST",
        {
          commentText,
          ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}),
          ...(contentJson ? { contentJson } : {}),
          ...(contentHtml ? { contentHtml } : {}),
          ...(visibility ? { visibility } : {}),
        },
      ),
    onSuccess: (_data, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: queryKeys.collab.replies(parentId),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      commentText,
      contentJson,
      contentHtml,
    }: {
      id: string;
      commentText: string;
      contentJson?: unknown;
      contentHtml?: string;
    }) =>
      collabMutate<CommentActionResponse>(`/api/collab/comments/${id}`, "PATCH", {
        commentText,
        ...(contentJson ? { contentJson } : {}),
        ...(contentHtml ? { contentHtml } : {}),
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

// ── useCommentIntents ─────────────────────────────────────────────────────────
// Fetches the master.comment_intent lookup domain via the canonical metadata
// route. Drives the IntentBadge label/icon/tone and the CommentsPanel filter
// chips. Cached for 5 minutes — lookup values rarely change at runtime.

interface LookupBundleResponse {
  domain: { code: string; name: string };
  values: Array<{
    code: string;
    name: string;
    description: string | null;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    status: "active" | "deprecated";
  }>;
}

const COMMENT_INTENTS_SESSION_KEY = "athyper:session:lookup:master.comment_intent:v1";

function readSessionCommentIntents(): CommentIntentOption[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(COMMENT_INTENTS_SESSION_KEY) ?? "null") as unknown;
    return Array.isArray(parsed) ? parsed as CommentIntentOption[] : undefined;
  } catch {
    return undefined;
  }
}

function storeSessionCommentIntents(intents: CommentIntentOption[]): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(COMMENT_INTENTS_SESSION_KEY, JSON.stringify(intents)); } catch { /* optional cache */ }
}

export function useCommentIntents(initialOptions?: CommentIntentOption[]) {
  const queryClient = useQueryClient();
  const query = useQuery<CommentIntentOption[]>({
    queryKey: ["lookup", "master.comment_intent"],
    queryFn: async ({ signal }) => {
      const response = await collabGet<LookupBundleResponse>(
        "/api/relay/metadata/lookups/master.comment_intent",
        signal,
      );
      const intents = (response.values ?? [])
        .filter((value) => value.status === "active")
        .map((value) => ({
          code: value.code,
          name: value.name,
          description: value.description ?? undefined,
          sortOrder: value.sort_order,
          metadata: value.metadata ?? undefined,
        }));
      storeSessionCommentIntents(intents);
      return intents;
    },
    initialData: initialOptions !== undefined
      ? initialOptions
      : readSessionCommentIntents(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (initialOptions === undefined) return;
    queryClient.setQueryData(["lookup", "master.comment_intent"], initialOptions);
    storeSessionCommentIntents(initialOptions);
  }, [initialOptions, queryClient]);

  return {
    intents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ── useDraft ──────────────────────────────────────────────────────────────────

interface DraftData {
  draftText: string;
  contentJson?: unknown;
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
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const enabled = (options?.enabled ?? true) && !!entityType && !!entityId;

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
    (draftText: string, contentJson?: unknown) => {
      if (!entityType || !entityId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        collabMutate("/api/collab/drafts", "POST", {
          entityType,
          entityId,
          parentCommentId,
          draftText,
          ...(contentJson ? { contentJson } : {}),
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

// ── useCollabUnreadCount ──────────────────────────────────────────────────────

interface UnreadCountResponse {
  ok: boolean;
  count: number;
}

export function useCollabUnreadCount(
  entityType: string | null,
  entityId: string | null,
  options?: {
    initialCount?: number;
    queryEnabled?: boolean;
    onMarkedRead?: () => void | Promise<void>;
  },
) {
  const enabled = (options?.queryEnabled ?? true) && !!entityType && !!entityId;

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
    initialData: options?.initialCount === undefined
      ? undefined
      : { ok: true, count: options.initialCount },
  });

  useEffect(() => {
    if (options?.initialCount === undefined) return;
    queryClient.setQueryData<UnreadCountResponse>(qk, {
      ok: true,
      count: options.initialCount,
    });
    // qk is structurally stable for this entity pair; depending on its array
    // identity would rerun this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, entityType, options?.initialCount, queryClient]);

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      collabMutate(`/api/collab/comments/mark-all-read?${params}`, "POST"),
    onSuccess: () => {
      queryClient.setQueryData<UnreadCountResponse>(qk, { ok: true, count: 0 });
      void options?.onMarkedRead?.();
    },
  });

  return {
    unreadCount: query.data?.count ?? 0,
    markAllAsRead: markAllReadMutation.mutate,
  };
}
