"use client";

/**
 * Entity Data Fetching Hook
 *
 * Fetches paginated entity records from the BFF data API.
 * Supports server-side pagination, sorting, search, and filtering.
 *
 * Usage:
 *   const { data, meta, loading, error, refresh } = useEntityData("account", {
 *     page: 1, pageSize: 25, search: "john", filters: "status:ACTIVE,name:~inc"
 *   });
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export interface PaginationMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    /** True when the server applied search/filter WHERE clauses */
    serverFiltered?: boolean;
    /** True when the server applied ORDER BY from the sort param */
    serverSorted?: boolean;
}

export interface UseEntityDataOptions {
    page?: number;
    pageSize?: number;
    sort?: string;
    dir?: "asc" | "desc";
    search?: string;
    /** Server-side filters: "column:value,column:~partial" format */
    filters?: string;
    /** Comma-separated visible column IDs — limits FK resolution to these columns */
    columns?: string;
}

// ============================================================================
// Request Dedupe — reuse in-flight promise for identical query URLs
// ============================================================================

const _inflight = new Map<string, Promise<Response>>();

function dedupedfetch(url: string, signal: AbortSignal): Promise<Response> {
    const existing = _inflight.get(url);
    if (existing) return existing;

    const p = fetch(url, { credentials: "same-origin", signal })
        .finally(() => { _inflight.delete(url); });
    _inflight.set(url, p);
    return p;
}

// ============================================================================
// Search minLength (client-side guard — avoids wasted round-trips)
// ============================================================================

const SEARCH_MIN_LENGTH = 2;

// ============================================================================
// Hook
// ============================================================================

export function useEntityData(
    entityKey: string,
    options?: UseEntityDataOptions,
): {
    data: Record<string, unknown>[];
    meta: PaginationMeta;
    loading: boolean;
    error: string | null;
    refresh: () => void;
} {
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<PaginationMeta>({
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const refreshCounter = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 25;
    const sort = options?.sort ?? "";
    const dir = options?.dir ?? "desc";
    const search = options?.search ?? "";
    const filters = options?.filters ?? "";
    const columns = options?.columns ?? "";

    const fetchData = useCallback(async () => {
        if (!entityKey) return;

        // Cancel any in-flight request to prevent out-of-order responses
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("pageSize", String(pageSize));
            if (sort) params.set("sort", sort);
            if (dir) params.set("dir", dir);
            // Only send search if it meets minimum length (avoids wasted round-trip)
            if (search && search.length >= SEARCH_MIN_LENGTH) params.set("search", search);
            if (filters) params.set("filters", filters);
            if (columns) params.set("columns", columns);

            const url = `/api/data/${encodeURIComponent(entityKey)}?${params.toString()}`;
            const res = await dedupedfetch(url, controller.signal);

            // If aborted between fetch start and response processing, bail out
            if (controller.signal.aborted) return;

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load records (${res.status})`);
            }

            const body = (await res.json()) as {
                data?: Record<string, unknown>[] | { data: Record<string, unknown>[]; meta: PaginationMeta };
                total?: number;
            };

            // Don't update state if this request was superseded
            if (controller.signal.aborted) return;

            // Handle both response shapes:
            // Old mock format: { data: T[], total: number }
            // New DB format:   { data: { data: T[], meta: PaginationMeta } }
            if (body.data && "data" in body.data && Array.isArray((body.data as any).data)) {
                const nested = body.data as { data: Record<string, unknown>[]; meta: PaginationMeta };
                setData(nested.data);
                setPaginationMeta(nested.meta);
            } else if (Array.isArray(body.data)) {
                setData(body.data);
                const total = body.total ?? body.data.length;
                const computedTotalPages = Math.ceil(total / pageSize) || 1;
                setPaginationMeta({
                    page,
                    pageSize,
                    total,
                    totalPages: computedTotalPages,
                    hasNext: page < computedTotalPages,
                    hasPrev: page > 1,
                    // Server processes sort/search/filter query params even in old format
                    serverFiltered: !!(search || filters),
                    serverSorted: !!sort,
                });
            } else {
                setData([]);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load records");
            setData([]);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityKey, page, pageSize, sort, dir, search, filters, columns]);

    useEffect(() => {
        fetchData();
        return () => { abortRef.current?.abort(); };
    }, [fetchData, refreshCounter.current]);

    const refresh = useCallback(() => {
        refreshCounter.current += 1;
        fetchData();
    }, [fetchData]);

    return { data, meta: paginationMeta, loading, error, refresh };
}
