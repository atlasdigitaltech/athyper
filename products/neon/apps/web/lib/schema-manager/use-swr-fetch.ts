"use client";

// lib/schema-manager/use-swr-fetch.ts
//
// Stale-while-revalidate cache layer for schema manager data hooks.
// Returns cached data immediately while refreshing in the background.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

// ─── Module-Level Cache ──────────────────────────────────────

interface CacheEntry<T> {
    data: T;
    etag: string | null;
    fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// ─── Hook ────────────────────────────────────────────────────

export interface UseSwrFetchOptions {
    /** Skip automatic fetch on mount */
    paused?: boolean;
    /** Max age in ms before cache is considered stale (default: 30s) */
    staleTime?: number;
}

export interface UseSwrFetchResult<T> {
    data: T;
    loading: boolean;
    error: string | null;
    etag: string | null;
    /** Timestamp of last successful fetch */
    fetchedAt: number | null;
    /** True if data is served from cache (may be stale) */
    isStale: boolean;
    /** Force re-fetch from server */
    refresh: () => void;
    /** Manually update local data (optimistic) */
    mutateLocal: (updater: (prev: T) => T) => void;
}

export function useSwrFetch<T>(
    url: string,
    fallback: T,
    options?: UseSwrFetchOptions,
): UseSwrFetchResult<T> {
    const staleTime = options?.staleTime ?? 30_000;
    const paused = options?.paused ?? false;

    // Seed from cache if available
    const cached = cache.get(url) as CacheEntry<T> | undefined;

    const [data, setData] = useState<T>(cached?.data ?? fallback);
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(cached?.etag ?? null);
    const [fetchedAt, setFetchedAt] = useState<number | null>(cached?.fetchedAt ?? null);

    const abortRef = useRef<AbortController | null>(null);
    const urlRef = useRef(url);
    urlRef.current = url;

    const fetchData = useCallback(async (background = false) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!background) setLoading(true);
        setError(null);

        try {
            const res = await fetch(url, {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Request failed (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            const body = (await res.json()) as { data: T };
            const now = Date.now();

            // Update cache
            cache.set(url, { data: body.data, etag: serverEtag, fetchedAt: now });

            // Only update state if this is still the current URL
            if (urlRef.current === url && !controller.signal.aborted) {
                setData(body.data);
                if (serverEtag) setEtag(serverEtag);
                setFetchedAt(now);
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            if (!background) {
                setError(err instanceof Error ? err.message : "Fetch failed");
            }
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [url]);

    // Initial fetch + SWR background revalidation
    useEffect(() => {
        if (paused) return;

        const existing = cache.get(url) as CacheEntry<T> | undefined;
        if (existing) {
            // Serve stale data immediately
            setData(existing.data);
            setEtag(existing.etag);
            setFetchedAt(existing.fetchedAt);
            setLoading(false);

            // Revalidate in background if stale
            if (Date.now() - existing.fetchedAt > staleTime) {
                fetchData(true);
            }
        } else {
            fetchData(false);
        }

        return () => abortRef.current?.abort();
    }, [url, paused, fetchData, staleTime]);

    const isStale = fetchedAt !== null && Date.now() - fetchedAt > staleTime;

    const mutateLocal = useCallback((updater: (prev: T) => T) => {
        setData((prev) => {
            const next = updater(prev);
            // Also update cache
            const entry = cache.get(url) as CacheEntry<T> | undefined;
            if (entry) {
                cache.set(url, { ...entry, data: next });
            }
            return next;
        });
    }, [url]);

    return {
        data,
        loading,
        error,
        etag,
        fetchedAt,
        isStale,
        refresh: () => fetchData(false),
        mutateLocal,
    };
}

/** Invalidate all cache entries matching a prefix */
export function invalidateSwrCache(prefix?: string): void {
    if (!prefix) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}
