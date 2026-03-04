"use client";

// lib/schema-manager/use-entity-fields.ts
//
// Fetches fields for a specific entity. Supports CRUD + reorder.

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { FieldDefinition } from "./types";

export interface UseEntityFieldsResult {
    fields: FieldDefinition[];
    loading: boolean;
    error: string | null;
    etag: string | null;
    refresh: () => void;
}

export function useEntityFields(entityName: string): UseEntityFieldsResult {
    const [fields, setFields] = useState<FieldDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [etag, setEtag] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchFields = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load fields (${res.status})`);
            }

            const serverEtag = res.headers.get("ETag");
            if (serverEtag) setEtag(serverEtag);

            const body = (await res.json()) as { data: FieldDefinition[] };
            setFields(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load fields");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [entityName]);

    useEffect(() => {
        fetchFields();
        return () => abortRef.current?.abort();
    }, [fetchFields]);

    return { fields, loading, error, etag, refresh: fetchFields };
}
