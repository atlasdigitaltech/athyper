"use client";

/**
 * useDraft - Auto-save comment drafts with debounce.
 */

import { useCallback, useRef, useEffect } from "react";
import useSWR from "swr";

import { collabFetcher, collabMutate } from "./fetcher";

interface DraftResponse {
    ok: boolean;
    draft: { draftText: string; updatedAt: string } | null;
}

export function useDraft(
    entityType: string | null,
    entityId: string | null,
    parentCommentId?: string,
) {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId);
    if (parentCommentId) params.set("parentCommentId", parentCommentId);

    const key = entityType && entityId
        ? `/api/collab/drafts?${params}`
        : null;

    const { data, mutate } = useSWR<DraftResponse>(key, collabFetcher);

    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const saveDraft = useCallback(
        (draftText: string) => {
            if (!entityType || !entityId) return;

            // Debounce by 2 seconds
            if (timerRef.current) clearTimeout(timerRef.current);

            timerRef.current = setTimeout(async () => {
                try {
                    await collabMutate("/api/collab/drafts", "POST", {
                        entityType,
                        entityId,
                        parentCommentId,
                        draftText,
                    });
                    await mutate();
                } catch {
                    // Best-effort — don't surface draft save failures
                }
            }, 2000);
        },
        [entityType, entityId, parentCommentId, mutate],
    );

    const deleteDraft = useCallback(async () => {
        if (!key) return;
        try {
            await collabMutate(key, "DELETE");
            await mutate();
        } catch {
            // Best-effort
        }
    }, [key, mutate]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return {
        draft: data?.draft ?? null,
        saveDraft,
        deleteDraft,
    };
}
