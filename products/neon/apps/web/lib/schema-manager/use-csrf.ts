"use client";

// lib/schema-manager/use-csrf.ts
//
// Shared CSRF token extraction from session bootstrap.

import type { SessionBootstrap } from "@/lib/session-bootstrap";

export function getCsrfToken(): string {
    if (typeof window === "undefined") return "";
    const bootstrap = (window as unknown as { __SESSION_BOOTSTRAP__?: SessionBootstrap }).__SESSION_BOOTSTRAP__;
    return bootstrap?.csrfToken ?? "";
}

export function buildHeaders(): Record<string, string> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
    return headers;
}
