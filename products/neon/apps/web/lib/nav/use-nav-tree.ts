"use client";

// lib/nav/use-nav-tree.ts
//
// React hook for loading and caching the dynamic navigation tree.
// Fetches from /api/nav/modules on mount and when workbench changes.

import { useCallback, useEffect, useState } from "react";

import { fetchNavTree } from "./nav-api";

import type { NavTree } from "./nav-types";

interface UseNavTreeResult {
    tree: NavTree | null;
    loading: boolean;
    error: Error | null;
    isFallback: boolean;
    refresh: () => void;
}

/**
 * Hook that loads the navigation tree for the active workbench.
 *
 * @param workbench - The active workbench ID
 * @param csrfToken - Optional CSRF token for API requests
 */
export function useNavTree(workbench: string, csrfToken?: string): UseNavTreeResult {
    const [tree, setTree] = useState<NavTree | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isFallback, setIsFallback] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchNavTree(workbench, csrfToken);
            setTree(response.tree);
            setIsFallback(response.isFallback);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setLoading(false);
        }
    }, [workbench, csrfToken]);

    useEffect(() => {
        load();
    }, [load]);

    return { tree, loading, error, isFallback, refresh: load };
}
