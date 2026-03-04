"use client";

/**
 * useTimeline - SWR hook for the unified activity timeline.
 */

import { useCallback, useState } from "react";
import useSWR from "swr";

import { collabFetcher } from "./fetcher";

export interface TimelineEntry {
    id: string;
    source: string;
    tenantId: string;
    eventType: string;
    severity: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    actorDisplayName?: string;
    summary: string;
    details?: Record<string, unknown>;
    occurredAt: string;
}

interface TimelineResponse {
    ok: boolean;
    data: TimelineEntry[];
}

export interface UseTimelineOptions {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    limit?: number;
    paused?: boolean;
}

export function useTimeline(options?: UseTimelineOptions) {
    const [offset, setOffset] = useState(0);
    const limit = options?.limit ?? 50;
    const paused = options?.paused ?? false;

    const params = new URLSearchParams();
    if (options?.entityType) params.set("entityType", options.entityType);
    if (options?.entityId) params.set("entityId", options.entityId);
    if (options?.actorUserId) params.set("actorUserId", options.actorUserId);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const key = !paused ? `/api/collab/timeline?${params}` : null;

    const { data, error, isLoading, mutate } = useSWR<TimelineResponse>(
        key,
        collabFetcher,
        { revalidateOnFocus: true },
    );

    const entries = data?.data ?? [];
    const hasMore = entries.length === limit;

    const loadMore = useCallback(() => {
        setOffset((prev) => prev + limit);
    }, [limit]);

    const reset = useCallback(() => {
        setOffset(0);
        mutate();
    }, [mutate]);

    return {
        entries,
        isLoading,
        error,
        hasMore,
        loadMore,
        reset,
    };
}
