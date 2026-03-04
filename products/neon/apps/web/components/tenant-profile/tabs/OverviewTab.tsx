"use client";

// tabs/OverviewTab.tsx — Identifiers, operating context, feature flags, security posture

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/messages-context";

import { FieldRow, PlaceholderBadge, SectionCard, StatusBadge } from "../shared";
import type { TenantProfileData } from "../use-tenant-profile";

interface OverviewTabProps {
    data: TenantProfileData;
}

export function OverviewTab({ data }: OverviewTabProps) {
    const { t } = useMessages();

    return (
        <div className="space-y-4">
            {/* Identifiers */}
            <SectionCard title={t("tenant.profile.identifiers", "Identifiers")}>
                <FieldRow
                    label={t("tenant.profile.tenantCode", "Tenant Code")}
                    value={data.tenantId}
                    copyable
                    mono
                />
                <FieldRow
                    label={t("tenant.profile.tenantName", "Tenant Name")}
                    value={data.tenantDisplayName}
                />
                <FieldRow
                    label={t("tenant.profile.userId", "User ID")}
                    value={data.userId}
                    copyable
                    mono
                />
                <FieldRow
                    label={t("tenant.profile.region", "Region")}
                    value={<PlaceholderBadge />}
                />
            </SectionCard>

            {/* Operating Context */}
            <SectionCard title={t("tenant.profile.operatingContext", "Operating Context")}>
                <FieldRow
                    label={t("tenant.profile.workbench", "Workbench")}
                    value={data.workbench}
                />
                <FieldRow
                    label={t("tenant.profile.environment", "Environment")}
                    value={<StatusBadge value={data.environment} variant="environment" />}
                />
                <FieldRow
                    label={t("tenant.profile.subscriptionTier", "Subscription Tier")}
                    value={data.subscriptionTier}
                />
                {data.isPlatformAdmin && data.selectedTenantId && (
                    <FieldRow
                        label={t("tenant.profile.operatingAs", "Operating As")}
                        value={data.selectedTenantId}
                        mono
                    />
                )}
            </SectionCard>

            {/* Feature Flags */}
            <SectionCard title={t("tenant.profile.featureFlags", "Feature Flags")}>
                {Object.keys(data.featureFlags).length > 0 ? (
                    <div className="flex flex-wrap gap-2 py-2">
                        {Object.entries(data.featureFlags).map(([flag, enabled]) => (
                            <Badge
                                key={flag}
                                variant={enabled ? "default" : "outline"}
                                className="text-xs"
                            >
                                {flag}: {enabled ? "ON" : "OFF"}
                            </Badge>
                        ))}
                    </div>
                ) : (
                    <p className="py-3 text-center text-sm text-muted-foreground">
                        {t("tenant.profile.noFeatureFlags", "No feature flags configured")}
                    </p>
                )}
            </SectionCard>

            {/* Security Posture */}
            <SectionCard title={t("tenant.profile.securityPosture", "Security Posture")}>
                <FieldRow
                    label={t("tenant.profile.personas", "Personas")}
                    value={data.personas.length > 0
                        ? data.personas.map((p) => (
                            <Badge key={p} variant="secondary" className="mr-1 text-xs capitalize">{p.replace(/_/g, " ")}</Badge>
                        ))
                        : "—"
                    }
                />
                <FieldRow
                    label={t("tenant.profile.realmRoles", "Realm Roles")}
                    value={String(data.roles.length)}
                />
                <FieldRow
                    label={t("tenant.profile.moduleCount", "Modules")}
                    value={String(data.modules.length)}
                />
                <FieldRow
                    label={t("tenant.profile.groupCount", "Groups")}
                    value={String(data.groups.length)}
                />
                {data.isPlatformAdmin && (
                    <FieldRow
                        label={t("tenant.profile.platformAdmin", "Platform Admin")}
                        value={<Badge variant="default" className="text-xs">Yes</Badge>}
                    />
                )}
            </SectionCard>
        </div>
    );
}
