"use client";

// components/diagnostics/Tier2Actions.tsx
//
// Tier 2 — Enterprise diagnostic actions for ops and power users.

import { Activity, Download, RotateCcw, UserCheck } from "lucide-react";
import { useCallback, useState } from "react";


import { ActionCard } from "./ActionCard";
import { HealthPanel } from "./HealthPanel";
import { useDiagnosticAction } from "./useDiagnosticAction";

import type { ActionResult } from "./useDiagnosticAction";
import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { useMessages } from "@/lib/i18n/messages-context";


interface Tier2ActionsProps {
    onActionComplete?: () => void;
}

export function Tier2Actions({ onActionComplete }: Tier2ActionsProps) {
    const { t } = useMessages();
    const rebuildSession = useDiagnosticAction({
        url: "/api/admin/session/rebuild",
        method: "POST",
        onSuccess: onActionComplete,
    });

    const syncProfile = useDiagnosticAction({
        url: "/api/admin/user/sync-profile",
        method: "POST",
        onSuccess: onActionComplete,
    });

    // Health check uses GET + inline panel
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthResult, setHealthResult] = useState<ActionResult | null>(null);
    const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);

    const runHealthCheck = useCallback(async () => {
        setHealthLoading(true);
        setHealthResult(null);
        setHealthData(null);
        try {
            const res = await fetch("/api/admin/health");
            const data = (await res.json()) as Record<string, unknown>;
            if (res.ok) {
                setHealthData(data);
                setHealthResult({ ok: true, message: `${t("diag.health.overall_label")}: ${data.overall}` });
            } else {
                setHealthResult({ ok: false, message: (data.error as string) ?? t("diag.result.failed") });
            }
        } catch (err) {
            setHealthResult({ ok: false, message: err instanceof Error ? err.message : t("diag.result.failed") });
        } finally {
            setHealthLoading(false);
        }
    }, [t]);

    // Download report uses GET + blob download
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [downloadResult, setDownloadResult] = useState<ActionResult | null>(null);

    const downloadReport = useCallback(async () => {
        setDownloadLoading(true);
        setDownloadResult(null);
        try {
            const bootstrap =
                typeof window !== "undefined"
                    ? ((window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined)
                    : undefined;

            const res = await fetch("/api/admin/report", {
                headers: { "x-csrf-token": bootstrap?.csrfToken ?? "" },
            });

            if (!res.ok) {
                const errData = (await res.json()) as Record<string, unknown>;
                setDownloadResult({ ok: false, message: (errData.error as string) ?? t("diag.result.failed") });
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `neon-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setDownloadResult({ ok: true, message: t("diag.tier2.report_downloaded") });
        } catch (err) {
            setDownloadResult({ ok: false, message: err instanceof Error ? err.message : t("diag.result.failed") });
        } finally {
            setDownloadLoading(false);
            setTimeout(() => setDownloadResult(null), 5000);
        }
    }, [t]);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t("diag.tier2.title")}</h3>
                <span className="text-xs text-muted-foreground">{t("diag.tier2.subtitle")}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ActionCard
                    icon={RotateCcw}
                    title={t("diag.tier2.rebuild.title")}
                    description={t("diag.tier2.rebuild.desc")}
                    buttonLabel={t("diag.tier2.rebuild.button")}
                    loading={rebuildSession.loading}
                    result={rebuildSession.result}
                    onExecute={rebuildSession.execute}
                />
                <ActionCard
                    icon={UserCheck}
                    title={t("diag.tier2.sync_profile.title")}
                    description={t("diag.tier2.sync_profile.desc")}
                    buttonLabel={t("diag.tier2.sync_profile.button")}
                    loading={syncProfile.loading}
                    result={syncProfile.result}
                    onExecute={syncProfile.execute}
                />
                <ActionCard
                    icon={Download}
                    title={t("diag.tier2.download_report.title")}
                    description={t("diag.tier2.download_report.desc")}
                    buttonLabel={t("diag.tier2.download_report.button")}
                    loading={downloadLoading}
                    result={downloadResult}
                    onExecute={downloadReport}
                />
                <ActionCard
                    icon={Activity}
                    title={t("diag.tier2.infra_health.title")}
                    description={t("diag.tier2.infra_health.desc")}
                    buttonLabel={t("diag.tier2.infra_health.button")}
                    loading={healthLoading}
                    result={healthResult}
                    onExecute={runHealthCheck}
                />
            </div>

            {healthData && (
                <HealthPanel data={healthData as any} />
            )}
        </div>
    );
}
