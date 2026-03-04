"use client";

// tabs/DomainsSsoTab.tsx — Email domains, SSO config (mostly Phase-2 placeholders)

import { useMessages } from "@/lib/i18n/messages-context";

import { PlaceholderBadge, SectionCard } from "../shared";
import type { TenantProfileData } from "../use-tenant-profile";

interface DomainsSsoTabProps {
    data: TenantProfileData;
}

export function DomainsSsoTab({ data: _data }: DomainsSsoTabProps) {
    const { t } = useMessages();

    return (
        <div className="space-y-4">
            {/* Email Domains */}
            <SectionCard
                title={t("tenant.profile.emailDomains", "Email Domains")}
                description={t("tenant.profile.emailDomainsDesc", "Verified email domains for this tenant.")}
            >
                <div className="flex items-center justify-center py-6">
                    <PlaceholderBadge />
                </div>
            </SectionCard>

            {/* SSO Configuration */}
            <SectionCard
                title={t("tenant.profile.ssoConfig", "SSO Configuration")}
                description={t("tenant.profile.ssoConfigDesc", "Single Sign-On provider settings.")}
            >
                <div className="flex items-center justify-center py-6">
                    <PlaceholderBadge />
                </div>
            </SectionCard>

            <p className="text-center text-sm text-muted-foreground">
                {t("tenant.profile.domainsSsoComingSoon", "Domain and SSO configuration requires BFF integration. Coming soon.")}
            </p>
        </div>
    );
}
