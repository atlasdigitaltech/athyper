"use client";

// tabs/ModulesLimitsTab.tsx — Enabled modules, plan tier, usage

import { FieldRow, PlaceholderBadge, SectionCard } from "../shared";

import type { TenantProfileData } from "../use-tenant-profile";

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/messages-context";

interface ModulesLimitsTabProps {
  data: TenantProfileData;
}

export function ModulesLimitsTab({ data }: ModulesLimitsTabProps) {
  const { t } = useMessages();

  return (
    <div className="space-y-4">
      {/* Enabled Modules */}
      <SectionCard
        title={t("tenant.profile.enabledModules", "Enabled Modules")}
      >
        {data.modules.length > 0 ? (
          <div className="flex flex-wrap gap-2 py-2">
            {data.modules.map((mod) => (
              <Badge key={mod} variant="secondary" className="text-xs">
                {mod}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {t("tenant.profile.noModules", "No modules configured")}
          </p>
        )}
      </SectionCard>

      {/* Plan & Limits */}
      <SectionCard title={t("tenant.profile.planLimits", "Plan & Limits")}>
        <FieldRow
          label={t("tenant.profile.subscriptionTier", "Subscription Tier")}
          value={data.subscriptionTier}
        />
        <FieldRow
          label={t("tenant.profile.usageMetrics", "Usage Metrics")}
          value={<PlaceholderBadge />}
        />
        <FieldRow
          label={t("tenant.profile.rateLimits", "Rate Limits")}
          value={<PlaceholderBadge />}
        />
      </SectionCard>
    </div>
  );
}
