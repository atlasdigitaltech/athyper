"use client";

// lib/schema-manager/use-schema-list.ts
//
// Fetches the list of entities from the BFF API.
// Follows the useEntityPageDescriptor pattern with AbortController + CSRF.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { EntitySummary } from "./types";

export interface UseSchemaListResult {
    entities: EntitySummary[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useSchemaList(): UseSchemaListResult {
    const [entities, setEntities] = useState<EntitySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchEntities = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/mesh/meta-studio", {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load schemas (${res.status})`);
            }

            const body = (await res.json()) as { data: EntitySummary[] };
            setEntities(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load schemas");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchEntities();
        return () => abortRef.current?.abort();
    }, [fetchEntities]);

    return { entities, loading, error, refresh: fetchEntities };
}
