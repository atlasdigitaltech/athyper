"use client";

// components/diagnostics/useDiagnosticAction.ts
//
// Custom hook encapsulating the common pattern for diagnostic actions:
// CSRF header injection, loading/result state, auto-clear, and redirect handling.

import { useCallback, useRef, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { useMessages } from "@/lib/i18n/messages-context";



export interface ActionResult {
    ok: boolean;
    message: string;
    detail?: string;
    data?: Record<string, unknown>;
}

interface UseDiagnosticActionOptions {
    url: string;
    method?: "GET" | "POST";
    onSuccess?: (data: Record<string, unknown>) => void;
}

export function useDiagnosticAction(options: UseDiagnosticActionOptions) {
    const { url, method = "POST", onSuccess } = options;
    const { t } = useMessages();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ActionResult | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearResult = useCallback(() => {
        setResult(null);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const execute = useCallback(async () => {
        setLoading(true);
        clearResult();

        try {
            const bootstrap =
                typeof window !== "undefined"
                    ? ((window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined)
                    : undefined;

            const csrfToken = bootstrap?.csrfToken ?? "";

            const res = await fetch(url, {
                method,
                headers: { "x-csrf-token": csrfToken },
            });

            const data = (await res.json()) as Record<string, unknown>;

            // Handle redirect (session expired)
            if (data.redirect && typeof data.redirect === "string") {
                window.location.href = data.redirect;
                return;
            }

            // Update CSRF token if rotated by the action
            if (data.csrfToken && typeof data.csrfToken === "string" && bootstrap) {
                (bootstrap as any).csrfToken = data.csrfToken;
            }

            if (res.ok) {
                const actionResult: ActionResult = {
                    ok: true,
                    message: t("diag.result.success"),
                    data,
                };
                setResult(actionResult);
                onSuccess?.(data);
            } else {
                setResult({
                    ok: false,
                    message: (data.error as string) ?? `${t("diag.result.failed")} (${res.status})`,
                    detail: (data.message as string) ?? undefined,
                });
            }
        } catch (err) {
            setResult({
                ok: false,
                message: err instanceof Error ? err.message : t("diag.result.action_failed"),
            });
        } finally {
            setLoading(false);
            // Auto-clear result after 5 seconds
            timerRef.current = setTimeout(() => setResult(null), 5000);
        }
    }, [url, method, onSuccess, clearResult, t]);

    return { execute, loading, result, clearResult };
}
