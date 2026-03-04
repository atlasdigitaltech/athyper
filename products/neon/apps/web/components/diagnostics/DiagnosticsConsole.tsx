"use client";

// components/diagnostics/DiagnosticsConsole.tsx
//
// Top-level orchestrator for the Diagnostics page.
// Structure:
//   Tier1Actions (essential card grid)
//   Separator
//   Tier2Actions (enterprise card grid)
//   Separator
//   SessionDebugConsole (existing 4-tab debug data, prop-driven)

import { useCallback, useEffect, useRef, useState } from "react";

import { Tier1Actions } from "./Tier1Actions";
import { Tier2Actions } from "./Tier2Actions";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { SessionDebugConsole } from "@/components/debug/SessionDebugConsole";
import { Separator } from "@/components/ui/separator";
import { useMessages } from "@/lib/i18n/messages-context";




type DebugData = Record<string, unknown>;

export function DiagnosticsConsole() {
    const { t } = useMessages();
    const [data, setData] = useState<DebugData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchDebug = useCallback(async () => {
        try {
            const bootstrap =
                typeof window !== "undefined"
                    ? ((window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined)
                    : undefined;

            const csrfToken = bootstrap?.csrfToken ?? "";
            const res = await fetch("/api/auth/debug", {
                headers: { "x-csrf-token": csrfToken },
            });

            if (!res.ok) {
                const text = await res.text();
                setError(`${t("diag.error.fetch_failed")} (${res.status}): ${text}`);
                setData(null);
                return;
            }

            const json = await res.json();
            setData(json as DebugData);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : t("diag.error.fetch_error"));
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchDebug();
        timerRef.current = setInterval(fetchDebug, 30_000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [fetchDebug]);

    const handleActionComplete = useCallback(() => {
        // Refresh debug data after any action
        fetchDebug();
    }, [fetchDebug]);

    return (
        <div className="space-y-6">
            <Tier1Actions onActionComplete={handleActionComplete} />
            <Separator />
            <Tier2Actions onActionComplete={handleActionComplete} />
            <Separator />
            <SessionDebugConsole
                data={data}
                loading={loading}
                error={error}
                onRetry={fetchDebug}
            />
        </div>
    );
}
