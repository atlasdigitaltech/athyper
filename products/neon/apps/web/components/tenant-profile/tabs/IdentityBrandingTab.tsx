"use client";

// tabs/IdentityBrandingTab.tsx — Display name, logo, theme, locale, timezone

import { useMessages } from "@/lib/i18n/messages-context";

import { FieldRow, PlaceholderBadge, SectionCard } from "../shared";
import type { TenantProfileData } from "../use-tenant-profile";

interface IdentityBrandingTabProps {
    data: TenantProfileData;
}

export function IdentityBrandingTab({ data }: IdentityBrandingTabProps) {
    const { t } = useMessages();

    return (
        <div className="space-y-4">
            {/* Display Identity */}
            <SectionCard title={t("tenant.profile.displayIdentity", "Display Identity")}>
                <FieldRow
                    label={t("tenant.profile.displayName", "Display Name")}
                    value={data.tenantDisplayName}
                />
                <FieldRow
                    label={t("tenant.profile.tenantCode", "Tenant Code")}
                    value={data.tenantId}
                    mono
                    copyable
                />
                <FieldRow
                    label={t("tenant.profile.logo", "Logo")}
                    value={<PlaceholderBadge />}
                />
            </SectionCard>

            {/* Localization & Theme */}
            <SectionCard title={t("tenant.profile.localizationTheme", "Localization & Theme")}>
                <FieldRow
                    label={t("tenant.profile.defaultLocale", "Default Locale")}
                    value={data.locale}
                />
                <FieldRow
                    label={t("tenant.profile.timezone", "Timezone")}
                    value={<PlaceholderBadge />}
                />
                <FieldRow
                    label={t("tenant.profile.themePalette", "Theme / Palette")}
                    value={<PlaceholderBadge />}
                />
            </SectionCard>
        </div>
    );
}
