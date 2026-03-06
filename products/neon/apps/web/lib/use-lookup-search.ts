"use client";

/**
 * Lookup Search Client Hook
 *
 * Debounced, paginated typeahead search hook for reference field pickers.
 * Calls GET /api/lookup/:entity with the resolved LookupProfile parameters.
 */

import { useState, useEffect, useRef, useCallback } from "react";

import type { EffectiveLookupProfile } from "@/lib/entity-page/resolve-field-meta";

// ============================================================================
// Types
// ============================================================================

export interface LookupItem {
    id: string;
    label: string;
    sublabel?: string;
    tokens?: string[];
    meta?: Record<string, unknown>;
}

// ============================================================================
// Hook
// ============================================================================

export function useLookupSearch(
    entity: string | undefined,
    profile: EffectiveLookupProfile | undefined,
    context: "create" | "edit" | "view",
    /** Source entity name — enables server-authoritative profile resolution */
    sourceEntity?: string,
    /** Source field name — enables server-authoritative profile resolution */
    fieldName?: string,
): {
    query: string;
    setQuery: (q: string) => void;
    results: LookupItem[];
    loading: boolean;
    hasMore: boolean;
} {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<LookupItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const minChars = profile?.minChars ?? 2;
    const debounceMs = profile?.debounceMs ?? 300;
    const pageSize = profile?.pageSize ?? 20;

    const executeSearch = useCallback(
        async (searchQuery: string) => {
            if (!entity || searchQuery.length < minChars) {
                setResults([]);
                setHasMore(false);
                return;
            }

            // Abort any in-flight request
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setLoading(true);
            try {
                const params = new URLSearchParams({
                    q: searchQuery,
                    limit: String(pageSize),
                    context,
                });

                // Server-authoritative: send source field identity so server
                // resolves lookup_profile from compiled metadata (not client data)
                if (sourceEntity && fieldName) {
                    params.set("sourceEntity", sourceEntity);
                    params.set("fieldName", fieldName);
                } else if (profile) {
                    // Fallback: send profile directly (less secure, for unregistered fields)
                    const serverProfile: Record<string, unknown> = {};
                    if (profile.searchFields) serverProfile.searchFields = profile.searchFields;
                    if (profile.filters) serverProfile.filters = profile.filters;
                    if (profile.filtersByContext) serverProfile.filtersByContext = profile.filtersByContext;
                    if (profile.orderBy) serverProfile.orderBy = profile.orderBy;
                    if (profile.displayTemplate) serverProfile.displayTemplate = profile.displayTemplate;
                    if (Object.keys(serverProfile).length > 0) {
                        params.set("profile", JSON.stringify(serverProfile));
                    }
                }

                const res = await fetch(
                    `/api/lookup/${encodeURIComponent(entity)}?${params}`,
                    { signal: controller.signal },
                );

                if (!res.ok) {
                    setResults([]);
                    setHasMore(false);
                    return;
                }

                const json = (await res.json()) as {
                    data?: { items?: LookupItem[]; nextCursor?: string };
                };

                if (!controller.signal.aborted) {
                    setResults(json.data?.items ?? []);
                    setHasMore(!!json.data?.nextCursor);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                setResults([]);
                setHasMore(false);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        },
        [entity, minChars, pageSize, context, profile, sourceEntity, fieldName],
    );

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (query.length < minChars) {
            setResults([]);
            setHasMore(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        debounceRef.current = setTimeout(() => {
            executeSearch(query);
        }, debounceMs);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, minChars, debounceMs, executeSearch]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    return { query, setQuery, results, loading, hasMore };
}
