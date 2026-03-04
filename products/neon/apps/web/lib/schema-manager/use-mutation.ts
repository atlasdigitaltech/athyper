"use client";

// lib/schema-manager/use-mutation.ts
//
// Generic mutation hook with ETag-based optimistic concurrency control.
// Handles conflict detection (409/412) and provides callbacks for resolution.

import { useCallback, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { ConflictError, MutationResult } from "./types";

export interface UseMutationOptions<T> {
    url: string;
    method?: "POST" | "PUT" | "DELETE";
    etag?: string | null;
    onSuccess?: (data: T) => void;
    onConflict?: (error: ConflictError) => void;
    onError?: (error: { code: string; message: string }) => void;
}

export interface UseMutationReturn<T> {
    mutate: (body?: unknown) => Promise<MutationResult<T>>;
    loading: boolean;
    error: string | null;
}

export function useMutation<T = unknown>(options: UseMutationOptions<T>): UseMutationReturn<T> {
    const { url, method = "POST", etag, onSuccess, onConflict, onError } = options;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const mutate = useCallback(async (body?: unknown): Promise<MutationResult<T>> => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const headers: Record<string, string> = {
                ...buildHeaders(),
            };
            if (body !== undefined) headers["Content-Type"] = "application/json";
            if (etag) headers["If-Match"] = etag;

            const res = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                credentials: "same-origin",
                signal: controller.signal,
            });

            const result = (await res.json()) as MutationResult<T>;

            if (res.status === 409 || res.status === 412) {
                const conflictErr = result.error as ConflictError;
                setError(conflictErr.message);
                onConflict?.(conflictErr);
                return result;
            }

            if (!res.ok) {
                const errMsg = result.error?.message ?? `Request failed (${res.status})`;
                setError(errMsg);
                onError?.(result.error as { code: string; message: string });
                return result;
            }

            onSuccess?.(result.data as T);
            return result;
        } catch (err) {
            if ((err as Error).name === "AbortError") {
                return { success: false, error: { code: "ABORTED", message: "Request cancelled" } };
            }
            const msg = err instanceof Error ? err.message : "Mutation failed";
            setError(msg);
            return { success: false, error: { code: "NETWORK_ERROR", message: msg } };
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [url, method, etag, onSuccess, onConflict, onError]);

    return { mutate, loading, error };
}
