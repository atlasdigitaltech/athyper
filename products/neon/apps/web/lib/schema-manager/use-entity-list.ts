"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

export interface EntitySummary {
    name: string;
    code: string;
    kind: string;
    label?: string;
    fieldCount: number;
    currentVersionStatus?: string;
    createdAt: string;
}

interface UseEntityListResult {
    entities: EntitySummary[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useEntityList(): UseEntityListResult {
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
                throw new Error(body.error?.message ?? `Failed to load entities (${res.status})`);
            }

            const body = (await res.json()) as { data: EntitySummary[] };
            setEntities(body.data ?? []);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load entities");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEntities();
        return () => abortRef.current?.abort();
    }, [fetchEntities]);

    return { entities, loading, error, refresh: fetchEntities };
}
