"use client";

// lib/schema-manager/use-entity-meta.ts
//
// Fetches entity metadata including current version summary.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { EntitySummary } from "./types";

export interface UseEntityMetaResult {
    entity: EntitySummary | null;
    loading: boolean;
    error: string | null;
    etag: string | null;
    refresh: () => void;
}

export function useEntityMeta(entityName: string): UseEntityMetaResult {
    const [entity, setEntity] = useState<EntitySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchEntity = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}`, {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load entity (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            if (serverEtag) setEtag(serverEtag);

            const body = (await res.json()) as { data: EntitySummary };
            setEntity(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load entity");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    useEffect(() => {
        fetchEntity();
        return () => abortRef.current?.abort();
    }, [fetchEntity]);

    return { entity, loading, error, etag, refresh: fetchEntity };
}
