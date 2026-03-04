"use client";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

/**
 * Hook that returns a function to build headers with CSRF token.
 */
export function useCsrfToken(): () => Record<string, string> {
    return () => {
        if (typeof window === "undefined") return {};
        const bootstrap = (window as unknown as { __SESSION_BOOTSTRAP__?: SessionBootstrap }).__SESSION_BOOTSTRAP__;
        const csrfToken = bootstrap?.csrfToken ?? "";
        const headers: Record<string, string> = {};
        if (csrfToken) headers["x-csrf-token"] = csrfToken;
        return headers;
    };
}
