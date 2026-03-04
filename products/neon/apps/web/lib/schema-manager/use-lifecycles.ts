"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

interface LifecycleSummary {
    id: string;
    code: string;
    name: string;
    stateCount: number;
    transitionCount: number;
    isActive: boolean;
    createdAt: string;
}

interface UseLifecycleListResult {
    lifecycles: LifecycleSummary[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useLifecycleList(): UseLifecycleListResult {
    const [lifecycles, setLifecycles] = useState<LifecycleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchLifecycles = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/mesh/lifecycle", {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load lifecycles (${res.status})`);
            }

            const body = (await res.json()) as { data: LifecycleSummary[] };
            setLifecycles(body.data ?? []);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load lifecycles");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLifecycles();
        return () => abortRef.current?.abort();
    }, [fetchLifecycles]);

    return { lifecycles, loading, error, refresh: fetchLifecycles };
}
