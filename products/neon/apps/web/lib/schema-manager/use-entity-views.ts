"use client";

// lib/schema-manager/use-entity-views.ts
//
// Hook for managing entity view configuration presets.
// Provides fetch + save with ETag concurrency control.
// On 404 (API not yet implemented), returns a single "All Columns" preset.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { MutationResult } from "./types";

// ─── Types ───────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";
export type ColumnWidth = "narrow" | "medium" | "wide";

export interface ViewColumn {
    fieldName: string;
    width: ColumnWidth;
    visible: boolean;
    sortOrder: number;
}

export interface ViewPreset {
    id: string;
    name: string;
    isDefault: boolean;
    columns: ViewColumn[];
    defaultSortField?: string;
    defaultSortDirection?: SortDirection;
}

export interface ViewConfig {
    views: ViewPreset[];
}

export interface UseEntityViewsResult {
    config: ViewConfig;
    loading: boolean;
    error: string | null;
    etag: string | null;
    refresh: () => void;
    saveConfig: (views: ViewPreset[]) => Promise<MutationResult>;
}

// ─── Hook ────────────────────────────────────────────────────

const DEFAULT_CONFIG: ViewConfig = {
    views: [
        {
            id: "default",
            name: "All Columns",
            isDefault: true,
            columns: [],
            defaultSortDirection: "asc",
        },
    ],
};

export function useEntityViews(entityName: string): UseEntityViewsResult {
    const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchConfig = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/views`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (res.status === 404) {
                setConfig(DEFAULT_CONFIG);
                return;
            }

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load view config (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            if (serverEtag) setEtag(serverEtag);

            const body = (await res.json()) as { data: ViewConfig };
            setConfig(body.data ?? DEFAULT_CONFIG);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load view config");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    useEffect(() => {
        fetchConfig();
        return () => abortRef.current?.abort();
    }, [fetchConfig]);

    const saveConfig = useCallback(
        async (views: ViewPreset[]): Promise<MutationResult> => {
            try {
                const headers: Record<string, string> = {
                    ...buildHeaders(),
                    "Content-Type": "application/json",
                };
                if (etag) headers["If-Match"] = etag;

                const res = await fetch(
                    `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/views`,
                    {
                        method: "PUT",
                        headers,
                        credentials: "same-origin",
                        body: JSON.stringify({ views }),
                    },
                );

                const body = (await res.json()) as MutationResult;

                if (res.ok && body.success) {
                    setConfig({ views });
                    const newEtag = res.headers.get("ETag");
                    if (newEtag) setEtag(newEtag);
                }

                return body;
            } catch (err) {
                return { success: false, error: { code: "NETWORK_ERROR", message: String(err) } };
            }
        },
        [entityName, etag],
    );

    return { config, loading, error, etag, refresh: fetchConfig, saveConfig };
}
