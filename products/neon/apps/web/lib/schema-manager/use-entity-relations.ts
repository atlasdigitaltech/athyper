"use client";

// lib/schema-manager/use-entity-relations.ts

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { RelationDefinition } from "./types";

export interface UseEntityRelationsResult {
    relations: RelationDefinition[];
    loading: boolean;
    error: string | null;
    etag: string | null;
    refresh: () => void;
}

export function useEntityRelations(entityName: string): UseEntityRelationsResult {
    const [relations, setRelations] = useState<RelationDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchRelations = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/relations`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load relations (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            if (serverEtag) setEtag(serverEtag);

            const body = (await res.json()) as { data: RelationDefinition[] };
            setRelations(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load relations");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    useEffect(() => {
        fetchRelations();
        return () => abortRef.current?.abort();
    }, [fetchRelations]);

    return { relations, loading, error, etag, refresh: fetchRelations };
}
