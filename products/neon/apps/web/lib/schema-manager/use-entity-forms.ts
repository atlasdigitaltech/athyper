"use client";

// lib/schema-manager/use-entity-forms.ts
//
// Hook for managing entity form section layouts.
// Provides fetch + save operations with ETag concurrency control.
// On 404 (API not yet implemented), returns empty sections — the component
// computes a sensible default from the entity's field list.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { MutationResult } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface FormSection {
    code: string;
    label: string;
    columns: 1 | 2 | 3;
    fields: string[];
}

export interface FormLayout {
    sections: FormSection[];
}

export interface UseEntityFormsResult {
    layout: FormLayout;
    loading: boolean;
    error: string | null;
    etag: string | null;
    refresh: () => void;
    saveLayout: (sections: FormSection[]) => Promise<MutationResult>;
}

// ─── Hook ────────────────────────────────────────────────────

const EMPTY_LAYOUT: FormLayout = { sections: [] };

export function useEntityForms(entityName: string): UseEntityFormsResult {
    const [layout, setLayout] = useState<FormLayout>(EMPTY_LAYOUT);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchLayout = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/forms`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (res.status === 404) {
                setLayout(EMPTY_LAYOUT);
                return;
            }

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load form layout (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            if (serverEtag) setEtag(serverEtag);

            const body = (await res.json()) as { data: FormLayout };
            setLayout(body.data ?? EMPTY_LAYOUT);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load form layout");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    useEffect(() => {
        fetchLayout();
        return () => abortRef.current?.abort();
    }, [fetchLayout]);

    const saveLayout = useCallback(
        async (sections: FormSection[]): Promise<MutationResult> => {
            try {
                const headers: Record<string, string> = {
                    ...buildHeaders(),
                    "Content-Type": "application/json",
                };
                if (etag) headers["If-Match"] = etag;

                const res = await fetch(
                    `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/forms`,
                    {
                        method: "PUT",
                        headers,
                        credentials: "same-origin",
                        body: JSON.stringify({ sections }),
                    },
                );

                const body = (await res.json()) as MutationResult;

                if (res.ok && body.success) {
                    setLayout({ sections });
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

    return { layout, loading, error, etag, refresh: fetchLayout, saveLayout };
}
