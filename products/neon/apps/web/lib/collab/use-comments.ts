"use client";

/**
 * useComments - SWR hook for fetching record-level comments.
 */

import useSWR from "swr";

import { collabFetcher } from "./fetcher";

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

interface CommentsResponse {
    ok: boolean;
    data: EntityComment[];
    hasMore: boolean;
}

export interface UseCommentsOptions {
    limit?: number;
    offset?: number;
    paused?: boolean;
}

export function useComments(
    entityType: string | null,
    entityId: string | null,
    options?: UseCommentsOptions,
) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const paused = options?.paused ?? false;

    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const key = !paused && entityType && entityId
        ? `/api/collab/comments?${params}`
        : null;

    const { data, error, isLoading, mutate } = useSWR<CommentsResponse>(
        key,
        collabFetcher,
        { revalidateOnFocus: true },
    );

    return {
        comments: data?.data ?? [],
        hasMore: data?.hasMore ?? false,
        isLoading,
        error,
        mutate,
    };
}
