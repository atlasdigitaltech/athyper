"use client";

// lib/schema-manager/use-entity-activity.ts
//
// Fetches audit trail entries for a specific entity.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { MeshAuditEntry } from "./types";

export interface UseEntityActivityResult {
    entries: MeshAuditEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
    hasMore: boolean;
    loadMore: () => void;
}

const PAGE_SIZE = 50;

export function useEntityActivity(entityName: string): UseEntityActivityResult {
    const [entries, setEntries] = useState<MeshAuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const offsetRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const fetchActivity = useCallback(async (append = false) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!append) {
            setLoading(true);
            setError(null);
            offsetRef.current = 0;
        }

        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offsetRef.current),
            });
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/activity?${params}`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load activity (${res.status})`);
            }

            const body = (await res.json()) as { data: MeshAuditEntry[] };
            const newEntries = body.data;

            if (append) {
                setEntries((prev) => [...prev, ...newEntries]);
            } else {
                setEntries(newEntries);
            }

            setHasMore(newEntries.length === PAGE_SIZE);
            offsetRef.current += newEntries.length;
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load activity");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    const loadMore = useCallback(() => {
        fetchActivity(true);
    }, [fetchActivity]);

    useEffect(() => {
        fetchActivity();
        return () => abortRef.current?.abort();
    }, [fetchActivity]);

    return { entries, loading, error, refresh: () => fetchActivity(false), hasMore, loadMore };
}
