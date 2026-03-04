"use client";

// components/diagnostics/HealthPanel.tsx
//
// Renders platform services health check results.

import { DebugRow } from "@/components/debug/DebugSection";
import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/messages-context";

interface HealthCheck {
    status: "ok" | "degraded" | "down" | "not_configured";
    latencyMs?: number;
    error?: string;
    [key: string]: unknown;
}

interface HealthData {
    overall: string;
    checks: {
        redis: HealthCheck;
        keycloak: HealthCheck;
        apiMesh: HealthCheck;
    };
    timestamp: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
        case "ok": return "default";
        case "degraded": return "secondary";
        case "down": return "destructive";
        default: return "outline";
    }
}

interface HealthPanelProps {
    data: HealthData;
}

export function HealthPanel({ data }: HealthPanelProps) {
    const { t } = useMessages();
    return (
        <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("diag.health.overall_status")}</span>
                <Badge variant={statusVariant(data.overall)}>{data.overall}</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Cache */}
                <div className="space-y-1 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t("diag.health.cache")}</span>
                        <Badge variant={statusVariant(data.checks.redis.status)}>
                            {data.checks.redis.status}
                        </Badge>
                    </div>
                    {data.checks.redis.latencyMs != null && (
                        <DebugRow label={t("diag.health.latency")} value={`${data.checks.redis.latencyMs}ms`} />
                    )}
                    {data.checks.redis.sessionTtl != null && (
                        <DebugRow label={t("diag.health.session_ttl")} value={`${data.checks.redis.sessionTtl}s`} />
                    )}
                    {data.checks.redis.error && (
                        <p className="text-xs text-destructive mt-1">{data.checks.redis.error}</p>
                    )}
                </div>

                {/* Identity */}
                <div className="space-y-1 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t("diag.health.identity")}</span>
                        <Badge variant={statusVariant(data.checks.keycloak.status)}>
                            {data.checks.keycloak.status}
                        </Badge>
                    </div>
                    {data.checks.keycloak.latencyMs != null && (
                        <DebugRow label={t("diag.health.latency")} value={`${data.checks.keycloak.latencyMs}ms`} />
                    )}
                    {data.checks.keycloak.keyCount != null && (
                        <DebugRow label={t("diag.health.jwks_keys")} value={String(data.checks.keycloak.keyCount)} />
                    )}
                    {data.checks.keycloak.error && (
                        <p className="text-xs text-destructive mt-1">{data.checks.keycloak.error}</p>
                    )}
                </div>

                {/* API Mesh */}
                <div className="space-y-1 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t("diag.health.api_mesh")}</span>
                        <Badge variant={statusVariant(data.checks.apiMesh.status)}>
                            {data.checks.apiMesh.status}
                        </Badge>
                    </div>
                    {data.checks.apiMesh.latencyMs != null && (
                        <DebugRow label={t("diag.health.latency")} value={`${data.checks.apiMesh.latencyMs}ms`} />
                    )}
                    {data.checks.apiMesh.error && (
                        <p className="text-xs text-destructive mt-1">{data.checks.apiMesh.error}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
