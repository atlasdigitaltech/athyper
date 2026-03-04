"use client";

import { TenantProfilePage } from "@/components/tenant-profile/TenantProfilePage";
import { useMessages } from "@/lib/i18n/messages-context";

export default function TenantSettingsPage() {
  const { t } = useMessages();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">
          {t("tenant.profile.pageTitle", "Tenant Profile")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "tenant.profile.pageDescription",
            "View and manage your organization's profile, configuration, and security settings.",
          )}
        </p>
      </div>
      <TenantProfilePage />
    </div>
  );
}
