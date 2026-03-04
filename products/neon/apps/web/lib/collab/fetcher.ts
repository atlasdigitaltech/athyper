/**
 * Shared SWR fetcher with CSRF token support.
 */

import { buildHeaders } from "@/lib/schema-manager/use-csrf";

export async function collabFetcher<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: buildHeaders(),
        credentials: "same-origin",
    });

    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
        };
        throw new Error(body.error ?? body.message ?? `Request failed (${res.status})`);
    }

    return res.json() as Promise<T>;
}

/**
 * POST/PATCH/DELETE helper with CSRF + JSON body.
 */
export async function collabMutate<T = unknown>(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<T> {
    const headers: Record<string, string> = {
        ...buildHeaders(),
        "Content-Type": "application/json",
    };

    const res = await fetch(url, {
        method,
        headers,
        credentials: "same-origin",
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
        };
        throw new Error(errBody.error ?? errBody.message ?? `Request failed (${res.status})`);
    }

    // DELETE may return 204 with no body
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
}
