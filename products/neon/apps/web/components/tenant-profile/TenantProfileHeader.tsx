"use client";

// components/tenant-profile/TenantProfileHeader.tsx
//
// Sticky header for the Tenant Profile page.
// Shows tenant name, status/env/tier badges, and Export JSON action.

import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/messages-context";

import { StatusBadge } from "./shared";
import type { TenantProfileData } from "./use-tenant-profile";

interface TenantProfileHeaderProps {
    data: TenantProfileData;
}

function handleExportJson(data: TenantProfileData) {
    const exportData = {
        tenantId: data.tenantId,
        tenantDisplayName: data.tenantDisplayName,
        environment: data.environment,
        subscriptionTier: data.subscriptionTier,
        workbench: data.workbench,
        modules: data.modules,
        personas: data.personas,
        roles: data.roles,
        clientRoles: data.clientRoles,
        groups: data.groups,
        featureFlags: data.featureFlags,
        isPlatformAdmin: data.isPlatformAdmin,
        platformRoles: data.platformRoles,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenant-profile-${data.tenantId}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function TenantProfileHeader({ data }: TenantProfileHeaderProps) {
    const { t } = useMessages();

    return (
        <div className="sticky top-0 z-10 border-b bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">
                        {data.tenantDisplayName || data.tenantId}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default" className="text-xs">
                            {t("tenant.profile.active", "Active")}
                        </Badge>
                        <StatusBadge value={data.environment} variant="environment" />
                        {data.subscriptionTier && (
                            <Badge variant="secondary" className="text-xs">
                                {data.subscriptionTier}
                            </Badge>
                        )}
                        {data.isPlatformAdmin && (
                            <Badge variant="outline" className="text-xs">
                                {t("tenant.profile.platformAdmin", "Platform Admin")}
                            </Badge>
                        )}
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportJson(data)}
                >
                    <Download className="mr-2 size-4" />
                    {t("tenant.profile.exportJson", "Export JSON")}
                </Button>
            </div>
        </div>
    );
}
