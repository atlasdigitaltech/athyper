"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { CompiledSnapshot } from "./types";

export interface UseEntityCompiledResult {
    compiled: CompiledSnapshot | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
    recompile: () => Promise<void>;
    recompiling: boolean;
}

export function useEntityCompiled(entityName: string): UseEntityCompiledResult {
    const [compiled, setCompiled] = useState<CompiledSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recompiling, setRecompiling] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const fetchCompiled = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/compiled`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load compiled snapshot (${res.status})`);
            }

            const body = (await res.json()) as { data: CompiledSnapshot };
            setCompiled(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load compiled snapshot");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    const recompile = useCallback(async () => {
        setRecompiling(true);
        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/compile`,
                {
                    method: "POST",
                    headers: { ...buildHeaders(), "Content-Type": "application/json" },
                    credentials: "same-origin",
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Recompilation failed (${res.status})`);
            }

            await fetchCompiled();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Recompilation failed");
        } finally {
            setRecompiling(false);
        }
    }, [entityName, fetchCompiled]);

    useEffect(() => {
        fetchCompiled();
        return () => abortRef.current?.abort();
    }, [fetchCompiled]);

    return { compiled, loading, error, refresh: fetchCompiled, recompile, recompiling };
}
