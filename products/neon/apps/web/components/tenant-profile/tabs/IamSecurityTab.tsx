"use client";

// tabs/IamSecurityTab.tsx — Auth mode, session settings, security policies

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/messages-context";

import { FieldRow, PlaceholderBadge, SectionCard } from "../shared";
import type { TenantProfileData } from "../use-tenant-profile";

interface IamSecurityTabProps {
    data: TenantProfileData;
}

function formatIdleTimeout(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m} min` : `${seconds}s`;
}

export function IamSecurityTab({ data }: IamSecurityTabProps) {
    const { t } = useMessages();

    return (
        <div className="space-y-4">
            {/* Authentication */}
            <SectionCard title={t("tenant.profile.authentication", "Authentication")}>
                <FieldRow
                    label={t("tenant.profile.authProvider", "Provider")}
                    value="Keycloak"
                />
                <FieldRow
                    label={t("tenant.profile.authRealm", "Realm")}
                    value={data.tenantId}
                    mono
                />
                <FieldRow
                    label={t("tenant.profile.pkce", "PKCE")}
                    value={<Badge variant="default" className="text-xs">{t("tenant.profile.enabled", "Enabled")}</Badge>}
                />
            </SectionCard>

            {/* Session Settings */}
            <SectionCard title={t("tenant.profile.sessionSettings", "Session Settings")}>
                <FieldRow
                    label={t("tenant.profile.idleTimeout", "Idle Timeout")}
                    value={formatIdleTimeout(data.idleTimeoutSec)}
                />
                <FieldRow
                    label={t("tenant.profile.maxSessionLifetime", "Max Session Lifetime")}
                    value={<PlaceholderBadge />}
                />
                <FieldRow
                    label={t("tenant.profile.proactiveRefresh", "Proactive Refresh")}
                    value={<Badge variant="default" className="text-xs">{t("tenant.profile.enabled", "Enabled")}</Badge>}
                />
            </SectionCard>

            {/* Security Policies */}
            <SectionCard title={t("tenant.profile.securityPolicies", "Security Policies")}>
                <FieldRow
                    label={t("tenant.profile.passwordPolicy", "Password Policy")}
                    value={<PlaceholderBadge />}
                />
                <FieldRow
                    label={t("tenant.profile.mfaPolicy", "MFA Policy")}
                    value={<PlaceholderBadge />}
                />
                <FieldRow
                    label={t("tenant.profile.ipUaBinding", "IP/UA Binding")}
                    value={<Badge variant="secondary" className="text-xs">{t("tenant.profile.soft", "Soft")}</Badge>}
                />
            </SectionCard>
        </div>
    );
}
