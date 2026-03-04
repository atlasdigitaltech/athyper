"use client";

// lib/nav/nav-api.ts
//
// Client-side fetcher for the dynamic navigation tree.
// Fetches from /api/nav/modules with the active workbench context.

import type { NavTreeResponse } from "./nav-types";

/**
 * Fetch the navigation tree for a given workbench.
 *
 * @param workbench - The active workbench (e.g., "admin")
 * @param csrfToken - CSRF token for the request header
 */
export async function fetchNavTree(workbench: string, csrfToken?: string): Promise<NavTreeResponse> {
    const headers: Record<string, string> = {};
    if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
    }

    const res = await fetch(`/api/nav/modules?wb=${encodeURIComponent(workbench)}`, {
        headers,
        credentials: "same-origin",
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch nav tree: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as NavTreeResponse;
}
