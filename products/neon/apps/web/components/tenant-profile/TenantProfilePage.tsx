"use client";

// components/tenant-profile/TenantProfilePage.tsx
//
// Orchestrator for the Tenant Profile settings page.
// Renders sticky header + capability-gated tabs populated from SessionBootstrap.

import { Loader2 } from "lucide-react";
import { useMemo } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessages } from "@/lib/i18n/messages-context";

import { TenantProfileHeader } from "./TenantProfileHeader";
import { DomainsSsoTab } from "./tabs/DomainsSsoTab";
import { IamSecurityTab } from "./tabs/IamSecurityTab";
import { IdentityBrandingTab } from "./tabs/IdentityBrandingTab";
import { ModulesLimitsTab } from "./tabs/ModulesLimitsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { UsersRolesTab } from "./tabs/UsersRolesTab";
import { useTenantProfile, type TenantProfileTab } from "./use-tenant-profile";

// ─── Tab configuration ──────────────────────────────────────────────────────

interface TabConfig {
    id: TenantProfileTab;
    i18nKey: string;
    fallback: string;
}

const TABS_CONFIG: TabConfig[] = [
    { id: "overview", i18nKey: "tenant.profile.tab.overview", fallback: "Overview" },
    { id: "identity", i18nKey: "tenant.profile.tab.identity", fallback: "Identity & Branding" },
    { id: "iam", i18nKey: "tenant.profile.tab.iam", fallback: "IAM & Security" },
    { id: "users", i18nKey: "tenant.profile.tab.users", fallback: "Users & Roles" },
    { id: "domains", i18nKey: "tenant.profile.tab.domains", fallback: "Domains & SSO" },
    { id: "modules", i18nKey: "tenant.profile.tab.modules", fallback: "Modules & Limits" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function TenantProfilePage() {
    const data = useTenantProfile();
    const { t } = useMessages();

    const visibleTabSet = useMemo(
        () => new Set(data.visibleTabs),
        [data.visibleTabs],
    );

    const visibleTabsConfig = useMemo(
        () => TABS_CONFIG.filter((tab) => visibleTabSet.has(tab.id)),
        [visibleTabSet],
    );

    if (!data.ready) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ms-2 text-muted-foreground">
                    {t("tenant.profile.loading", "Loading tenant profile...")}
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <TenantProfileHeader data={data} />

            <Tabs defaultValue="overview">
                <TabsList variant="line">
                    {visibleTabsConfig.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id}>
                            {t(tab.i18nKey, tab.fallback)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="overview">
                    <OverviewTab data={data} />
                </TabsContent>

                <TabsContent value="identity">
                    <IdentityBrandingTab data={data} />
                </TabsContent>

                {visibleTabSet.has("iam") && (
                    <TabsContent value="iam">
                        <IamSecurityTab data={data} />
                    </TabsContent>
                )}

                {visibleTabSet.has("users") && (
                    <TabsContent value="users">
                        <UsersRolesTab data={data} />
                    </TabsContent>
                )}

                {visibleTabSet.has("domains") && (
                    <TabsContent value="domains">
                        <DomainsSsoTab data={data} />
                    </TabsContent>
                )}

                <TabsContent value="modules">
                    <ModulesLimitsTab data={data} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
